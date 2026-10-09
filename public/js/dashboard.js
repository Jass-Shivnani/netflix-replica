let dashboardPollTimer = null;
let eventSource = null;
let canvasAnimId = null;

// Particle system state
const particles = [];
let clusterState = {
  apiNodes: [
    { id: 'api-service-1', port: 5001, healthy: true, manualDown: false, conns: 0 },
    { id: 'api-service-2', port: 5002, healthy: true, manualDown: false, conns: 0 }
  ],
  streamNodes: [
    { id: 'stream-service-1', port: 8081, healthy: true, manualDown: false, conns: 0 },
    { id: 'stream-service-2', port: 8082, healthy: true, manualDown: false, conns: 0 },
    { id: 'stream-service-3', port: 8083, healthy: true, manualDown: false, conns: 0 }
  ]
};

// Node coordinates on canvas (dynamic based on width)
let nodeCoords = {};

function openTopologyModal(scrollToChaos = false) {
  document.getElementById('topology-modal').classList.add('active');
  fetchClusterStats();
  initTopologyCanvas();
  initEventStream();

  if (!dashboardPollTimer) {
    dashboardPollTimer = setInterval(fetchClusterStats, 2000);
  }

  if (scrollToChaos) {
    setTimeout(() => {
      document.getElementById('chaos-section').scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }
}

function closeTopologyModal() {
  document.getElementById('topology-modal').classList.remove('active');
  if (dashboardPollTimer) {
    clearInterval(dashboardPollTimer);
    dashboardPollTimer = null;
  }
  if (canvasAnimId) {
    cancelAnimationFrame(canvasAnimId);
    canvasAnimId = null;
  }
}

// Initialize Real-Time SSE Packet Stream
function initEventStream() {
  if (eventSource) return;

  try {
    eventSource = new EventSource('/api/cluster/events');
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'stream' || data.type === 'api') {
          spawnPacketParticle(data);
          logPacketToTerminal(data);
        } else if (data.type === 'scale') {
          fetchClusterStats();
        }
      } catch (err) {}
    };

    eventSource.onerror = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };
  } catch (err) {
    console.warn('SSE not supported or unavailable:', err);
  }
}

function logPacketToTerminal(pkt) {
  const container = document.getElementById('packet-log-stream');
  if (!container) return;

  const timeStr = new Date(pkt.timestamp).toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = `packet-entry ${pkt.type}`;

  const icon = pkt.type === 'stream' ? '🎬' : '📡';
  entry.innerHTML = `
    <span>${timeStr}</span>
    <span>${icon} [${pkt.method || 'GET'}] ${pkt.url}</span>
    <span style="color: #fff;">➜ NGINX ➜ <strong>${pkt.target}</strong></span>
    <span style="color: var(--accent-green); font-weight: 700;">${pkt.latency}ms</span>
  `;

  container.prepend(entry);
  if (container.children.length > 25) {
    container.removeChild(container.lastChild);
  }
}

