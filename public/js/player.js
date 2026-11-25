let hlsInstance = null;
let currentVideoId = null;
let chunksLoadedCount = 0;
let activeEdgeIndex = 0;
let edgeFailoverInProgress = false;
let failoverBannerTimer = null;

// Multi-Laptop / Multi-Edge URL Discovery (?edges=http://ip1,http://ip2 or localStorage)
function getConfiguredEdges() {
  const params = new URLSearchParams(window.location.search);
  const queryEdges = params.get('edges');
  if (queryEdges) {
    const parsed = queryEdges.split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
    if (parsed.length > 0) {
      localStorage.setItem('netflix_edge_regions', JSON.stringify(parsed));
      return parsed;
    }
  }
  try {
    const saved = JSON.parse(localStorage.getItem('netflix_edge_regions') || '[]');
    if (Array.isArray(saved) && saved.length > 0) {
      return saved;
    }
  } catch (e) {}
  return [window.location.origin];
}

function getActiveEdgeUrl() {
  const edges = getConfiguredEdges();
  return edges[activeEdgeIndex % edges.length] || window.location.origin;
}

function showFailoverBanner(msg, isWarning = false) {
  const banner = document.getElementById('edge-failover-banner');
  if (!banner) return;
  banner.style.display = 'block';
  banner.style.background = isWarning ? 'rgba(255, 171, 0, 0.95)' : 'rgba(0, 230, 118, 0.95)';
  banner.innerText = msg;
  clearTimeout(failoverBannerTimer);
  failoverBannerTimer = setTimeout(() => {
    banner.style.display = 'none';
  }, 6000);
}

const videoElement = document.getElementById('video-element');
const playerModal = document.getElementById('player-modal');
const statsHud = document.getElementById('stats-hud');
const progressBar = document.getElementById('player-progress-filled');
const bufferBar = document.getElementById('player-progress-buffer');
const timeDisplay = document.getElementById('time-display');
const btnPlayPause = document.getElementById('btn-play-pause');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');

// Launch Player with specified Video ID
function playMovie(id) {
  currentVideoId = id;
  activeEdgeIndex = 0;
  const movie = (catalogData.movies || []).find(m => m.id === id);

  document.getElementById('player-video-title').innerText = movie ? movie.title : 'HLS Adaptive Stream';
  document.getElementById('player-video-meta').innerText = `${movie ? movie.genre : 'VOD'} • 6s Segments • Multi-Edge Ready`;

  playerModal.classList.add('active');
  document.body.style.overflow = 'hidden';

  const edgeBase = getActiveEdgeUrl();
  const streamUrl = `${edgeBase}/stream/${id}/playlist.m3u8`;
  updateEdgeHudLabel(edgeBase);
  initHlsPlayer(streamUrl, 0);
}

function updateEdgeHudLabel(edgeBase) {
  const edges = getConfiguredEdges();
  const hostText = edgeBase.replace(/^https?:\/\//, '');
  const hudEdge = document.getElementById('hud-edge-host');
  if (hudEdge) {
    hudEdge.innerText = `${hostText} (Edge ${activeEdgeIndex + 1}/${edges.length})`;
  }
}

// Close Cinema Player
function closePlayer() {
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
  videoElement.pause();
  videoElement.removeAttribute('src');
  videoElement.load();

  playerModal.classList.remove('active');
  document.body.style.overflow = '';
  chunksLoadedCount = 0;
}

// Failover to Backup Laptop / Edge Region seamlessly at exact timestamp
function triggerEdgeFailover(reason = 'Primary Edge Timeout') {
  const edges = getConfiguredEdges();
  if (edges.length <= 1) {
    showFailoverBanner('Add a 2nd Laptop IP in Topology -> Mobile QR Connect to enable Multi-Laptop Failover!', true);
    return false;
  }
  if (edgeFailoverInProgress || !currentVideoId) return false;
  edgeFailoverInProgress = true;

  const oldEdge = edges[activeEdgeIndex % edges.length];
  activeEdgeIndex = (activeEdgeIndex + 1) % edges.length;
  const newEdge = edges[activeEdgeIndex];
  const resumeAt = Math.max(0, videoElement.currentTime || 0);

  console.warn(`[Edge Failover] ${reason}: switching ${oldEdge} -> ${newEdge} @ ${resumeAt.toFixed(1)}s`);
  updateEdgeHudLabel(newEdge);
  showFailoverBanner(`⚡ FAILOVER (${reason}): ${oldEdge.replace(/^https?:\/\//, '')} → ${newEdge.replace(/^https?:\/\//, '')} @ ${formatTime(resumeAt)}`);

  const newUrl = `${newEdge}/stream/${currentVideoId}/playlist.m3u8`;
  initHlsPlayer(newUrl, resumeAt);

  setTimeout(() => { edgeFailoverInProgress = false; }, 2000);
  return true;
}

// Initialize HLS.js with telemetry & fast multi-laptop failover
function initHlsPlayer(streamUrl, resumeTime = 0) {
  if (hlsInstance) {
    hlsInstance.destroy();
  }

  if (resumeTime === 0) {
    chunksLoadedCount = 0;
    document.getElementById('hud-chunks-loaded').innerText = '0';
  }

  if (Hls.isSupported()) {
    hlsInstance = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      startPosition: resumeTime > 0 ? resumeTime : -1,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      manifestLoadingTimeOut: 3000,
      manifestLoadingMaxRetry: 0,
      fragLoadingTimeOut: 3500,
      fragLoadingMaxRetry: 1,
      xhrSetup: (xhr, url) => {
        xhr.addEventListener('load', () => {
          const replica = xhr.getResponseHeader('x-served-by');
          if (replica) {
            updateTelemetryHudReplica(replica, url);
          }
        });
      }
    });

    hlsInstance.loadSource(streamUrl);
    hlsInstance.attachMedia(videoElement);

    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      console.log(`[HLS Player] Manifest loaded from ${getActiveEdgeUrl()}. Resume @ ${resumeTime.toFixed(1)}s`);
      if (resumeTime > 0) {
        videoElement.currentTime = resumeTime;
      }
      videoElement.play().catch(e => console.log('Autoplay deferred:', e));
      updatePlayPauseIcons(false);
    });

    // Fragment (Chunk) Loading Event
    hlsInstance.on(Hls.Events.FRAG_LOADED, (event, data) => {
      chunksLoadedCount++;
      const frag = data.frag;
      const stats = data.stats;
      const latency = Math.round(stats.loading.end - stats.loading.start);
      const sizeKB = (stats.total / 1024).toFixed(1);

      document.getElementById('hud-chunks-loaded').innerText = chunksLoadedCount;
      document.getElementById('hud-chunk').innerText = frag.relurl || `media_${String(frag.sn).padStart(3, '0')}.ts`;
      document.getElementById('hud-chunk-size').innerText = `${sizeKB} KB`;
      document.getElementById('hud-chunk-latency').innerText = `${latency} ms`;

      const latEl = document.getElementById('hud-chunk-latency');
      latEl.style.color = '#00e676';
      setTimeout(() => { latEl.style.color = ''; }, 600);
    });

    hlsInstance.on(Hls.Events.ERROR, (event, data) => {
      console.warn('[HLS Error]', data);
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR && getConfiguredEdges().length > 1) {
        const switched = triggerEdgeFailover('Edge Node Offline');
        if (switched) return;
      }
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.log('Network error, attempting recovery...');
            hlsInstance.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.log('Media error, attempting recovery...');
            hlsInstance.recoverMediaError();
            break;
          default:
            closePlayer();
            break;
        }
      }
    });

  } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
    // Native iOS Safari HLS Support + Multi-Edge Failover
    videoElement.src = streamUrl;
    videoElement.addEventListener('loadedmetadata', () => {
      if (resumeTime > 0) videoElement.currentTime = resumeTime;
      videoElement.play();
    }, { once: true });
    videoElement.onerror = () => {
      triggerEdgeFailover('Safari Stream Timeout');
    };
  }
}

