// server.js
// Server offline buat streaming anime lokal, mirip Crunchyroll (UI custom).
// Sengaja ditulis pakai Node.js built-in modules aja (http, fs, path) --
// TANPA Express / npm package apapun -- supaya:
//   1) Ga perlu "npm install" sama sekali (nol resiko gagal install)
//   2) Dijamin jalan di mesin manapun yang sudah ada Node.js
//   3) 100% offline dari awal sampai akhir

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const store = require("./lib/store");
const { scanLibrary } = require("./lib/scanner");
const { generateThumbnail } = require("./lib/thumbnail");

// ---------- Load config ----------
const CONFIG_PATH = path.join(__dirname, "config.json");
let config;
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
} catch (err) {
  console.error(`[config] Gagal baca config.json: ${err.message}`);
  console.error(`[config] Pastikan file config.json ada di folder yang sama dengan server.js`);
  process.exit(1);
}

// Argumen command line bisa override path library, contoh:
//   node server.js "D:\Anime Saya"
if (process.argv[2]) {
  config.libraryPath = process.argv[2];
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : (config.port || 4848);
const LIBRARY_PATH = path.resolve(__dirname, config.libraryPath);
const VIDEO_EXTS = config.videoExtensions || [".mp4", ".mkv", ".webm", ".mov", ".avi", ".m4v"];
const PUBLIC_DIR = path.join(__dirname, "public");
const THUMB_DIR = path.join(store.DATA_DIR, "thumbs");

store.ensureDataDir();
if (!fs.existsSync(THUMB_DIR)) fs.mkdirSync(THUMB_DIR, { recursive: true });

// ---------- In-memory index (dibangun dari scan) ----------
let libraryIndex = { series: [], seriesById: {}, episodeById: {}, errors: [], scannedAt: null };

function rebuildIndex() {
  const scanResult = scanLibrary(LIBRARY_PATH, VIDEO_EXTS);
  const seriesById = {};
  const episodeById = {};
  for (const s of scanResult.series) {
    seriesById[s.id] = s;
    for (const ep of s.episodes) {
      episodeById[ep.id] = ep;
    }
  }
  libraryIndex = {
    series: scanResult.series,
    seriesById,
    episodeById,
    errors: scanResult.errors,
    scannedAt: scanResult.scannedAt,
  };
  store.saveLibraryCache({
    series: scanResult.series,
    errors: scanResult.errors,
    scannedAt: scanResult.scannedAt,
  });
  console.log(
    `[scan] Selesai. Ditemukan ${scanResult.series.length} series. ` +
      (scanResult.errors.length ? `${scanResult.errors.length} peringatan (cek log di atas).` : "")
  );
  return libraryIndex;
}

// Coba pakai cache dulu biar startup cepat, lalu tetap rescan di background
const cached = store.getLibraryCache();
if (cached && cached.series) {
  const seriesById = {};
  const episodeById = {};
  for (const s of cached.series) {
    seriesById[s.id] = s;
    for (const ep of s.episodes) episodeById[ep.id] = ep;
  }
  libraryIndex = {
    series: cached.series,
    seriesById,
    episodeById,
    errors: cached.errors || [],
    scannedAt: cached.scannedAt,
  };
  console.log(`[startup] Load cache: ${cached.series.length} series (dari scan terakhir).`);
}
rebuildIndex();

// ---------- Helper: kirim JSON ----------
function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    const MAX = 1024 * 1024; // 1MB cukup buat body kecil (progress update)
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX) {
        reject(new Error("Body terlalu besar"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error("Body bukan JSON valid"));
      }
    });
    req.on("error", reject);
  });
}

// ---------- Static file serving (untuk folder public/) ----------
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

function serveStaticFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendError(res, 404, "File tidak ditemukan");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Content-Length": data.length,
    });
    res.end(data);
  });
}

const VIDEO_MIME = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".m4v": "video/x-m4v",
};