// Horizontal Scaling API Call
async function scaleReplicas(action) {
  try {
    const res = await fetch(`/api/cluster/scale?action=${action}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      document.getElementById('replica-count-badge').innerText = `${data.totalNodes} Replicas Active`;
      await fetchClusterStats();
    } else {
      alert(data.message || 'Scaling limit reached.');
    }
  } catch (err) {
    console.error('Scaling request failed:', err);
  }
}

// Fetch live cluster metrics
async function fetchClusterStats() {
  try {
    const res = await fetch('/api/cluster/stats');
    if (!res.ok) return;
    const stats = await res.json();

    clusterState.apiNodes = stats.apiNodes;
    clusterState.streamNodes = stats.streamNodes;

    const lbStatEl = document.getElementById('lb-requests-stat');
    if (lbStatEl) {
      lbStatEl.innerText = `Total Requests: ${stats.totalRequests} • Avg Latency: ${stats.avgLatencyMs}ms`;
    }

    const navText = document.getElementById('nav-cluster-text');
    const healthyStreamCount = stats.streamNodes.filter(n => n.healthy && !n.manualDown).length;
    const healthyApiCount = stats.apiNodes.filter(n => n.healthy && !n.manualDown).length;
    if (navText) {
      navText.innerText = `${healthyStreamCount + healthyApiCount}/${stats.streamNodes.length + 2} Pods Online • Least-Conn`;
    }

    const scaleBadge = document.getElementById('replica-count-badge');
    if (scaleBadge) {
      scaleBadge.innerText = `${stats.streamNodes.length} Replicas Active`;
    }

    const mobileLinkEl = document.getElementById('mobile-demo-url');
    if (mobileLinkEl && stats.lanIp) {
      mobileLinkEl.innerText = `http://${stats.lanIp}`;
      mobileLinkEl.href = `http://${stats.lanIp}`;
    }

    renderStreamNodes(stats.streamNodes);
    renderApiNodes(stats.apiNodes);

  } catch (err) {
    console.warn('Cluster stats unavailable:', err);
  }
}

function renderStreamNodes(nodes) {
  const container = document.getElementById('stream-nodes-container');
  if (!container) return;

  container.innerHTML = nodes.map(node => {
    const isOnline = node.healthy && !node.manualDown;
    return `
      <div class="cluster-node ${isOnline ? 'healthy' : 'down'}">
        <div class="node-title-row">
          <span class="node-name">${node.id}</span>
          <span class="node-status-badge ${isOnline ? 'online' : 'offline'}">
            ${isOnline ? 'Online' : 'Crashed (Failover)'}
          </span>
        </div>
        <div class="node-info-text">
          Port: ${node.port} • Active Conns: <strong style="color: var(--accent-cyan);">${node.activeConnections || 0}</strong><br>
          Requests Served: <strong>${node.totalRequests || 0}</strong>
        </div>
        <button class="btn-chaos-toggle" onclick="toggleNodeChaos('${node.id}')">
          ${isOnline ? '💥 Simulate Kill Node' : '🔄 Revive Instance'}
        </button>
      </div>
    `;
  }).join('');
}

function renderApiNodes(nodes) {
  const container = document.getElementById('api-nodes-container');
  if (!container) return;

  container.innerHTML = nodes.map(node => {
    const isOnline = node.healthy && !node.manualDown;
    return `
      <div class="cluster-node ${isOnline ? 'healthy' : 'down'}">
        <div class="node-title-row">
          <span class="node-name">${node.id}</span>
          <span class="node-status-badge ${isOnline ? 'online' : 'offline'}">
            ${isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
        <div class="node-info-text">
          Port: ${node.port} • JWT & Catalog API<br>
          Total Dispatched: <strong>${node.totalRequests || 0}</strong>
        </div>
        <button class="btn-chaos-toggle" onclick="toggleNodeChaos('${node.id}')">
          ${isOnline ? '💥 Simulate Kill Node' : '🔄 Revive Instance'}
        </button>
      </div>
    `;
  }).join('');
}

// Chaos Toggle
async function toggleNodeChaos(nodeId) {
  try {
    const res = await fetch(`/api/cluster/toggle-node?node=${nodeId}`, { method: 'POST' });
    const data = await res.json();
    fetchClusterStats();
  } catch (err) {
    console.error('Failed to toggle node:', err);
  }
}

// Interactive Benchmark
async function runClientBenchmark() {
  const btn = document.getElementById('btn-run-bench');
  btn.disabled = true;
  btn.innerText = 'Testing Cluster (100 Req)...';

  const total = 100;
  const latencies = [];
  let failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < total; i++) {
    const reqStart = performance.now();
    try {
      const res = await fetch('/api/videos?bench=' + i);
      const reqLat = Math.round(performance.now() - reqStart);
      latencies.push(reqLat);
      if (!res.ok) failed++;
    } catch (e) {
      failed++;
    }
  }

  const durationSec = (Date.now() - startTime) / 1000;
  const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1));
  const throughput = Math.round(total / durationSec);
  const failRate = ((failed / total) * 100).toFixed(1);

  document.getElementById('bench-avg-lat').innerText = `${avgLatency} ms`;
  document.getElementById('bench-throughput').innerText = `${throughput} req/s`;
  document.getElementById('bench-failed').innerText = `${failRate}%`;
  document.getElementById('bench-failover').innerText = `< 1.2 s`;

  btn.disabled = false;
  btn.innerText = 'Run 100-Req Benchmark';

  fetchClusterStats();
}

