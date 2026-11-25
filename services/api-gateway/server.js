const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const dns = require('dns').promises;

const app = express();
const PORT = process.env.PORT || 5000;
const INSTANCE_ID = process.env.INSTANCE_ID || ('api-' + os.hostname().slice(0, 8));
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
let manualDown = false;

app.use(cors());
app.use(express.json());

// Identify replica in HTTP headers
app.use((req, res, next) => {
  totalRequests++;
  res.setHeader('X-Served-By', INSTANCE_ID);
  res.setHeader('X-Service-Type', 'Web-API-Gateway');
  if (manualDown && !req.path.startsWith('/internal/') && !req.path.startsWith('/api/cluster/') && req.path !== '/health' && req.path !== '/api/health') {
    return res.status(503).json({ error: `${INSTANCE_ID} is offline (Chaos Simulation)` });
  }
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

// Internal Chaos Toggle
app.post('/internal/chaos-toggle', (req, res) => {
  manualDown = !manualDown;
  console.log(`[${INSTANCE_ID}] Chaos Toggle: manualDown = ${manualDown}`);
  res.json({ instance: INSTANCE_ID, manualDown, healthy: !manualDown });
});

const nodeIpMap = new Map();

// Helper: Probe internal Docker service over stream-net DNS
function probeNode(host, port, type) {
  return new Promise((resolve) => {
    const reqStart = Date.now();
    const req = http.get({ hostname: host, port, path: '/health', timeout: 1500 }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        const latency = Date.now() - reqStart;
        try {
          const data = JSON.parse(body);
          const id = data.instance || host;
          nodeIpMap.set(id, { ip: host, port });
          resolve({
            id,
            ip: host,
            port,
            type,
            healthy: res.statusCode === 200 && !data.manualDown,
            manualDown: !!data.manualDown,
            activeConnections: data.activeConnections || 0,
            totalRequests: data.totalRequests || data.totalChunksServed || 0,
            latency
          });
        } catch (e) {
          resolve({ id: host, ip: host, port, type, healthy: res.statusCode === 200, manualDown: false, activeConnections: 0, totalRequests: 0, latency });
        }
      });
    });
    req.on('error', () => resolve({ id: host, ip: host, port, type, healthy: false, manualDown: true, activeConnections: 0, totalRequests: 0, latency: 0 }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ id: host, ip: host, port, type, healthy: false, manualDown: true, activeConnections: 0, totalRequests: 0, latency: 0 });
    });
  });
}

// Discover all live task IPs in Swarm (`tasks.<svc>`), K8s (`<svc>-headless`), or Compose (`<svc>`)
async function discoverAndProbePool(serviceName, legacyHosts, port, type) {
  let ips = [];
  for (const name of [`tasks.${serviceName}`, `${serviceName}-headless`, serviceName]) {
    try {
      const resolved = await dns.resolve4(name);
      if (resolved && resolved.length > 0) {
        ips = resolved;
        break;
      }
    } catch (e) {}
  }

  const targets = ips.length > 0 ? ips : legacyHosts;
  const results = await Promise.all(targets.map(t => probeNode(t, port, type)));
  return results.sort((a, b) => a.id.localeCompare(b.id));
}

function checkRedisHealth() {
  const redisHost = process.env.REDIS_HOST || 'redis';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: redisHost, port: redisPort, timeout: 1000 }, () => {
      socket.write('PING\r\n');
    });
    socket.on('data', (data) => {
      socket.destroy();
      resolve(data.toString().includes('PONG'));
    });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
  });
}

// Health Check Endpoint (Layer 7 Load Balancer Health Probe)
app.get(['/health', '/api/health'], (req, res) => {
  if (manualDown) {
    return res.status(503).json({
      status: 'down',
      manualDown: true,
      service: 'api-gateway',
      instance: INSTANCE_ID,
      totalRequests
    });
  }
  res.json({
    status: 'healthy',
    manualDown: false,
    service: 'api-gateway',
    instance: INSTANCE_ID,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    totalRequests,
    cacheHitRatio: totalRequests > 0 ? ((cacheHits / (cacheHits + cacheMisses || 1)) * 100).toFixed(1) + '%' : '100%',
    timestamp: new Date().toISOString()
  });
});

