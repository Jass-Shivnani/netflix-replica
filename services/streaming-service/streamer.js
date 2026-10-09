const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;
const INSTANCE_ID = process.env.INSTANCE_ID || 'stream-service-1';
const HLS_DIR = process.env.HLS_DIR || path.join(__dirname, '..', '..', 'media', 'hls');

let activeConnections = 0;
let totalChunksServed = 0;
let totalBytesTransferred = 0;
const startTime = Date.now();

app.use(cors({
  origin: '*',
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'X-Served-By', 'X-Active-Connections', 'X-Chunk-Index']
}));

// Replica Identification & Active Connection Tracking Middleware
app.use((req, res, next) => {
  activeConnections++;
  res.setHeader('X-Served-By', INSTANCE_ID);
  res.setHeader('X-Active-Connections', activeConnections.toString());
  res.setHeader('Accept-Ranges', 'bytes');

  const onFinished = () => {
    activeConnections = Math.max(0, activeConnections - 1);
    res.removeListener('finish', onFinished);
    res.removeListener('close', onFinished);
  };
  res.on('finish', onFinished);
  res.on('close', onFinished);

  next();
});

// Health Check Endpoint (Probed by NGINX Load Balancer upstream)
app.get(['/health', '/stream/health'], (req, res) => {
  res.json({
    status: 'healthy',
    service: 'streaming-service',
    instance: INSTANCE_ID,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    activeConnections,
    totalChunksServed,
    totalBytesTransferredMB: (totalBytesTransferred / (1024 * 1024)).toFixed(2),
    timestamp: new Date().toISOString()
  });
});

// Stream Stats endpoint
app.get(['/stats', '/stream/stats'], (req, res) => {
  res.json({
    instance: INSTANCE_ID,
    activeConnections,
    totalChunksServed,
    totalBytesTransferred
  });
});

// HLS Manifest / Playlist Route (.m3u8)
app.get(['/stream/:id/playlist.m3u8', '/:id/playlist.m3u8'], (req, res) => {
  const videoId = req.params.id;
  const manifestPath = path.join(HLS_DIR, videoId, 'playlist.m3u8');

  if (!fs.existsSync(manifestPath)) {
    return res.status(404).json({ error: `HLS manifest not found for video: ${videoId}` });
  }

  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const stream = fs.createReadStream(manifestPath);
  stream.pipe(res);
});

// HLS Segment Route (.ts chunk delivery)
app.get(['/stream/:id/:segment', '/:id/:segment'], (req, res) => {
  const { id, segment } = req.params;

  // Sanitize filename to prevent directory traversal
  const safeSegment = path.basename(segment);
  const segmentPath = path.join(HLS_DIR, id, safeSegment);

  if (!fs.existsSync(segmentPath)) {
    return res.status(404).json({ error: `Segment not found: ${safeSegment}` });
  }

  const stat = fs.statSync(segmentPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  res.setHeader('Content-Type', 'video/mp2t');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Chunk-Name', safeSegment);

  totalChunksServed++;

  // Byte-Range handling for media players
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;

    totalBytesTransferred += chunksize;

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', chunksize);

    const fileStream = fs.createReadStream(segmentPath, { start, end });
    fileStream.pipe(res);
  } else {
    totalBytesTransferred += fileSize;
    res.setHeader('Content-Length', fileSize);
    const fileStream = fs.createReadStream(segmentPath);
    fileStream.pipe(res);
  }
});

app.listen(PORT, () => {
  console.log(`[${INSTANCE_ID}] HLS Streaming Service listening on port ${PORT}`);
});
