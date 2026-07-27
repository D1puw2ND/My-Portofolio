// app.js — SPA kecil tanpa framework, murni vanilla JS.
// Routing pakai hash (#/, #/series/ID, #/watch/SERIES_ID/EPISODE_ID)
// supaya jalan mulus 100% offline lewat file:// atau http://localhost.

const app = document.getElementById("app");
const toastEl = document.getElementById("toast");
const searchInput = document.getElementById("searchInput");
const rescanBtn = document.getElementById("rescanBtn");

let libraryCache = null; // { series: [...], errors, scannedAt }
let searchQuery = "";

// ---------------- Util ----------------
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2500);
}

function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function fmtBytes(bytes) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0, v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

// Hash string -> warna gradient deterministik (biar tiap series punya "warna kaset" konsisten)
function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}
function tapeColors(seriesId, title) {
  const hue = hashHue(seriesId + title);
  const c1 = `hsl(${hue}, 42%, 28%)`;
  const c2 = `hsl(${(hue + 40) % 360}, 45%, 14%)`;
  return { c1, c2 };
}

async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request gagal (${res.status})`);
  }
  return res.json();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------- Placeholder poster (VHS tile) ----------------
// Catatan: sengaja TIDAK menyisipkan judul ke dalam atribut onerror inline,
// supaya judul yang mengandung tanda kutip / karakter aneh tidak merusak HTML.
// Sebagai gantinya pakai data-attribute + delegasi event global.
function tapeArtHtml(seriesId, title, imgUrl) {
  const { c1, c2 } = tapeColors(seriesId, title);
  return `
    <div class="tape-art" style="--tape-color-1:${c1}; --tape-color-2:${c2}"
         data-series-id="${escapeHtml(seriesId)}" data-title="${escapeHtml(title)}"
         data-c1="${c1}" data-c2="${c2}">
      <img src="${imgUrl}" alt="" data-thumb-img />
    </div>`;
}

function renderPlaceholderInto(container) {
  const title = container.dataset.title || "?";
  const c1 = container.dataset.c1;
  const c2 = container.dataset.c2;
  const initial = title.trim().charAt(0).toUpperCase() || "?";
  container.innerHTML = `
    <div class="tape-placeholder" style="--tape-color-1:${c1}; --tape-color-2:${c2}">
      <div class="sprockets top"></div>
      <span class="initial"></span>
      <div class="tape-label"></div>
      <div class="sprockets bottom"></div>
    </div>`;
  // pakai textContent (bukan innerHTML) buat initial & label supaya 100% aman dari HTML injection
  container.querySelector(".initial").textContent = initial;
  container.querySelector(".tape-label").textContent = title;
}

// Delegasi error event untuk semua <img data-thumb-img> yang gagal load
document.addEventListener(
  "error",
  (e) => {
    const img = e.target;
    if (img && img.matches && img.matches("img[data-thumb-img]")) {
      const container = img.closest(".tape-art");
      if (container) renderPlaceholderInto(container);
    }
  },
  true // capture phase, karena event "error" pada <img> tidak bubble
);

// ---------------- Router ----------------
async function router() {
  const hash = window.location.hash || "#/";
  const parts = hash.replace(/^#\//, "").split("/").filter(Boolean);

  try {
    if (parts[0] === "series" && parts[1]) {
      await renderSeriesPage(parts[1]);
    } else if (parts[0] === "watch" && parts[1] && parts[2]) {
      await renderWatchPage(parts[1], parts[2]);
    } else {
      await renderHomePage();
    }
  } catch (err) {
    app.innerHTML = `<div class="warn-banner">Gagal memuat halaman: ${escapeHtml(err.message)}</div>`;
  }
}
window.addEventListener("hashchange", router);

// ---------------- Home page ----------------
async function loadLibrary(force) {
  if (libraryCache && !force) return libraryCache;
  libraryCache = await api("/api/library");
  return libraryCache;
}

async function renderHomePage() {
  app.innerHTML = `<div class="empty-state">Memuat koleksi…</div>`;
  const [lib, continueWatching] = await Promise.all([
    loadLibrary(false),
    api("/api/continue-watching").catch(() => []),
  ]);

  let html = "";

  if (lib.errors && lib.errors.length) {
    html += `<div class="warn-banner"><strong style="display:block;margin-bottom:6px;">Beberapa hal perlu dicek:</strong>${lib.errors.map(e => escapeHtml(e)).join("<br/>")}</div>`;
  }

  if (!lib.series || lib.series.length === 0) {
    html += `
      <div class="empty-state">
        <strong>Belum ada anime terdeteksi</strong>
        Taruh folder anime kamu di dalam <code>${escapeHtml(lib.libraryPath || "./anime-library")}</code>,
        satu folder per judul, lalu klik "⟳ Scan ulang" di pojok kanan atas.
      </div>`;
    app.innerHTML = html;
    return;
  }

  if (continueWatching && continueWatching.length) {
    html += `<h2 class="section-title">Lanjutkan Menonton</h2>`;
    html += `<div class="cw-row">`;
    for (const item of continueWatching) {
      const pct = Math.min(100, Math.round((item.position / item.duration) * 100));
      html += `
        <a class="cw-card" href="#/watch/${item.seriesId}/${item.episodeId}">
          <div class="cw-series">${escapeHtml(item.seriesTitle)}</div>
          <div class="cw-episode">${escapeHtml(item.episodeTitle)}</div>
          <div class="cw-bar"><div class="cw-bar-fill" style="width:${pct}%"></div></div>
          <div class="cw-meta">${fmtTime(item.position)} / ${fmtTime(item.duration)}</div>
        </a>`;
    }
    html += `</div>`;
  }

  const filtered = lib.series.filter(s =>
    !searchQuery || s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  html += `<h2 class="section-title">Semua Anime <span class="count">${filtered.length} judul</span></h2>`;
  html += `<div class="grid">`;
  if (filtered.length === 0) {
    html += `<div class="empty-state">Tidak ada judul yang cocok dengan "${escapeHtml(searchQuery)}".</div>`;
  }
  for (const s of filtered) {
    html += `
      <a class="tape" href="#/series/${s.id}">
        ${tapeArtHtml(s.id, s.title, `/api/thumb/${s.id}`)}
        <div class="tape-info">
          <div class="tape-title">${escapeHtml(s.title)}</div>
          <div class="tape-count">${s.episodeCount} episode</div>
        </div>
      </a>`;
  }
  html += `</div>`;

  app.innerHTML = html;
}

// ---------------- Series detail page ----------------
async function renderSeriesPage(seriesId) {
  app.innerHTML = `<div class="empty-state">Memuat…</div>`;
  const series = await api(`/api/series/${seriesId}`);
  const { c1, c2 } = tapeColors(series.id, series.title);

  let html = `<a class="back-link" href="#/">← Kembali ke rak</a>`;
  html += `
    <div class="series-header">
      ${tapeArtHtml(series.id, series.title, `/api/thumb/${series.id}`)}
      <div class="series-header-info">
        <h1>${escapeHtml(series.title)}</h1>
        <div class="meta">${series.episodeCount} episode di koleksi lokal kamu</div>
      </div>
    </div>`;

  html += `<h2 class="section-title">Episode</h2><div class="episode-list">`;
  for (const ep of series.episodes) {
    const prog = ep.progress;
    const hasProg = prog && prog.duration > 0;
    const pct = hasProg ? Math.min(100, Math.round((prog.position / prog.duration) * 100)) : 0;
    const isDone = hasProg && pct >= 97;
    html += `
      <a class="episode-row" href="#/watch/${series.id}/${ep.id}">
        <div class="episode-num">${String(ep.episodeNumber).padStart(2, "0")}</div>
        <div class="episode-row-title">
          <div class="episode-row-name">${escapeHtml(ep.title)}</div>
          <div class="episode-row-file">${escapeHtml(ep.filename)} ${ep.sizeBytes ? "· " + fmtBytes(ep.sizeBytes) : ""}</div>
        </div>
        <div class="episode-progress-wrap">
          ${isDone
            ? `<div class="episode-done-badge">✓ SELESAI</div>`
            : hasProg
              ? `<div class="episode-progress-bar"><div class="episode-progress-fill" style="width:${pct}%"></div></div>`
              : ``}
        </div>
      </a>`;
  }
  html += `</div>`;

  app.innerHTML = html;
}

// ---------------- Watch page (custom player) ----------------
async function renderWatchPage(seriesId, episodeId) {
  app.innerHTML = `<div class="empty-state">Menyiapkan pemutar…</div>`;

  const [series, savedProgress] = await Promise.all([
    api(`/api/series/${seriesId}`),
    api(`/api/progress/${episodeId}`).catch(() => ({ position: 0 })),
  ]);

  const idx = series.episodes.findIndex(e => e.id === episodeId);
  const episode = series.episodes[idx];
  if (!episode) {
    app.innerHTML = `<div class="warn-banner">Episode tidak ditemukan.</div>`;
    return;
  }
  const prevEp = series.episodes[idx - 1];
  const nextEp = series.episodes[idx + 1];

  app.innerHTML = `
    <a class="back-link" href="#/series/${series.id}">← ${escapeHtml(series.title)}</a>
    <div class="watch-wrap">
      <div class="player-shell" id="playerShell">
        <video id="video" src="/api/stream/${episode.id}" preload="metadata" playsinline></video>
        <div class="player-controls">
          <div class="seek-row">
            <span class="time-label" id="timeCurrent">0:00</span>
            <div class="seek-bar" id="seekBar"><div class="seek-fill" id="seekFill"></div></div>
            <span class="time-label" id="timeDuration">0:00</span>
          </div>
          <div class="controls-row">
            <button class="ctrl-btn" id="playBtn" aria-label="Play/Pause">▶</button>
            <button class="ctrl-btn" id="backBtn" aria-label="Mundur 10 detik">⟲10</button>
            <button class="ctrl-btn" id="fwdBtn" aria-label="Maju 10 detik">10⟳</button>
            <input class="vol-slider" id="volSlider" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume" />
            <div class="ctrl-spacer"></div>
            <button class="ctrl-btn" id="fsBtn" aria-label="Fullscreen">⛶</button>
          </div>
        </div>
      </div>

      <div class="watch-title-row">
        <h1>${escapeHtml(episode.title)}</h1>
        <div class="sub">${escapeHtml(series.title)}</div>
        <div class="kbd-hint">⌨ <kbd>←</kbd>/<kbd>→</kbd> skip 10 detik · <kbd>Space</kbd> play/pause · <kbd>↑</kbd>/<kbd>↓</kbd> volume</div>
      </div>

      <div class="watch-nav-row">
        <button class="nav-btn" id="prevBtn" ${prevEp ? "" : "disabled"}>← Episode sebelumnya</button>
        <button class="nav-btn" id="nextBtn" ${nextEp ? "" : "disabled"}>Episode selanjutnya →</button>
      </div>
    </div>
  `;

  const video = document.getElementById("video");
  const playBtn = document.getElementById("playBtn");
  const backBtn = document.getElementById("backBtn");
  const fwdBtn = document.getElementById("fwdBtn");
  const fsBtn = document.getElementById("fsBtn");
  const volSlider = document.getElementById("volSlider");
  const seekBar = document.getElementById("seekBar");
  const seekFill = document.getElementById("seekFill");
  const timeCurrent = document.getElementById("timeCurrent");
  const timeDuration = document.getElementById("timeDuration");
  const playerShell = document.getElementById("playerShell");

  let resumeApplied = false;
  video.addEventListener("loadedmetadata", () => {
    timeDuration.textContent = fmtTime(video.duration);
    if (!resumeApplied && savedProgress && savedProgress.position > 2 &&
        savedProgress.duration && savedProgress.position < savedProgress.duration * 0.97) {
      video.currentTime = savedProgress.position;
    }
    resumeApplied = true;
    video.play().catch(() => { /* autoplay mungkin diblok browser, biarin user klik play */ });
  });

  video.addEventListener("play", () => { playBtn.textContent = "❚❚"; });
  video.addEventListener("pause", () => { playBtn.textContent = "▶"; saveProgressNow(); });

  video.addEventListener("timeupdate", () => {
    timeCurrent.textContent = fmtTime(video.currentTime);
    if (video.duration) {
      seekFill.style.width = `${(video.currentTime / video.duration) * 100}%`;
    }
  });

  video.addEventListener("error", () => {
    app.querySelector(".player-shell").innerHTML = `
      <div class="empty-state" style="padding:40px;">
        <strong>Video tidak bisa diputar</strong>
        Format file ini (<code>${escapeHtml(episode.ext || "")}</code>) mungkin tidak didukung browser secara langsung.
        Coba konversi ke .mp4 (H.264 + AAC) untuk kompatibilitas terbaik.
      </div>`;
  });

  video.addEventListener("ended", () => {
    saveProgressNow();
    if (nextEp) window.location.hash = `#/watch/${series.id}/${nextEp.id}`;
  });

  playBtn.onclick = () => { video.paused ? video.play() : video.pause(); };
  backBtn.onclick = () => { video.currentTime = Math.max(0, video.currentTime - 10); };
  fwdBtn.onclick = () => { video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10); };
  volSlider.oninput = () => { video.volume = parseFloat(volSlider.value); };

  fsBtn.onclick = () => {
    if (!document.fullscreenElement) playerShell.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  seekBar.addEventListener("click", (e) => {
    const rect = seekBar.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    if (video.duration) video.currentTime = ratio * video.duration;
  });

  document.getElementById("prevBtn").onclick = () => {
    if (prevEp) window.location.hash = `#/watch/${series.id}/${prevEp.id}`;
  };
  document.getElementById("nextBtn").onclick = () => {
    if (nextEp) window.location.hash = `#/watch/${series.id}/${nextEp.id}`;
  };

  // ---- Keyboard shortcut: panah kanan/kiri buat skip 10 detik, spasi play/pause, atas/bawah volume ----
  function handleKeydown(e) {
    // Jangan ganggu kalau lagi ngetik di search box atau input lain
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;

    switch (e.code) {
      case "ArrowRight":
        e.preventDefault();
        video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
        break;
      case "ArrowLeft":
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - 10);
        break;
      case "Space":
        e.preventDefault();
        video.paused ? video.play() : video.pause();
        break;
      case "ArrowUp":
        e.preventDefault();
        video.volume = Math.min(1, video.volume + 0.1);
        volSlider.value = video.volume;
        break;
      case "ArrowDown":
        e.preventDefault();
        video.volume = Math.max(0, video.volume - 0.1);
        volSlider.value = video.volume;
        break;
    }
  }
  window.addEventListener("keydown", handleKeydown);

  function saveProgressNow() {
    if (!video.duration) return;
    api(`/api/progress/${episode.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position: video.currentTime, duration: video.duration }),
    }).catch(() => { /* diam-diam gagal, ga usah ganggu UX nonton */ });
  }

  const progressInterval = setInterval(() => {
    if (!video.paused) saveProgressNow();
  }, 5000);

  window.addEventListener("beforeunload", saveProgressNow);

  // Bersihkan interval & keyboard listener kalau pindah halaman (hindari leak/dobel listener)
  const cleanup = () => {
    clearInterval(progressInterval);
    window.removeEventListener("keydown", handleKeydown);
    window.removeEventListener("hashchange", cleanup);
  };
  window.addEventListener("hashchange", cleanup, { once: true });
}

// ---------------- Global controls ----------------
rescanBtn.addEventListener("click", async () => {
  rescanBtn.disabled = true;
  rescanBtn.textContent = "⟳ Scanning…";
  try {
    const result = await api("/api/scan", { method: "POST" });
    showToast(`Scan selesai: ${result.seriesCount} series ditemukan`);
    libraryCache = null;
    await router();
  } catch (err) {
    showToast(`Scan gagal: ${err.message}`);
  } finally {
    rescanBtn.disabled = false;
    rescanBtn.textContent = "⟳ Scan ulang";
  }
});

let searchDebounce;
searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    searchQuery = searchInput.value.trim();
    if (!window.location.hash || window.location.hash === "#/") {
      renderHomePage();
    }
  }, 150);
});

router();
