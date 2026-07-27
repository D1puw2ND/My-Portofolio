// lib/store.js
// Penyimpanan data super sederhana pakai file JSON di disk.
// Sengaja TIDAK pakai SQLite/database eksternal supaya nol dependency,
// nol resiko gagal install, dan 100% jalan offline.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const LIBRARY_CACHE_FILE = path.join(DATA_DIR, "library.json");
const PROGRESS_FILE = path.join(DATA_DIR, "progress.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[store] Gagal baca ${filePath}, pakai fallback. Error: ${err.message}`);
    return fallback;
  }
}

function writeJsonSafe(filePath, data) {
  ensureDataDir();
  try {
    const tmpPath = filePath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmpPath, filePath); // atomic-ish write, cegah file korup kalau kepotong
    return true;
  } catch (err) {
    console.error(`[store] Gagal tulis ${filePath}: ${err.message}`);
    return false;
  }
}

function getLibraryCache() {
  return readJsonSafe(LIBRARY_CACHE_FILE, null);
}

function saveLibraryCache(libraryData) {
  return writeJsonSafe(LIBRARY_CACHE_FILE, libraryData);
}

function getAllProgress() {
  return readJsonSafe(PROGRESS_FILE, {});
}

function getProgress(episodeId) {
  const all = getAllProgress();
  return all[episodeId] || null;
}

function setProgress(episodeId, position, duration) {
  const all = getAllProgress();
  all[episodeId] = {
    position,
    duration,
    updatedAt: new Date().toISOString(),
  };
  writeJsonSafe(PROGRESS_FILE, all);
  return all[episodeId];
}

module.exports = {
  ensureDataDir,
  getLibraryCache,
  saveLibraryCache,
  getAllProgress,
  getProgress,
  setProgress,
  DATA_DIR,
};
