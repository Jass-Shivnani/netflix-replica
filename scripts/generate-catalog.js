const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RAW_DIR = path.join(__dirname, '..', 'media', 'raw');
const HLS_DIR = path.join(__dirname, '..', 'media', 'hls');
const DATA_DIR = path.join(__dirname, '..', 'data');

if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });
if (!fs.existsSync(HLS_DIR)) fs.mkdirSync(HLS_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const MOVIES = [
  {
    id: 'cyberpunk-2099',
    title: 'Cyberpunk 2099: Neo-Veridia',
    genre: 'Sci-Fi / Cyberpunk',
    year: '2026',
    rating: 'TV-MA',
    duration: '0:30',
    durationSeconds: 30,
    resolution: '1080p Full HD',
    audio: 'Spatial 5.1 AAC',
    description: 'In the high-density megacity of Neo-Veridia, rogue neural algorithms infiltrate the distributed cloud mainframe. A hacker-detective must bypass load-balanced firewalls before total singularity.',
    cast: 'Kenji Sato, Elena Rostova, Marcus Vance',
    director: 'Denis Villeneuve-Sim',
    matchRate: '98% Match',
    tags: ['Mind-Bending', 'Cyberpunk', 'High-Octane', 'Adrenaline'],
    poster: '/assets/posters/cyberpunk.jpg',
    backdrop: '/assets/posters/cyberpunk.jpg',
    filter: 'testsrc2=duration=30:size=1280x720:rate=30',
    audioFreq: 220
  },
  {
    id: 'interstellar-odyssey',
    title: 'Interstellar: Beyond The Event Horizon',
    genre: 'Sci-Fi / Adventure',
    year: '2026',
    rating: 'PG-13',
    duration: '0:36',
    durationSeconds: 36,
    resolution: '4K Ultra HD',
    audio: 'Dolby Atmos 5.1',
    description: 'A deep space reconnaissance expedition travels across cosmic rings and swirling sapphire nebulae to discover an ancient planetary beacon emitting quantum transmission pulses.',
    cast: 'Dr. Joseph Cooper-Smith, Amanda Brand, TARS-9',
    director: 'Christopher Nolan-Sim',
    matchRate: '99% Match',
    tags: ['Cosmic', 'Awe-Inspiring', 'Space Exploration', 'Deep Drama'],
    poster: '/assets/posters/space_odyssey.jpg',
    backdrop: '/assets/posters/space_odyssey.jpg',
    filter: 'mandelbrot=size=1280x720:rate=30:maxiter=120',
    audioFreq: 330
  },
  {
    id: 'silicon-siege',
    title: 'Silicon Siege: Zero-Downtime Protocol',
    genre: 'Tech Thriller',
    year: '2026',
    rating: 'TV-14',
    duration: '0:30',
    durationSeconds: 30,
    resolution: '1080p Full HD',
    audio: '5.1 Surround',
    description: 'When an unprecedented DDoS vector attacks the continent-wide streaming backbone, an elite DevOps team initiates emergency Least-Conn rerouting to survive zero-downtime failover.',
    cast: 'Navya Rangwani, Jass Shivnani, Khushi Sadhuramani',
    director: 'Linus Torvalds-Sim',
    matchRate: '96% Match',
    tags: ['DevOps Thriller', 'Tense', 'High-Stakes', 'VESIT Original'],
    poster: '/assets/posters/cyber_thriller.jpg',
    backdrop: '/assets/posters/cyber_thriller.jpg',
    filter: 'gradients=size=1280x720:rate=30:duration=30:c0=0x0F2027:c1=0x203A43:c2=0x2C5364:speed=0.01',
    audioFreq: 260
  },
  {
    id: 'the-dockerfiles',
    title: 'The Dockerfiles: Container Protocol',
    genre: 'Documentary / ACC Lab',
    year: '2026',
    rating: 'TV-G',
    duration: '0:24',
    durationSeconds: 24,
    resolution: '1080p Full HD',
    audio: 'Stereo AAC',
    description: 'The definitive architectural documentary chronicling the revolution from monolithic bare-metal streaming to microservice orchestration with Docker Compose, NGINX Layer 7 load balancing, and HLS byte-range streaming.',
    cast: 'VESIT D7A Batch 2 Group 5 Engineering Unit',
    director: 'VESIT IT Dept',
    matchRate: '100% Match',
    tags: ['Educational', 'Cloud Native', 'VESIT D7A', 'Benchmark Leader'],
    poster: '/assets/posters/dockerfiles.jpg',
    backdrop: '/assets/posters/dockerfiles.jpg',
    filter: 'smptebars=duration=24:size=1280x720:rate=30',
    audioFreq: 440
  },
  {
    id: 'tokyo-velocity',
    title: 'Tokyo Velocity: Midnight Drift',
    genre: 'Action / Adrenaline',
    year: '2026',
    rating: 'TV-MA',
    duration: '0:30',
    durationSeconds: 30,
    resolution: '1080p Full HD',
    audio: 'Dolby 5.1',
    description: 'Under the neon lights of Shinjuku and Shibuya, modified high-output twin-turbo machines battle on rain-slicked asphalt while an underground telemetry stream broadcasts to millions across distributed nodes.',
    cast: 'Ren Takahashi, Maya Chen, Dominic Torre-Sim',
    director: 'Justin Lin-Sim',
    matchRate: '95% Match',
    tags: ['High Adrenaline', 'Racing', 'Tokyo Nights', 'Action'],
    poster: '/assets/posters/tokyo_velocity.jpg',
    backdrop: '/assets/posters/tokyo_velocity.jpg',
    filter: 'testsrc=duration=30:size=1280x720:rate=30',
    audioFreq: 390
  }
];

console.log('=== STARTING SAMPLE VIDEO GENERATION & HLS TRANSCODING ===');

MOVIES.forEach((movie, index) => {
  const rawPath = path.join(RAW_DIR, `${movie.id}.mp4`);
  const movieHlsDir = path.join(HLS_DIR, movie.id);
  const manifestPath = path.join(movieHlsDir, 'playlist.m3u8');

  if (!fs.existsSync(movieHlsDir)) fs.mkdirSync(movieHlsDir, { recursive: true });

  console.log(`\n[${index + 1}/${MOVIES.length}] Processing: "${movie.title}"`);

  // 1. Generate Raw MP4
  if (!fs.existsSync(rawPath)) {
    console.log(`  -> Generating raw MP4 using FFmpeg...`);
    const genCmd = `ffmpeg -y -f lavfi -i "${movie.filter}" -f lavfi -i "sine=frequency=${movie.audioFreq}:duration=${movie.durationSeconds}" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -b:a 128k -t ${movie.durationSeconds} "${rawPath}"`;
    execSync(genCmd, { stdio: 'ignore' });
    console.log(`  -> Raw MP4 created: ${rawPath}`);
  } else {
    console.log(`  -> Raw MP4 already exists.`);
  }

  // 2. Transcode to HLS (6s segments as per Project Report Section 4.3)
  if (!fs.existsSync(manifestPath)) {
    console.log(`  -> Segmenting into 6-second HLS chunks (-hls_time 6)...`);
    const segmentPattern = path.join(movieHlsDir, 'media_%03d.ts');
    const transcodeCmd = `ffmpeg -y -i "${rawPath}" -codec:v libx264 -codec:a aac -hls_time 6 -hls_playlist_type vod -hls_segment_filename "${segmentPattern}" "${manifestPath}"`;
    execSync(transcodeCmd, { stdio: 'ignore' });
    console.log(`  -> HLS playlist & chunks generated at: ${movieHlsDir}`);
  } else {
    console.log(`  -> HLS segments already exist.`);
  }

  // Count generated chunks
  const chunks = fs.readdirSync(movieHlsDir).filter(f => f.endsWith('.ts'));
  movie.segmentCount = chunks.length;
  movie.streamUrl = `/stream/${movie.id}/playlist.m3u8`;
  console.log(`  -> Chunks: ${chunks.length} segments (.ts) ready for streaming.`);
});

// Save metadata database JSON for API gateway & SQLite sync
const dbData = {
  movies: MOVIES,
  meta: {
    project: 'Dockerized Video Streaming Platform with NGINX Load Balancing',
    institution: 'VESIT - Vivekanand Education Society\'s Institute of Technology',
    class: 'D7A - Batch 2, Group 5',
    team: [
      { name: 'Navya Rangwani', roll: 43 },
      { name: 'Jass Shivnani', roll: 50 },
      { name: 'Khushi Sadhuramani', roll: 44 }
    ],
    updatedAt: new Date().toISOString()
  }
};

const dbFilePath = path.join(DATA_DIR, 'catalog.json');
fs.writeFileSync(dbFilePath, JSON.stringify(dbData, null, 2), 'utf-8');
console.log(`\nCatalog metadata saved to: ${dbFilePath}`);
console.log('=== ALL 5 SAMPLE HLS STREAMS READY! ===\n');
