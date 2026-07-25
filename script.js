// =============================================
//  YAMZZ PORTFOLIO - script.js
//  Real HTML5 audio player + Add from device
// =============================================

// ── Navbar scroll ─────────────────────────────
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 40);
});

// ── Hamburger ─────────────────────────────────
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');
hamburger.addEventListener('click', () => mobileMenu.classList.toggle('open'));
document.querySelectorAll('.mobile-link').forEach(link => {
  link.addEventListener('click', () => mobileMenu.classList.remove('open'));
});

// ── Skill bars ────────────────────────────────
const skillObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const bar = entry.target.querySelector('.skill-bar');
      if (bar) bar.style.width = entry.target.dataset.percent + '%';
      skillObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.3 });
document.querySelectorAll('.skill-item').forEach(el => skillObserver.observe(el));

// ── Fade in on scroll ─────────────────────────
const fadeEls = document.querySelectorAll('.section > .container > *');
fadeEls.forEach(el => el.classList.add('fade-in'));
const fadeObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      setTimeout(() => entry.target.classList.add('visible'), 60);
      fadeObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });
fadeEls.forEach(el => fadeObserver.observe(el));

// ── Active nav on scroll ──────────────────────
const sections = document.querySelectorAll('section[id]');
const navLinksAll = document.querySelectorAll('.nav-links a');
window.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(section => {
    if (window.scrollY >= section.offsetTop - 80) current = section.id;
  });
  navLinksAll.forEach(link => {
    link.style.color = link.getAttribute('href') === '#' + current
      ? 'var(--text-primary)' : '';
  });
});

// =============================================
//  MUSIC PLAYER — Real HTML5 Audio
// =============================================

const audio         = document.getElementById('audioPlayer');
const playBtn       = document.getElementById('playBtn');
const playIcon      = document.getElementById('playIcon');
const prevBtn       = document.getElementById('prevBtn');
const nextBtn       = document.getElementById('nextBtn');
const shuffleBtn    = document.getElementById('shuffleBtn');
const progressBar   = document.getElementById('progressBar');
const currentTimeEl = document.getElementById('currentTime');
const totalTimeEl   = document.getElementById('totalTime');
const playerThumb   = document.getElementById('playerThumb');
const playerThumbPh = document.getElementById('playerThumbPlaceholder');
const playerName    = document.getElementById('playerTrackName');
const playerArtist  = document.getElementById('playerTrackArtist');
const playlistEl    = document.getElementById('playlistEl');
const fileInput     = document.getElementById('fileInput');

// ── Playlist data ──────────────────────────────
// Untuk lagu lokal: isi `file` dengan nama file MP3 di folder yang sama.
// Contoh: jika file MP3 bernama "multo.mp3", taruh di folder yang sama dengan index.html.
// Jika belum ada file MP3-nya, lagu tidak akan bisa diputar sampai file tersedia.
let playlist = [
  { name: 'Multo',                       artist: 'Cup of Joe', file: 'Music/Multo.mp3',                   cover: "Icons/Multo-icon.jpg", url: 'Music/Multo.mp3' },
  { name: 'everything u are',            artist: 'Hindia',     file: 'Music/everything-u-are.mp3',         cover: "Icons/everything-u-are-icon.jpg", url: 'Musiceverything-u-are.mp3' },
  { name: 'Cincin',                      artist: 'Hindia',     file: 'Music/Cincin.mp3',                   cover: "Icons/Cincin-icon.jpg", url: 'Music/Cincin.mp3' },
  { name: 'The Winner Takes It All',     artist: 'ABBA',       file: 'Music/The-Winner-Takes-It-All.mp3',  cover: "Icons/The-Winner-Takes-It-All-icon.jpg", url: 'Music/The-Winner-Takes-It-All.mp3' },
  { name: 'Tak Ada Yang Abadi',                       artist: 'Shafira record official', file: 'Music/tak-ada-yang-abadi.mp3',                   cover: 'Icons/noah.jpg' , url: 'Music/tak-ada-yang-abadi.mp3' },
];

let currentIndex = 0;
let isPlaying    = false;
let isShuffle    = false;

