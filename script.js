// =============================================
//  YAMZZ PORTFOLIO - script.js
// =============================================

// ── Navbar scroll effect ──────────────────────
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  if (window.scrollY > 40) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
});

// ── Hamburger / Mobile menu ───────────────────
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');

hamburger.addEventListener('click', () => {
  mobileMenu.classList.toggle('open');
});

document.querySelectorAll('.mobile-link').forEach(link => {
  link.addEventListener('click', () => {
    mobileMenu.classList.remove('open');
  });
});

// ── Skill bars animate on scroll ─────────────
const skillItems = document.querySelectorAll('.skill-item');
const bars = {
  'html-bar':   75,
  'css-bar':    65,
  'js-bar':     40,
  'vibe-bar':   100,
  'google-bar': 100,
  'sleep-bar':  95,
};

const skillObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const bar = entry.target.querySelector('.skill-bar');
      if (bar) {
        const percent = entry.target.dataset.percent;
        bar.style.width = percent + '%';
      }
      skillObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.3 });

skillItems.forEach(item => skillObserver.observe(item));

// ── Fade-in on scroll ─────────────────────────
const fadeEls = document.querySelectorAll('.section > .container > *');
fadeEls.forEach(el => el.classList.add('fade-in'));

const fadeObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => {
        entry.target.classList.add('visible');
      }, 60);
      fadeObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

fadeEls.forEach(el => fadeObserver.observe(el));

// ── Music Player ──────────────────────────────
const playlist = [
  { name: 'Multo',                    artist: 'Cup of Joe',  duration: 237, thumb: 'https://i.scdn.co/image/ab67616d0000b273ba5db46f4b838ef6027e6f96' },
  { name: 'everything u are',         artist: 'Hindia',      duration: 214, thumb: 'https://i.scdn.co/image/ab67616d0000b273adf50968a7b7ec50fc5c2e91' },
  { name: 'Lihat Kebunku (Taman Bunga)', artist: 'Aku Jeje', duration: 195, thumb: 'https://i.scdn.co/image/ab67616d0000b27310b21085ac3af15ca41b3498' },
  { name: '33x',                      artist: 'Perunggu',    duration: 208, thumb: 'https://i.scdn.co/image/ab67616d0000b273c43e43f0cbb6e86571e6bc39' },
  { name: 'Cincin',                   artist: 'Hindia',      duration: 221, thumb: 'https://i.scdn.co/image/ab67616d0000b273adf50968a7b7ec50fc5c2e91' },
  { name: 'Nina',                     artist: 'Feast',       duration: 198, thumb: 'https://i.scdn.co/image/ab67616d0000b27304fe22a46d0657e5f1c92a85' },
  { name: 'The Winner Takes It All',  artist: 'ABBA',        duration: 295, thumb: 'https://i.scdn.co/image/ab67616d0000b2735ef878a782c987d664f34b5b' },
];

let currentIndex = 0;
let isPlaying = false;
let isShuffle = false;
let elapsed = 0;
let timer = null;

const playerThumb     = document.getElementById('playerThumb');
const playerTrackName = document.getElementById('playerTrackName');
const playerTrackArtist = document.getElementById('playerTrackArtist');
const progressBar     = document.getElementById('progressBar');
const currentTimeEl   = document.getElementById('currentTime');
const totalTimeEl     = document.getElementById('totalTime');
const playBtn         = document.getElementById('playBtn');
const playIcon        = document.getElementById('playIcon');
const prevBtn         = document.getElementById('prevBtn');
const nextBtn         = document.getElementById('nextBtn');
const shuffleBtn      = document.getElementById('shuffleBtn');
const playlistItems   = document.querySelectorAll('.playlist-item');

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function loadTrack(index) {
  const track = playlist[index];
  currentIndex = index;
  elapsed = 0;

  playerThumb.src           = track.thumb;
  playerTrackName.textContent  = track.name;
  playerTrackArtist.textContent = track.artist;
  totalTimeEl.textContent   = formatTime(track.duration);
  currentTimeEl.textContent = '0:00';
  progressBar.value         = 0;
  updateProgressStyle(0);

  // Update playlist active
  playlistItems.forEach((item, i) => {
    item.classList.toggle('active', i === index);
    // Update thumb
    const thumb = item.querySelector('.pl-thumb');
    if (thumb) thumb.src = playlist[i].thumb;
  });
}

function updateProgressStyle(percent) {
  progressBar.style.setProperty('--progress', percent + '%');
}

function startTimer() {
  clearInterval(timer);
  const track = playlist[currentIndex];
  timer = setInterval(() => {
    elapsed++;
    if (elapsed >= track.duration) {
      elapsed = track.duration;
      clearInterval(timer);
      handleNext();
      return;
    }
    const pct = (elapsed / track.duration) * 100;
    progressBar.value = pct;
    updateProgressStyle(pct);
    currentTimeEl.textContent = formatTime(elapsed);
  }, 1000);
}

function togglePlay() {
  isPlaying = !isPlaying;
  if (isPlaying) {
    playIcon.className = 'fa-solid fa-pause';
    startTimer();
  } else {
    playIcon.className = 'fa-solid fa-play';
    clearInterval(timer);
  }
}

function handlePrev() {
  let idx = currentIndex - 1;
  if (idx < 0) idx = playlist.length - 1;
  loadTrack(idx);
  if (isPlaying) startTimer();
}

function handleNext() {
  let idx;
  if (isShuffle) {
    do { idx = Math.floor(Math.random() * playlist.length); }
    while (idx === currentIndex && playlist.length > 1);
  } else {
    idx = (currentIndex + 1) % playlist.length;
  }
  loadTrack(idx);
  if (isPlaying) startTimer();
}

playBtn.addEventListener('click', togglePlay);
prevBtn.addEventListener('click', handlePrev);
nextBtn.addEventListener('click', handleNext);

shuffleBtn.addEventListener('click', () => {
  isShuffle = !isShuffle;
  shuffleBtn.classList.toggle('active', isShuffle);
});

progressBar.addEventListener('input', () => {
  const track = playlist[currentIndex];
  elapsed = Math.floor((progressBar.value / 100) * track.duration);
  currentTimeEl.textContent = formatTime(elapsed);
  updateProgressStyle(parseFloat(progressBar.value));
});

playlistItems.forEach((item, i) => {
  item.addEventListener('click', () => {
    loadTrack(i);
    if (!isPlaying) togglePlay();
    else startTimer();
  });
});

// Init
loadTrack(0);

// ── Active nav highlight on scroll ───────────
const sections = document.querySelectorAll('section[id]');
const navLinksAll = document.querySelectorAll('.nav-links a');

window.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(section => {
    const sectionTop = section.offsetTop - 80;
    if (window.scrollY >= sectionTop) {
      current = section.getAttribute('id');
    }
  });

  navLinksAll.forEach(link => {
    link.style.color = '';
    if (link.getAttribute('href') === '#' + current) {
      link.style.color = 'var(--text-primary)';
    }
  });
});