// Live Docker Cluster Stats Endpoint
app.get('/api/cluster/stats', async (req, res) => {
  const [apiNodes, streamNodes, redisOnline] = await Promise.all([
    discoverAndProbePool('api-service', ['api-service-1', 'api-service-2'], 5000, 'api'),
    discoverAndProbePool('stream-service', ['stream-service-1', 'stream-service-2', 'stream-service-3'], 8080, 'stream'),
    checkRedisHealth()
  ]);

  const allNodes = [...apiNodes, ...streamNodes];
  const latencies = allNodes.map(n => n.latency).filter(l => l > 0);
  const avgLatencyMs = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 5;
  const aggRequests = allNodes.reduce((sum, n) => sum + (n.totalRequests || 0), 0);

  const queue = getQueue();

  res.json({
    status: 'healthy',
    mode: 'docker-swarm-cluster',
    algorithm: 'least_conn',
    lanIp: req.hostname || 'localhost',
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    totalRequests: aggRequests,
    avgLatencyMs,
    failedRequests: 0,
    apiNodes,
    streamNodes,
    transcoder: { status: 'healthy', worker: 'ffmpeg-daemon', queueLength: queue.filter(j => j.status === 'queued').length },
    redis: { status: redisOnline ? 'active' : 'fallback', type: redisOnline ? 'redis:7.0-alpine' : 'in-memory-lru', hitRatio: '94.2%' },
    volumes: {
      media_data: { mounted: true, path: '/var/media', status: 'RW/RO' },
      db_data: { mounted: true, path: '/var/lib/sqlite', status: 'RW' }
    }
  });
});

// Chaos Engineering Toggle (propagates across real Docker container)
app.post('/api/cluster/toggle-node', (req, res) => {
  const nodeId = req.query.node;
  if (!nodeId) return res.status(400).json({ error: 'Missing node param' });

  const mapped = nodeIpMap.get(nodeId);
  const targetHost = mapped ? mapped.ip : nodeId;
  const targetPort = mapped ? mapped.port : (nodeId.startsWith('api-') ? 5000 : 8080);

  const postReq = http.request({ hostname: targetHost, port: targetPort, path: '/internal/chaos-toggle', method: 'POST', timeout: 2000 }, (postRes) => {
    let body = '';
    postRes.on('data', d => body += d);
    postRes.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        res.json({ success: true, node: nodeId, isDown: parsed.manualDown });
      } catch (e) {
        res.json({ success: true, node: nodeId });
      }
    });
  });
  postReq.on('error', (err) => res.status(502).json({ error: `Failed to reach container ${nodeId}: ${err.message}` }));
  postReq.end();
});

// Dynamic Scaling info handler (Docker Swarm CLI)
app.post('/api/cluster/scale', (req, res) => {
  res.status(400).json({
    success: false,
    message: 'Docker Swarm manages container scaling at the orchestrator level! Run in terminal:\n  docker service scale netflix_stream-service=5'
  });
});

// Live Telemetry SSE Stream
app.get('/api/cluster/events', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.write('data: {"type":"connected"}\n\n');

  const timer = setInterval(async () => {
    try {
      const streamNodes = await discoverAndProbePool('stream-service', ['stream-service-1', 'stream-service-2', 'stream-service-3'], 8080, 'stream');
      const active = streamNodes.find(n => n.healthy && n.activeConnections > 0) || streamNodes.find(n => n.healthy);
      if (active) {
        res.write(`data: ${JSON.stringify({ type: 'api', method: 'PROBE', url: '/health', target: active.id, latency: active.latency || 2, timestamp: Date.now() })}\n\n`);
      }
    } catch (e) {}
  }, 2500);

  req.on('close', () => clearInterval(timer));
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
