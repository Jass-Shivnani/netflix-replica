const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;
const INSTANCE_ID = process.env.INSTANCE_ID || 'api-service-1';
const RAW_DIR = process.env.RAW_DIR || path.join(__dirname, '..', '..', 'media', 'raw');
const HLS_DIR = process.env.HLS_DIR || path.join(__dirname, '..', '..', 'media', 'hls');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const QUEUE_FILE = path.join(RAW_DIR, '..', 'transcode-queue.json');

if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });
if (!fs.existsSync(HLS_DIR)) fs.mkdirSync(HLS_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// In-Memory Cache with TTL (simulating Redis 7.0 cache layer)
const cache = new Map();
let cacheHits = 0;
let cacheMisses = 0;
let totalRequests = 0;

// Request metrics
const startTime = Date.now();

app.use(cors());
app.use(express.json());

// Identify replica in HTTP headers
app.use((req, res, next) => {
  totalRequests++;
  res.setHeader('X-Served-By', INSTANCE_ID);
  res.setHeader('X-Service-Type', 'Web-API-Gateway');
  next();
});

// Helper to read/write catalog
function getCatalog() {
  const catalogPath = path.join(DATA_DIR, 'catalog.json');
  if (fs.existsSync(catalogPath)) {
    try {
      return JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
    } catch (e) {
      console.error('Error reading catalog:', e);
    }
  }
  return { movies: [], meta: {} };
}

function saveCatalog(data) {
  const catalogPath = path.join(DATA_DIR, 'catalog.json');
  fs.writeFileSync(catalogPath, JSON.stringify(data, null, 2), 'utf-8');
  cache.delete('catalog'); // Invalidate cache
}

// Helper to get transcode queue
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

// Multer storage for raw video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, RAW_DIR),
  filename: (req, file, cb) => {
    const cleanName = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, cleanName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

// --- ROUTES ---

// Health Check Endpoint (Layer 7 Load Balancer Health Probe)
app.get(['/health', '/api/health'], (req, res) => {
  res.json({
    status: 'healthy',
    service: 'api-gateway',
    instance: INSTANCE_ID,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    totalRequests,
    cacheHitRatio: totalRequests > 0 ? ((cacheHits / (cacheHits + cacheMisses || 1)) * 100).toFixed(1) + '%' : '100%',
    timestamp: new Date().toISOString()
  });
});

// Get Video Catalog (Cached via Redis / In-Memory with TTL)
app.get('/api/videos', (req, res) => {
  const cached = cache.get('catalog');
  if (cached && Date.now() - cached.time < 30000) { // 30s TTL
    cacheHits++;
    res.setHeader('X-Cache', 'HIT');
    return res.json({
      fromCache: true,
      instance: INSTANCE_ID,
      data: cached.data
    });
  }

  cacheMisses++;
  res.setHeader('X-Cache', 'MISS');
  const catalog = getCatalog();
  cache.set('catalog', { time: Date.now(), data: catalog });

  res.json({
    fromCache: false,
    instance: INSTANCE_ID,
    data: catalog
  });
});

// Get Single Video Details
app.get('/api/videos/:id', (req, res) => {
  const catalog = getCatalog();
  const movie = catalog.movies.find(m => m.id === req.params.id);
  if (!movie) {
    return res.status(404).json({ error: 'Video not found', instance: INSTANCE_ID });
  }

  // Check HLS chunk status on disk
  const movieHlsDir = path.join(HLS_DIR, movie.id);
  let chunksOnDisk = 0;
  if (fs.existsSync(movieHlsDir)) {
    chunksOnDisk = fs.readdirSync(movieHlsDir).filter(f => f.endsWith('.ts')).length;
  }

  res.json({
    instance: INSTANCE_ID,
    movie: {
      ...movie,
      chunksOnDisk,
      hlsReady: fs.existsSync(path.join(movieHlsDir, 'playlist.m3u8'))
    }
  });
});

// Video Upload Handler (Creator / Admin Portal)
app.post('/api/videos/upload', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  const title = req.body.title || 'Untitled Upload';
  const genre = req.body.genre || 'Community Upload';
  const description = req.body.description || 'Uploaded via Creator Portal.';
  const id = 'user-' + Date.now().toString(36);

  const rawFilename = req.file.filename;
  const rawFilePath = req.file.path;

  // Register in catalog as "transcoding"
  const catalog = getCatalog();
  const newVideo = {
    id,
    title,
    genre,
    year: new Date().getFullYear().toString(),
    rating: 'NR',
    duration: 'Processing...',
    durationSeconds: 0,
    resolution: 'Pending FFmpeg',
    audio: 'Pending',
    description,
    cast: 'Community Creator',
    director: 'User Upload',
    matchRate: '99% Match',
    tags: ['User Upload', 'Transcoding'],
    poster: '/assets/posters/cyberpunk.jpg',
    backdrop: '/assets/posters/cyberpunk.jpg',
    rawFilename,
    status: 'queued',
    progress: 0,
    streamUrl: `/stream/${id}/playlist.m3u8`,
    createdAt: new Date().toISOString()
  };

  catalog.movies.unshift(newVideo);
  saveCatalog(catalog);

  // Add to Transcoding Queue
  const queue = getQueue();
  queue.push({
    id,
    rawFilename,
    rawFilePath,
    outputHlsDir: path.join(HLS_DIR, id),
    status: 'queued',
    enqueuedAt: new Date().toISOString()
  });
  saveQueue(queue);

  res.status(202).json({
    message: 'Upload successful! Video added to transcoding queue.',
    instance: INSTANCE_ID,
    video: newVideo
  });
});

// Check Transcoding Status Endpoint
app.get('/api/transcode/status/:id', (req, res) => {
  const catalog = getCatalog();
  const video = catalog.movies.find(m => m.id === req.params.id);
  if (!video) {
    return res.status(404).json({ error: 'Video not found' });
  }

  const movieHlsDir = path.join(HLS_DIR, req.params.id);
  const isComplete = fs.existsSync(path.join(movieHlsDir, 'playlist.m3u8'));
  let chunkCount = 0;
  if (fs.existsSync(movieHlsDir)) {
    chunkCount = fs.readdirSync(movieHlsDir).filter(f => f.endsWith('.ts')).length;
  }

  res.json({
    id: video.id,
    status: isComplete ? 'ready' : video.status || 'processing',
    progress: video.progress || (isComplete ? 100 : Math.min(95, chunkCount * 20)),
    chunksGenerated: chunkCount,
    streamUrl: `/stream/${video.id}/playlist.m3u8`
  });
});

// User Profiles
app.get('/api/auth/profile', (req, res) => {
  res.json({
    user: {
      name: 'Jass Shivnani',
      roll: 50,
      role: 'DevOps & Streaming Lead',
      class: 'D7A • Batch 2, Group 5',
      team: [
        { name: 'Navya Rangwani', roll: 43 },
        { name: 'Jass Shivnani', roll: 50 },
        { name: 'Khushi Sadhuramani', roll: 44 }
      ],
      institution: 'VESIT',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'
    }
  });
});

app.listen(PORT, () => {
  console.log(`[${INSTANCE_ID}] API Gateway listening on port ${PORT}`);
});