// ---------- Streaming video dengan dukungan Range (biar bisa seek) ----------
function streamVideo(req, res, episode) {
  const filePath = episode.filePath;

  fs.stat(filePath, (err, stat) => {
    if (err) {
      sendError(res, 404, `File video tidak ditemukan di disk: ${filePath}. Mungkin file sudah dipindah/dihapus, coba scan ulang.`);
      return;
    }

    const fileSize = stat.size;
    const range = req.headers.range;
    const mime = VIDEO_MIME[episode.ext] || "application/octet-stream";

    if (!range) {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": mime,
        "Accept-Ranges": "bytes",
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (!match) {
      sendError(res, 416, "Range header tidak valid");
      return;
    }
    let start = match[1] ? parseInt(match[1], 10) : 0;
    let end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

    if (isNaN(start) || isNaN(end) || start > end || start >= fileSize) {
      res.writeHead(416, { "Content-Range": `bytes */${fileSize}` });
      res.end();
      return;
    }
    end = Math.min(end, fileSize - 1);

    const chunkSize = end - start + 1;
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": mime,
    });

    const stream = fs.createReadStream(filePath, { start, end });
    stream.on("error", (streamErr) => {
      console.error(`[stream] Error streaming ${filePath}: ${streamErr.message}`);
      if (!res.headersSent) sendError(res, 500, "Gagal membaca file video");
      else res.end();
    });
    stream.pipe(res);
  });
}

// ---------- Thumbnail serving (generate on-demand + cache) ----------
async function serveThumbnail(res, series) {
  // 1. Kalau ada cover.jpg/poster.jpg manual di folder series, pakai itu
  if (series.posterPath && fs.existsSync(series.posterPath)) {
    return serveStaticFile(res, series.posterPath);
  }

  // 2. Kalau sudah pernah digenerate, pakai cache
  const cachedThumb = path.join(THUMB_DIR, `${series.id}.jpg`);
  if (fs.existsSync(cachedThumb)) {
    return serveStaticFile(res, cachedThumb);
  }

  // 3. Coba generate dari frame video episode pertama pakai ffmpeg
  const firstEp = series.episodes && series.episodes[0];
  if (firstEp) {
    const ok = await generateThumbnail(firstEp.filePath, cachedThumb, 30);
    if (ok) return serveStaticFile(res, cachedThumb);
  }

  // 4. Gagal semua -> 404, frontend akan fallback ke placeholder css
  sendError(res, 404, "Poster tidak tersedia");
}

