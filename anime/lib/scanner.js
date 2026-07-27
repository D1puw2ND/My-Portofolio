// lib/scanner.js
// Scan folder lokal berisi anime, kelompokkan jadi series + episode.
//
// Struktur folder yang diharapkan:
//   <libraryPath>/
//     Nama Anime A/
//       Nama Anime A - 01.mp4
//       Nama Anime A - 02.mp4
//       cover.jpg              (opsional, buat poster)
//     Nama Anime B/
//       Season 1/
//         ep01.mkv
//       Season 2/
//         ep01.mkv
//
// Setiap subfolder LANGSUNG di dalam libraryPath dianggap 1 series.
// File video di dalamnya (termasuk di sub-subfolder) dianggap episode.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const POSTER_NAMES = ["cover", "poster", "folder"];
const POSTER_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

function stableId(str) {
  return crypto.createHash("md5").update(str).digest("hex").slice(0, 16);
}

// Natural sort supaya "Episode 2" tampil sebelum "Episode 10"
function naturalCompare(a, b) {
  const ax = [];
  const bx = [];
  a.replace(/(\d+)|(\D+)/g, (_, num, str) => ax.push([num || Infinity, str || ""]));
  b.replace(/(\d+)|(\D+)/g, (_, num, str) => bx.push([num || Infinity, str || ""]));
  while (ax.length && bx.length) {
    const an = ax.shift();
    const bn = bx.shift();
    const nn = (an[0] - bn[0]) || an[1].localeCompare(bn[1]);
    if (nn) return nn;
  }
  return ax.length - bx.length;
}

function extractEpisodeNumber(filename) {
  const base = path.basename(filename, path.extname(filename));
  // Coba pola umum: S01E02, EP02, E02, "- 02", "02"
  const patterns = [
    /[Ss]\d{1,2}[Ee](\d{1,4})/,
    /[Ee][Pp]\.?\s*(\d{1,4})/,
    /[Ee](\d{1,4})\b/,
    /-\s*(\d{1,4})\b/,
    /\b(\d{1,4})\b/,
  ];
  for (const re of patterns) {
    const m = base.match(re);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function findPoster(dirPath) {
  try {
    const files = fs.readdirSync(dirPath);
    for (const name of POSTER_NAMES) {
      for (const ext of POSTER_EXTS) {
        const match = files.find((f) => f.toLowerCase() === name + ext);
        if (match) return path.join(dirPath, match);
      }
    }
  } catch (err) {
    // folder ga bisa dibaca, skip aja, ga usah crash
  }
  return null;
}

function walkVideos(dirPath, videoExtensions, relativeTo) {
  let results = [];
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (err) {
    console.error(`[scanner] Gagal baca folder ${dirPath}: ${err.message}`);
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkVideos(fullPath, videoExtensions, relativeTo));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (videoExtensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function scanLibrary(libraryPath, videoExtensions) {
  const result = {
    scannedAt: new Date().toISOString(),
    libraryPath,
    series: [],
    errors: [],
  };

  if (!fs.existsSync(libraryPath)) {
    result.errors.push(
      `Folder library tidak ditemukan: ${libraryPath}. ` +
        `Cek lagi path di config.json, pastikan foldernya ada dan penulisannya benar.`
    );
    return result;
  }

  let topEntries;
  try {
    topEntries = fs.readdirSync(libraryPath, { withFileTypes: true });
  } catch (err) {
    result.errors.push(`Tidak bisa membaca folder library: ${err.message}`);
    return result;
  }

  const seriesFolders = topEntries.filter((e) => e.isDirectory());

  if (seriesFolders.length === 0) {
    result.errors.push(
      `Tidak ada subfolder series di dalam ${libraryPath}. ` +
        `Pastikan tiap anime punya foldernya sendiri, isinya file video.`
    );
  }

  for (const folder of seriesFolders) {
    const seriesPath = path.join(libraryPath, folder.name);
    const videoFiles = walkVideos(seriesPath, videoExtensions, seriesPath);

    if (videoFiles.length === 0) {
      // folder kosong / ga ada video, skip tapi catat biar user tau
      result.errors.push(`Folder "${folder.name}" tidak berisi file video, dilewati.`);
      continue;
    }

    videoFiles.sort((a, b) => naturalCompare(path.basename(a), path.basename(b)));

    const seriesId = stableId(seriesPath);
    const posterPath = findPoster(seriesPath);

    const episodes = videoFiles.map((filePath, idx) => {
      const episodeId = stableId(filePath);
      const filename = path.basename(filePath);
      const epNum = extractEpisodeNumber(filename);
      let stat = null;
      try {
        stat = fs.statSync(filePath);
      } catch (err) {
        // kalau gagal stat, tetep lanjut, cuma size jadi null
      }
      return {
        id: episodeId,
        seriesId,
        filePath,
        filename,
        title: `Episode ${epNum !== null ? epNum : idx + 1}`,
        episodeNumber: epNum !== null ? epNum : idx + 1,
        sizeBytes: stat ? stat.size : null,
        ext: path.extname(filePath).toLowerCase(),
      };
    });

    result.series.push({
      id: seriesId,
      title: folder.name,
      folderPath: seriesPath,
      posterPath,
      episodeCount: episodes.length,
      episodes,
    });
  }

  result.series.sort((a, b) => a.title.localeCompare(b.title));

  return result;
}

module.exports = {
  scanLibrary,
  naturalCompare,
};
