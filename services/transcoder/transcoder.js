const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const RAW_DIR = process.env.RAW_DIR || path.join(__dirname, '..', '..', 'media', 'raw');
const HLS_DIR = process.env.HLS_DIR || path.join(__dirname, '..', '..', 'media', 'hls');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const QUEUE_FILE = path.join(RAW_DIR, '..', 'transcode-queue.json');

console.log('[Transcoder Worker] Started FFmpeg asynchronous daemon...');
console.log(`[Transcoder Worker] Watching queue at: ${QUEUE_FILE}`);
console.log(`[Transcoder Worker] Output directory: ${HLS_DIR}`);

let isProcessing = false;

function getQueue() {
  if (fs.existsSync(QUEUE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
    } catch (e) {}
  }
  return [];
}

function saveQueue(queue) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf-8');
}

function getCatalog() {
  const catalogPath = path.join(DATA_DIR, 'catalog.json');
  if (fs.existsSync(catalogPath)) {
    try {
      return JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
    } catch (e) {}
  }
  return { movies: [] };
}

function saveCatalog(catalog) {
  const catalogPath = path.join(DATA_DIR, 'catalog.json');
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf-8');
}

async function processJob(job) {
  isProcessing = true;
  console.log(`\n>>> [Transcoder] Ingesting Job: ${job.id} (${job.rawFilename})`);

  const outputDir = path.join(HLS_DIR, job.id);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const manifestPath = path.join(outputDir, 'playlist.m3u8');
  const segmentPattern = path.join(outputDir, 'media_%03d.ts');
  const thumbnailPath = path.join(outputDir, 'thumbnail.jpg');

  // Exact FFmpeg HLS segmentation command from Section 4.3 of Report
  // ffmpeg -i input.mp4 -codec:v libx264 -codec:a aac -hls_time 6 -hls_playlist_type vod -hls_segment_filename "media_%03d.ts" playlist.m3u8
  const ffmpegArgs = [
    '-y',
    '-i', job.rawFilePath,
    '-codec:v', 'libx264',
    '-preset', 'veryfast',
    '-codec:a', 'aac',
    '-b:a', '128k',
    '-hls_time', '6',
    '-hls_playlist_type', 'vod',
    '-hls_segment_filename', segmentPattern,
    manifestPath
  ];

  console.log(`>>> [Transcoder] Executing: ffmpeg ${ffmpegArgs.join(' ')}`);

  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ffmpegArgs);

    proc.stderr.on('data', (data) => {
      const msg = data.toString();
      // Parse frame info or segment info
      if (msg.includes('Opening') && msg.includes('.ts')) {
        console.log(`[Transcoder] Generated chunk: ${msg.trim()}`);
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`>>> [Transcoder] Transcoding completed for ${job.id}!`);

        // Generate poster thumbnail
        try {
          const thumbProc = spawn('ffmpeg', [
            '-y',
            '-ss', '00:00:05',
            '-i', job.rawFilePath,
            '-vframes', '1',
            '-update', '1',
            '-q:v', '2',
            thumbnailPath
          ]);
          thumbProc.on('close', () => {
            console.log(`[Transcoder] Thumbnail generated: ${thumbnailPath}`);
          });
        } catch (e) {}

        // Update catalog entry to "ready"
        const catalog = getCatalog();
        const movie = catalog.movies.find(m => m.id === job.id);
        const chunkCount = fs.readdirSync(outputDir).filter(f => f.endsWith('.ts')).length;

        if (movie) {
          const totalSecs = chunkCount * 6;
          const mins = Math.floor(totalSecs / 60);
          const secs = totalSecs % 60;
          movie.status = 'ready';
          movie.progress = 100;
          movie.segmentCount = chunkCount;
          movie.duration = `${mins}:${String(secs).padStart(2, '0')}`;
          movie.durationSeconds = totalSecs;
          movie.resolution = '1080p Full HD';
          movie.poster = `/stream/${job.id}/thumbnail.jpg`;
          movie.backdrop = `/stream/${job.id}/thumbnail.jpg`;
          movie.streamUrl = `/stream/${job.id}/playlist.m3u8`;
          saveCatalog(catalog);
        }

        resolve();
      } else {
        console.error(`>>> [Transcoder] FFmpeg exited with error code ${code}`);
        const catalog = getCatalog();
        const movie = catalog.movies.find(m => m.id === job.id);
        if (movie) {
          movie.status = 'error';
          saveCatalog(catalog);
        }
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
      isProcessing = false;
    });
  });
}

// Polling daemon loop
setInterval(async () => {
  if (isProcessing) return;

  const queue = getQueue();
  const nextJobIndex = queue.findIndex(j => j.status === 'queued');

  if (nextJobIndex !== -1) {
    const job = queue[nextJobIndex];
    job.status = 'processing';
    job.startedAt = new Date().toISOString();
    saveQueue(queue);

    try {
      await processJob(job);
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
    } catch (err) {
      job.status = 'failed';
      job.error = err.message;
    }
    saveQueue(queue);
  }
}, 3000);