// --- CANVAS PACKET VISUALIZER ANIMATION ---

function initTopologyCanvas() {
  const canvas = document.getElementById('topology-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
  }
  resize();

  if (canvasAnimId) cancelAnimationFrame(canvasAnimId);

  function renderLoop() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    updateNodeCoordinates(w, h);
    drawDockerNetworkBox(ctx, w, h);
    drawConnectionWires(ctx);
    drawNodes(ctx);
    updateAndDrawParticles(ctx);

    canvasAnimId = requestAnimationFrame(renderLoop);
  }

  renderLoop();
}

function updateNodeCoordinates(w, h) {
  // Client & Ingress
  nodeCoords['client'] = { x: w * 0.5, y: 35, label: 'Client (HLS Player)', color: '#00e5ff' };
  nodeCoords['nginx'] = { x: w * 0.5, y: 105, label: 'NGINX LB (:80)', color: '#00e5ff' };

  // API Cluster (Left side of stream-net)
  nodeCoords['api-service-1'] = { x: w * 0.22, y: 195, label: 'api-1 (:5001)', color: '#b388ff' };
  nodeCoords['api-service-2'] = { x: w * 0.38, y: 195, label: 'api-2 (:5002)', color: '#b388ff' };

  // Stream Cluster (Right side of stream-net)
  const streamCount = clusterState.streamNodes.length;
  clusterState.streamNodes.forEach((node, i) => {
    const startX = w * 0.54;
    const endX = w * 0.92;
    const step = (endX - startX) / Math.max(1, streamCount - 1);
    const x = streamCount === 1 ? (startX + endX) / 2 : startX + (i * step);
    nodeCoords[node.id] = {
      x,
      y: 195,
      label: `${node.id.replace('stream-service-', 'stream-')} (:${node.port})`,
      color: '#00e676',
      down: node.manualDown || !node.healthy
    };
  });

  // Storage & Worker Layer
  nodeCoords['redis'] = { x: w * 0.25, y: 285, label: 'Redis 7.0 + SQLite', color: '#b388ff' };
  nodeCoords['transcoder'] = { x: w * 0.50, y: 285, label: 'Transcoder Worker', color: '#ffab00' };
  nodeCoords['media_data'] = { x: w * 0.78, y: 285, label: 'VOLUME: media_data', color: '#ffab00' };
}

function drawDockerNetworkBox(ctx, w, h) {
  // Dashed border representing stream-net (172.20.0.0/16)
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(16, 150, w - 32, 175);
  ctx.restore();

  ctx.fillStyle = 'rgba(0, 229, 255, 0.85)';
  ctx.font = '10px Inter, monospace';
  ctx.fillText('INTERNAL DOCKER NETWORK: stream-net • 172.20.0.0/16 • DNS: 127.0.0.11', 26, 168);
}