// ---------- Router ----------
async function handleApi(req, res, pathname, query) {
  // GET /api/library
  if (pathname === "/api/library" && req.method === "GET") {
    const seriesList = libraryIndex.series.map((s) => ({
      id: s.id,
      title: s.title,
      episodeCount: s.episodeCount,
    }));
    sendJson(res, 200, {
      series: seriesList,
      errors: libraryIndex.errors,
      scannedAt: libraryIndex.scannedAt,
      libraryPath: LIBRARY_PATH,
    });
    return;
  }

  // POST /api/scan  -> rescan folder library
  if (pathname === "/api/scan" && req.method === "POST") {
    rebuildIndex();
    sendJson(res, 200, {
      ok: true,
      seriesCount: libraryIndex.series.length,
      errors: libraryIndex.errors,
    });
    return;
  }

  // GET /api/series/:id
  let m = pathname.match(/^\/api\/series\/([a-f0-9]+)$/);
  if (m && req.method === "GET") {
    const series = libraryIndex.seriesById[m[1]];
    if (!series) return sendError(res, 404, "Series tidak ditemukan");
    const progress = store.getAllProgress();
    const episodes = series.episodes.map((ep) => ({
      id: ep.id,
      title: ep.title,
      episodeNumber: ep.episodeNumber,
      filename: ep.filename,
      sizeBytes: ep.sizeBytes,
      progress: progress[ep.id] || null,
    }));
    sendJson(res, 200, {
      id: series.id,
      title: series.title,
      episodeCount: series.episodeCount,
      episodes,
    });
    return;
  }

  // GET /api/thumb/:seriesId
  m = pathname.match(/^\/api\/thumb\/([a-f0-9]+)$/);
  if (m && req.method === "GET") {
    const series = libraryIndex.seriesById[m[1]];
    if (!series) return sendError(res, 404, "Series tidak ditemukan");
    await serveThumbnail(res, series);
    return;
  }

  // GET /api/stream/:episodeId
  m = pathname.match(/^\/api\/stream\/([a-f0-9]+)$/);
  if (m && req.method === "GET") {
    const episode = libraryIndex.episodeById[m[1]];
    if (!episode) return sendError(res, 404, "Episode tidak ditemukan");
    streamVideo(req, res, episode);
    return;
  }

  // GET /api/progress/:episodeId
  m = pathname.match(/^\/api\/progress\/([a-f0-9]+)$/);
  if (m && req.method === "GET") {
    const p = store.getProgress(m[1]);
    sendJson(res, 200, p || { position: 0, duration: 0 });
    return;
  }

  // POST /api/progress/:episodeId  body: { position, duration }
  if (m && req.method === "POST") {
    try {
      const body = await readRequestBody(req);
      const position = Number(body.position) || 0;
      const duration = Number(body.duration) || 0;
      const saved = store.setProgress(m[1], position, duration);
      sendJson(res, 200, saved);
    } catch (err) {
      sendError(res, 400, err.message);
    }
    return;
  }

  // GET /api/continue-watching
  if (pathname === "/api/continue-watching" && req.method === "GET") {
    const allProgress = store.getAllProgress();
    const items = [];
    for (const [episodeId, prog] of Object.entries(allProgress)) {
      const ep = libraryIndex.episodeById[episodeId];
      if (!ep) continue; // file mungkin sudah dihapus/dipindah
      if (!prog.duration || prog.position <= 0) continue;
      const pct = prog.position / prog.duration;
      if (pct >= 0.97) continue; // udah kelar nonton, ga usah muncul di "lanjutkan"
      const series = libraryIndex.seriesById[ep.seriesId];
      items.push({
        episodeId,
        seriesId: ep.seriesId,
        seriesTitle: series ? series.title : "(tidak diketahui)",
        episodeTitle: ep.title,
        position: prog.position,
        duration: prog.duration,
        updatedAt: prog.updatedAt,
      });
    }
    items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    sendJson(res, 200, items.slice(0, 20));
    return;
  }

  sendError(res, 404, "Endpoint API tidak ditemukan");
}

// ---------- Server utama ----------
const server = http.createServer((req, res) => {
  let parsedUrl;
  try {
    parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  } catch (err) {
    sendError(res, 400, "URL tidak valid");
    return;
  }
  const pathname = decodeURIComponent(parsedUrl.pathname);

  if (pathname.startsWith("/api/")) {
    handleApi(req, res, pathname, parsedUrl.searchParams).catch((err) => {
      console.error(`[server] Error tak terduga di API ${pathname}: ${err.message}`);
      if (!res.headersSent) sendError(res, 500, "Terjadi kesalahan di server");
    });
    return;
  }

  // Static frontend
  let filePath;
  if (pathname === "/" || pathname === "") {
    filePath = path.join(PUBLIC_DIR, "index.html");
  } else {
    // Cegah path traversal (../../etc/passwd dsb)
    const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
    filePath = path.join(PUBLIC_DIR, safePath);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      sendError(res, 403, "Akses ditolak");
      return;
    }
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // fallback ke index.html buat client-side routing (hash routing sebenernya ga butuh ini,
      // tapi jaga-jaga kalau ada refresh di path aneh)
      serveStaticFile(res, path.join(PUBLIC_DIR, "index.html"));
      return;
    }
    serveStaticFile(res, filePath);
  });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n[FATAL] Port ${PORT} sudah dipakai aplikasi lain.`);
    console.error(`Solusi: tutup aplikasi yang pakai port itu, atau ganti "port" di config.json lalu jalankan lagi.\n`);
    process.exit(1);
  } else {
    console.error(`[FATAL] Server error: ${err.message}`);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log("");
  console.log("========================================");
  console.log("  Anime Server Offline - AKTIF");
  console.log("========================================");
  console.log(`  Folder library : ${LIBRARY_PATH}`);
  console.log(`  Buka di browser: http://localhost:${PORT}`);
  console.log("  Tekan CTRL+C untuk mematikan server");
  console.log("========================================");
  console.log("");
  if (libraryIndex.errors.length) {
    console.log("  Peringatan saat scan:");
    for (const e of libraryIndex.errors) console.log(`   - ${e}`);
    console.log("");
  }
});
