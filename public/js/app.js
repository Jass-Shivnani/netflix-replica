// Global Application State
let catalogData = { movies: [] };
let heroMovie = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initNavbarScroll();
  loadCatalog();
});

// Navbar background blur on scroll
function initNavbarScroll() {
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });
}

// Fetch Catalog from Web/API Gateway (/api/videos)
async function loadCatalog() {
  try {
    const res = await fetch('/api/videos');
    const json = await res.json();
    catalogData = json.data || json;

    if (catalogData.movies && catalogData.movies.length > 0) {
      heroMovie = catalogData.movies[0];
      setupHero(heroMovie);
      renderCatalogRows(catalogData.movies);
    }
  } catch (err) {
    console.warn('API Gateway offline or loading fallback:', err);
    // Fallback static movie list if API is starting up
    setTimeout(loadCatalog, 2000);
  }
}

// Setup Hero Billboard
function setupHero(movie) {
  document.getElementById('hero-banner').style.backgroundImage = `url('${movie.backdrop || movie.poster}')`;
  document.getElementById('hero-title').innerText = movie.title.toUpperCase();
  document.getElementById('hero-match').innerText = movie.matchRate || '99% Match';
  document.getElementById('hero-rating').innerText = movie.rating || 'TV-MA';
  document.getElementById('hero-duration').innerText = movie.duration || '0:30';
  document.getElementById('hero-res').innerText = movie.resolution || '1080p Full HD';
  document.getElementById('hero-desc').innerText = movie.description;
}

function playHeroMovie() {
  if (heroMovie) {
    playMovie(heroMovie.id);
  }
}

// Render Content Rows
function renderCatalogRows(movies) {
  const rowTrending = document.getElementById('row-trending');
  const rowScifi = document.getElementById('row-scifi');
  const rowRecent = document.getElementById('row-recent');

  rowTrending.innerHTML = '';
  rowScifi.innerHTML = '';
  rowRecent.innerHTML = '';

  movies.forEach((movie, index) => {
    const card = createMovieCard(movie);
    
    // Distribute into themed rows
    rowTrending.appendChild(card.cloneNode(true));

    if (index % 2 === 0) {
      rowScifi.appendChild(createMovieCard(movie));
    } else {
      rowRecent.appendChild(createMovieCard(movie));
    }
  });

  // Attach click listeners to cards
  document.querySelectorAll('.movie-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-id');
      playMovie(id);
    });
  });
}

// Generate Movie Card Element
function createMovieCard(movie) {
  const card = document.createElement('div');
  card.className = 'movie-card';
  card.setAttribute('data-id', movie.id);

  const posterSrc = movie.poster || '/assets/posters/cyberpunk.jpg';
  const chunksCount = movie.segmentCount || 4;

  card.innerHTML = `
    <div class="card-poster-wrap">
      <img src="${posterSrc}" alt="${movie.title}" class="card-poster" loading="lazy">
      <span class="card-overlay-badge">${movie.rating || 'TV-MA'}</span>
    </div>
    <div class="card-details">
      <h3 class="card-title">${movie.title}</h3>
      <div class="card-meta-row">
        <span class="match">${movie.matchRate || '98% Match'}</span>
        <span class="badge-res">${movie.resolution || '1080p'}</span>
        <span>${movie.duration || '0:30'}</span>
      </div>
      <div class="card-hls-indicator">
        <span class="hls-status-tag">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          HLS Byte-Range
        </span>
        <span>${chunksCount} chunks (6s)</span>
      </div>
    </div>
  `;
  return card;
}

// Credits Modal Handlers
function openCreditsModal() {
  document.getElementById('credits-modal').classList.add('active');
}

function closeCreditsModal() {
  document.getElementById('credits-modal').classList.remove('active');
}