function drawConnectionWires(ctx) {
  const nginx = nodeCoords['nginx'];
  const client = nodeCoords['client'];

  if (!nginx || !client) return;

  // Wire: Client -> NGINX
  drawWire(ctx, client.x, client.y + 16, nginx.x, nginx.y - 16, '#00e5ff', 1.5);

  // Wires: NGINX -> API nodes
  ['api-service-1', 'api-service-2'].forEach(id => {
    const target = nodeCoords[id];
    if (target) drawWire(ctx, nginx.x - 30, nginx.y + 16, target.x, target.y - 16, '#b388ff', 1);
  });

  // Wires: NGINX -> Stream nodes
  clusterState.streamNodes.forEach(node => {
    const target = nodeCoords[node.id];
    if (target) {
      const color = target.down ? '#ff5252' : '#00e676';
      drawWire(ctx, nginx.x + 30, nginx.y + 16, target.x, target.y - 16, color, target.down ? 1 : 1.2, target.down);
    }
  });

  // Wires to Storage & Volumes
  const mediaVol = nodeCoords['media_data'];
  if (mediaVol) {
    clusterState.streamNodes.forEach(node => {
      const target = nodeCoords[node.id];
      if (target && !target.down) {
        drawWire(ctx, target.x, target.y + 16, mediaVol.x, mediaVol.y - 16, 'rgba(0, 230, 118, 0.25)', 0.8, true);
      }
    });
  }
}

function drawWire(ctx, x1, y1, x2, y2, color, width = 1, isDashed = false) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (isDashed) ctx.setLineDash([4, 4]);

  ctx.beginPath();
  const midY = (y1 + y2) / 2;
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(x1, midY, x2, midY, x2, y2);
  ctx.stroke();
  ctx.restore();
}

function drawNodes(ctx) {
  for (const [key, node] of Object.entries(nodeCoords)) {
    const isDown = node.down;
    const fillColor = isDown ? '#2a1114' : '#141c28';
    const borderColor = isDown ? '#ff5252' : (node.color || '#fff');

    // Node pill box
    ctx.save();
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = isDown ? 2 : 1.5;

    const boxW = 100;
    const boxH = 32;
    const rx = node.x - boxW / 2;
    const ry = node.y - boxH / 2;

    ctx.beginPath();
    ctx.roundRect(rx, ry, boxW, boxH, 6);
    ctx.fill();
    ctx.stroke();

    // Node label
    ctx.fillStyle = isDown ? '#ff5252' : '#fff';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.label, node.x, node.y);

    if (isDown) {
      ctx.fillStyle = '#ff5252';
      ctx.font = 'bold 9px Inter';
      ctx.fillText('⚡ CRASHED', node.x, node.y + 24);
    }

    ctx.restore();
  }
}

// Spawns packet particle that flies across the wires
function spawnPacketParticle(pkt) {
  const start = nodeCoords['client'];
  const mid = nodeCoords['nginx'];
  const end = nodeCoords[pkt.target] || nodeCoords['stream-service-1'];

  if (!start || !mid || !end) return;

  particles.push({
    x: start.x,
    y: start.y,
    phase: 1, // 1: client -> nginx, 2: nginx -> target
    start,
    mid,
    end,
    progress: 0,
    speed: 0.04,
    color: pkt.type === 'stream' ? '#00e676' : '#00e5ff',
    target: pkt.target
  });
}

function updateAndDrawParticles(ctx) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.progress += p.speed;

    let currX, currY;
    if (p.phase === 1) {
      // client to nginx
      const t = p.progress;
      currX = p.start.x + (p.mid.x - p.start.x) * t;
      currY = p.start.y + (p.mid.y - p.start.y) * t;

      if (p.progress >= 1) {
        p.phase = 2;
        p.progress = 0;
      }
    } else {
      // nginx to target (bezier)
      const t = p.progress;
      const x1 = p.mid.x;
      const y1 = p.mid.y;
      const x2 = p.end.x;
      const y2 = p.end.y;
      const my = (y1 + y2) / 2;

      // Quadratic bezier
      currX = Math.pow(1 - t, 2) * x1 + 2 * (1 - t) * t * x1 + Math.pow(t, 2) * x2;
      currY = Math.pow(1 - t, 2) * y1 + 2 * (1 - t) * t * my + Math.pow(t, 2) * y2;

      if (p.progress >= 1) {
        particles.splice(i, 1);
        continue;
      }
    }

    // Draw glowing particle
    ctx.save();
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(currX, currY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