// Update Telemetry HUD with replica info
function updateTelemetryHudReplica(replica, url) {
  const replicaBadge = document.getElementById('player-replica-badge');
  const hudReplica = document.getElementById('hud-replica');
  
  if (replicaBadge) replicaBadge.innerText = `Served by: ${replica}`;
  if (hudReplica) hudReplica.innerText = replica;

  // Flash badge to show active load balancing in action!
  if (replicaBadge) {
    replicaBadge.style.borderColor = 'var(--accent-cyan)';
    setTimeout(() => {
      replicaBadge.style.borderColor = '';
    }, 400);
  }
}

// Update Video Progress & Buffer bars
videoElement.addEventListener('timeupdate', () => {
  if (!videoElement.duration) return;

  const current = videoElement.currentTime;
  const total = videoElement.duration;
  const pct = (current / total) * 100;
  progressBar.style.width = `${pct}%`;

  // Time label
  timeDisplay.innerText = `${formatTime(current)} / ${formatTime(total)}`;

  // Buffer health
  if (videoElement.buffered.length > 0) {
    const bufferedEnd = videoElement.buffered.end(videoElement.buffered.length - 1);
    const bufferPct = (bufferedEnd / total) * 100;
    bufferBar.style.width = `${bufferPct}%`;
    const ahead = Math.max(0, bufferedEnd - current).toFixed(1);
    document.getElementById('hud-buffer').innerText = `${ahead} s`;
  }
});

videoElement.addEventListener('play', () => updatePlayPauseIcons(false));
videoElement.addEventListener('pause', () => updatePlayPauseIcons(true));
videoElement.addEventListener('ended', () => updatePlayPauseIcons(true));

function updatePlayPauseIcons(isPaused) {
  if (isPaused) {
    iconPlay.style.display = 'block';
    iconPause.style.display = 'none';
  } else {
    iconPlay.style.display = 'none';
    iconPause.style.display = 'block';
  }
}

function togglePlayPause() {
  if (videoElement.paused) {
    videoElement.play();
  } else {
    videoElement.pause();
  }
}

function seekVideo(e) {
  const rect = document.getElementById('player-progress-bar').getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const width = rect.width;
  const seekPct = clickX / width;
  if (videoElement.duration) {
    videoElement.currentTime = seekPct * videoElement.duration;
  }
}

function toggleMute() {
  videoElement.muted = !videoElement.muted;
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.getElementById('video-wrapper').requestFullscreen().catch(e => console.log(e));
  } else {
    document.exitFullscreen();
  }
}

function toggleStatsHud() {
  statsHud.classList.toggle('active');
}

function formatTime(seconds) {
  if (isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Global Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  if (!playerModal.classList.contains('active')) return;
  if (e.key === 'Escape') closePlayer();
  if (e.key === ' ' || e.key === 'k') { e.preventDefault(); togglePlayPause(); }
  if (e.key === 'm') toggleMute();
  if (e.key === 'f') toggleFullscreen();
  if (e.key === 's') toggleStatsHud();
});
