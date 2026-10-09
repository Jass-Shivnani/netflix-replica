# Dockerized Video Streaming Platform with NGINX Load Balancing

> **Advanced Cloud Computing / Container Technologies Laboratory Mini-Project**  
> **Institution:** Vivekanand Education Society's Institute of Technology (VESIT)  
> **Class & Batch:** D7A • Batch 2, Group 5  
> **Team Members:**  
> - **Navya Rangwani** (Roll No. 43)  
> - **Jass Shivnani** (Roll No. 50)  
> - **Khushi Sadhuramani** (Roll No. 44)  

---

## 1. System Architecture Overview

This platform implements a decoupled microservices architecture for Video-on-Demand (VOD) streaming. The architecture isolates compute-heavy video ingestion/transcoding from media chunk delivery, while Layer 7 load balancing distributes concurrent playback sessions across replicated streaming containers.

```
                             ┌──────────────────────────────────────┐
                             │           Client Devices             │
                             │   (Web Browser / HLS.js Player)      │
                             └──────────────────┬───────────────────┘
                                                │ HTTP / Port 80
                             ┌──────────────────▼───────────────────┐
                             │       NGINX Reverse Proxy &          │
                             │       Layer 7 Load Balancer          │
                             │  - Round Robin / Least Connections   │
                             │  - Active Health Monitoring          │
                             │  - Static Asset & Gateway Routing    │
                             └──────────┬────────────────┬──────────┘
                                        │                │
             ┌──────────────────────────┘                └──────────────────────────┐
             │ Upstream Pool (/api)                                                 │ Upstream Pool (/stream)
┌────────────▼────────────┐  ┌─────────────────────────┐              ┌─────────────▼───────────┐  ┌─────────────────────────┐
│ Web / API Gateway       │  │ Web / API Gateway       │              │ Video Streaming Service │  │ Video Streaming Service │
│ (Container Replica 1)   │  │ (Container Replica 2)   │              │ (Container Replica 1)   │  │ (Container Replica 2)   │
└────────────┬────────────┘  └─────────────┬───────────┘              └─────────────┬───────────┘  └─────────────┬───────────┘
             │                             │                                        │                            │
             └─────────────────────────────┼────────────────────────────────────────┴────────────────────────────┘
                                           │
                     ┌─────────────────────┴───────────────────────┐
                     │ Internal Docker Network (`stream-net`)     │
                     └──────┬──────────────────┬───────────────────┘
                            │                  │
               ┌────────────▼─────────┐ ┌──────▼──────────────────┐
               │ Transcoder Worker    │ │ Redis In-Memory Cache   │
               │ (FFmpeg / HLS Chunk) │ │ (Metadata & Sessions)   │
               └────────────┬─────────┘ └─────────────────────────┘
                            │
               ┌────────────▼─────────────────────────────────────┐
               │ Persistent Docker Named Volumes                  │
               │ - `media_data`  : Stored HLS chunks (.m3u8, .ts) │
               │ - `db_data`     : SQLite / Catalog database      │
               └──────────────────────────────────────────────────┘
```

---

## 2. Core Microservices

| Service | Internal Port | Scalability | Technology | Responsibility |
|---|---|---|---|---|
| **nginx-lb** | `:80 / :443` | 1 Ingress | NGINX Alpine | Layer 7 reverse proxy, Least-Connections load balancer, passive health checks |
| **api-service-1 / 2** | `:5000` | 2 Replicas | Node.js / Express | Catalog API, upload endpoints, user profiles, session caching |
| **stream-service-1 / 2 / 3** | `:8080` | 3 Replicas | Node.js Streamer | High-throughput HLS chunk delivery (`.ts`), playlist manifests (`.m3u8`), byte-range seeking |
| **transcoder-worker** | Daemon | 1 Worker | Python / FFmpeg | Asynchronous video transcoding and 6-second `.ts` segment generation |
| **redis** | `:6379` | 1 Cache | Redis 7.0 Alpine | Sub-millisecond catalog and session cache |

---

## 3. Quick Start & Execution Modes

The platform supports two deployment methods:

### Option A: Running with Docker Compose (Production Multi-Container Mode)
Ensure Docker and Docker Compose are installed:
```bash
# Build and launch all 7 microservices in stream-net
docker compose up --build
```
- Open your browser at: **`http://localhost`**
- To scale streaming replicas on the fly:
  ```bash
  docker compose up --scale stream-service=4
  ```

### Option B: Local Multi-Process Mode (Direct Host Execution)
If Docker Desktop is not active, you can launch the exact multi-replica cluster natively with:
```bash
# Install dependencies
npm install

# Start the cluster runner (Ingress LB on :80, 2 API nodes, 3 Stream nodes, Transcoder worker)
npm start
```
- Open your browser at: **`http://localhost`** (or `http://localhost:8000` if port 80 is restricted)

---

## 4. Key Platform Features

1. **Netflix-Inspired Web Application**:
   - High-fidelity dark mode with glassmorphic elements and billboard hero banner.
   - Live category rows populated from the API gateway with Redis caching.
2. **HLS.js Adaptive Video Player**:
   - Plays chunked video streams smoothly using standard `.m3u8` manifests and 6s `.ts` transport segments.
   - **Telemetry HUD ("Stats for Nerds")**: Shows which streaming replica (`stream-service-1`, `2`, or `3`) delivered each chunk in real time, along with chunk size, download latency, and buffer duration.
3. **Cloud Architecture & Load Balancer Visualizer**:
   - Interactive live topology showing the health and active connections of all cluster nodes.
4. **Chaos Engineering & Failover Simulation**:
   - Toggle containers offline directly from the UI or API (`/api/cluster/toggle-node?node=stream-service-1`).
   - Observe how the load balancer instantly reroutes traffic to healthy replicas without interrupting video playback (&lt; 1.2s failover).
5. **Creator Upload & Asynchronous Transcoding Portal**:
   - Upload any MP4 video; the background worker runs the standard FFmpeg command:
     ```bash
     ffmpeg -i input.mp4 -codec:v libx264 -codec:a aac -hls_time 6 \
            -hls_playlist_type vod -hls_segment_filename "media_%03d.ts" playlist.m3u8
     ```
   - Real-time progress bar displays chunks generated and updates the catalog automatically upon completion.

---

## 5. Benchmarks and Verification

Run the automated load test suite:
```bash
npm run test-load
```
This tool executes 100 requests to evaluate latency, throughput, and replica traffic spread, reproducing the benchmark results in Section 5 of the project report and Presentation Slide 13.
