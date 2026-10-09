let selectedFile = null;
let pollTranscodeTimer = null;

function openUploadModal() {
  document.getElementById('upload-modal').classList.add('active');
  resetUploadForm();
}

function closeUploadModal() {
  document.getElementById('upload-modal').classList.remove('active');
  if (pollTranscodeTimer) {
    clearInterval(pollTranscodeTimer);
    pollTranscodeTimer = null;
  }
}

function resetUploadForm() {
  selectedFile = null;
  document.getElementById('upload-form').reset();
  document.getElementById('dropzone-text').innerText = 'Click or Drag & Drop MP4 Video';
  document.getElementById('transcode-progress-box').style.display = 'none';
  document.getElementById('btn-submit-upload').disabled = false;
  document.getElementById('btn-submit-upload').innerText = 'Start Transcoding Pipeline';
}

function handleFileSelected(e) {
  if (e.target.files && e.target.files[0]) {
    selectedFile = e.target.files[0];
    document.getElementById('dropzone-text').innerText = `Selected: ${selectedFile.name} (${(selectedFile.size / (1024*1024)).toFixed(1)} MB)`;
  }
}

// Drag & Drop event listeners
const dropzone = document.getElementById('dropzone');
if (dropzone) {
  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      selectedFile = e.dataTransfer.files[0];
      document.getElementById('dropzone-text').innerText = `Selected: ${selectedFile.name} (${(selectedFile.size / (1024*1024)).toFixed(1)} MB)`;
    }
  });
}

// Form Submission & Asynchronous Transcoder Polling
async function handleUploadSubmit(e) {
  e.preventDefault();
  if (!selectedFile) {
    alert('Please choose an MP4 video file to transcode.');
    return;
  }

  const title = document.getElementById('upload-title').value.trim();
  const genre = document.getElementById('upload-genre').value.trim();
  const description = document.getElementById('upload-desc').value.trim();

  const formData = new FormData();
  formData.append('video', selectedFile);
  formData.append('title', title);
  formData.append('genre', genre);
  formData.append('description', description);

  const btnSubmit = document.getElementById('btn-submit-upload');
  btnSubmit.disabled = true;
  btnSubmit.innerText = 'Uploading to /var/media/raw...';

  const progressBox = document.getElementById('transcode-progress-box');
  const bar = document.getElementById('transcode-bar');
  const stepLabel = document.getElementById('transcode-step-label');
  const pctLabel = document.getElementById('transcode-pct-label');
  const chunkInfo = document.getElementById('transcode-chunk-info');

  progressBox.style.display = 'block';
  bar.style.width = '20%';
  stepLabel.innerText = 'Uploading raw MP4 to media volume...';
  pctLabel.innerText = '20%';

  try {
    const res = await fetch('/api/videos/upload', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) throw new Error('Upload failed');
    const result = await res.json();
    const videoId = result.video.id;

    bar.style.width = '40%';
    stepLabel.innerText = 'Ingested into raw volume. FFmpeg daemon notified...';
    pctLabel.innerText = '40%';
    chunkInfo.innerText = 'Transcoder Worker is segmenting into 6s chunks...';

    // Start polling transcoding progress
    pollTranscoding(videoId);

  } catch (err) {
    console.error(err);
    alert('Failed to upload video: ' + err.message);
    btnSubmit.disabled = false;
    btnSubmit.innerText = 'Retry Upload';
  }
}

function pollTranscoding(videoId) {
  const bar = document.getElementById('transcode-bar');
  const stepLabel = document.getElementById('transcode-step-label');
  const pctLabel = document.getElementById('transcode-pct-label');
  const chunkInfo = document.getElementById('transcode-chunk-info');
  const btnSubmit = document.getElementById('btn-submit-upload');

  let attempts = 0;
  pollTranscodeTimer = setInterval(async () => {
    attempts++;
    try {
      const res = await fetch(`/api/transcode/status/${videoId}`);
      const data = await res.json();

      if (data.status === 'ready' || data.progress === 100) {
        clearInterval(pollTranscodeTimer);
        pollTranscodeTimer = null;

        bar.style.width = '100%';
        bar.style.background = 'var(--accent-green)';
        stepLabel.innerText = 'Transcoding Complete! HLS Master Ready.';
        pctLabel.innerText = '100%';
        chunkInfo.innerText = `Generated ${data.chunksGenerated} transport segments (.ts) + playlist.m3u8`;

        btnSubmit.disabled = false;
        btnSubmit.style.background = 'var(--accent-green)';
        btnSubmit.innerText = '▶ Play Transcoded Stream Now';
        btnSubmit.onclick = () => {
          closeUploadModal();
          playMovie(videoId);
        };

        // Reload home catalog
        loadCatalog();
      } else {
        const simulatedPct = Math.min(95, 40 + (attempts * 10));
        bar.style.width = `${simulatedPct}%`;
        pctLabel.innerText = `${simulatedPct}%`;
        chunkInfo.innerText = `FFmpeg active: ${data.chunksGenerated || Math.floor(attempts / 2)} segments rendered...`;
      }
    } catch (e) {
      console.warn('Polling error:', e);
    }
  }, 1500);
}