// ── Helpers ───────────────────────────────────
function formatTime(sec) {
  if (isNaN(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateProgressFill(val) {
  progressBar.style.background =
    `linear-gradient(90deg, var(--accent-blue) ${val}%, rgba(255,255,255,0.08) ${val}%)`;
}

// ── Render playlist ───────────────────────────
function renderPlaylist() {
  playlistEl.innerHTML = '';
  playlist.forEach((track, i) => {
    const item = document.createElement('div');
    item.className = 'playlist-item' + (i === currentIndex ? ' active' : '');
    item.dataset.index = i;
    item.innerHTML = `
      <div class="pl-thumb-wrap">
        ${track.cover
          ? `<img src="${track.cover}" class="pl-thumb" alt="" />`
          : `<div class="pl-thumb-placeholder"><i class="fa-solid fa-music"></i></div>`}
      </div>
      <div class="pl-info">
        <span class="pl-name">${track.name}</span>
        <span class="pl-artist">${track.artist}</span>
      </div>
      <span class="pl-num">${i + 1}</span>
    `;
    item.addEventListener('click', () => loadAndPlay(i));
    playlistEl.appendChild(item);
  });
}

// ── Load track (no autoplay) ──────────────────
function loadTrack(index) {
  currentIndex = index;
  const track = playlist[index];

  playerName.textContent   = track.name;
  playerArtist.textContent = track.artist;

  if (track.cover) {
    playerThumb.src = track.cover;
    playerThumb.style.display = 'block';
    playerThumbPh.classList.add('hidden');
  } else {
    playerThumb.style.display = 'none';
    playerThumbPh.classList.remove('hidden');
  }

  progressBar.value = 0;
  updateProgressFill(0);
  currentTimeEl.textContent = '0:00';
  totalTimeEl.textContent   = '0:00';

  if (track.url) {
    audio.src = track.url;
    audio.load();
  } else {
    audio.src = '';
  }

  renderPlaylist();
}

// ── Load & play ───────────────────────────────
function loadAndPlay(index) {
  loadTrack(index);
  const track = playlist[index];
  if (track.url) {
    audio.play().catch(() => {});
  }
}

// ── Play / Pause ──────────────────────────────
function updatePlayIcon() {
  playIcon.className = isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
}

playBtn.addEventListener('click', () => {
  if (!playlist[currentIndex].url) return;
  if (isPlaying) {
    audio.pause();
  } else {
    audio.play().catch(() => {});
  }
});

audio.addEventListener('play',  () => { isPlaying = true;  updatePlayIcon(); });
audio.addEventListener('pause', () => { isPlaying = false; updatePlayIcon(); });

// ── Prev / Next ───────────────────────────────
prevBtn.addEventListener('click', () => {
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  let idx = currentIndex - 1;
  if (idx < 0) idx = playlist.length - 1;
  loadAndPlay(idx);
});

nextBtn.addEventListener('click', () => {
  let idx = isShuffle
    ? randomOther()
    : (currentIndex + 1) % playlist.length;
  loadAndPlay(idx);
});

function randomOther() {
  let idx;
  do { idx = Math.floor(Math.random() * playlist.length); }
  while (idx === currentIndex && playlist.length > 1);
  return idx;
}

// ── Shuffle ───────────────────────────────────
shuffleBtn.addEventListener('click', () => {
  isShuffle = !isShuffle;
  shuffleBtn.classList.toggle('active', isShuffle);
});

// ── Progress drag ─────────────────────────────
progressBar.addEventListener('input', () => {
  if (!audio.duration) return;
  audio.currentTime = (progressBar.value / 100) * audio.duration;
  updateProgressFill(parseFloat(progressBar.value));
});

// ── Audio events ──────────────────────────────
audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  progressBar.value = pct;
  updateProgressFill(pct);
  currentTimeEl.textContent = formatTime(audio.currentTime);
});

audio.addEventListener('loadedmetadata', () => {
  totalTimeEl.textContent = formatTime(audio.duration);
});

audio.addEventListener('ended', () => {
  loadAndPlay(isShuffle ? randomOther() : (currentIndex + 1) % playlist.length);
});

// ── Init ──────────────────────────────────────
renderPlaylist();
loadTrack(0);
