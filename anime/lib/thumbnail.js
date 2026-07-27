// lib/thumbnail.js
// Generate thumbnail poster dari frame video pakai ffmpeg (kalau ffmpeg ada di sistem).
// Kalau ffmpeg tidak ada / gagal, fungsi ini tetap AMAN (return false),
// frontend akan otomatis pakai placeholder bergambar huruf inisial.

const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

let ffmpegChecked = false;
let ffmpegAvailable = false;

function checkFfmpeg(callback) {
  if (ffmpegChecked) return callback(ffmpegAvailable);
  execFile("ffmpeg", ["-version"], (err) => {
    ffmpegChecked = true;
    ffmpegAvailable = !err;
    if (!ffmpegAvailable) {
      console.warn(
        "[thumbnail] ffmpeg tidak ditemukan di sistem. Poster otomatis dari video " +
          "tidak akan dibuat, tapi server tetap jalan normal (pakai placeholder)."
      );
    }
    callback(ffmpegAvailable);
  });
}

// Ambil 1 frame di detik ke-`atSecond` dari videoPath, simpan sebagai outputJpgPath
function generateThumbnail(videoPath, outputJpgPath, atSecond = 30) {
  return new Promise((resolve) => {
    checkFfmpeg((available) => {
      if (!available) return resolve(false);

      try {
        const outDir = path.dirname(outputJpgPath);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      } catch (err) {
        console.error(`[thumbnail] Gagal siapkan folder output: ${err.message}`);
        return resolve(false);
      }

      const args = [
        "-y",
        "-ss", String(atSecond),
        "-i", videoPath,
        "-frames:v", "1",
        "-q:v", "4",
        "-vf", "scale=400:-1",
        outputJpgPath,
      ];

      const child = execFile("ffmpeg", args, { timeout: 20000 }, (err) => {
        // Catatan penting: kalau -ss melebihi durasi video (video pendek),
        // ffmpeg bisa exit code 0 (tidak ada "err") TAPI tidak menulis frame
        // sama sekali. Jadi kita selalu cek fs.existsSync, bukan cuma cek err.
        if (!err && fs.existsSync(outputJpgPath)) {
          return resolve(true);
        }

        // Retry di detik ke-1 (aman untuk video pendek), lalu retry terakhir di detik ke-0
        const retryAt = (sec, isLast) => {
          const retryArgs = [
            "-y",
            "-ss", String(sec),
            "-i", videoPath,
            "-frames:v", "1",
            "-q:v", "4",
            "-vf", "scale=400:-1",
            outputJpgPath,
          ];
          execFile("ffmpeg", retryArgs, { timeout: 20000 }, (err2) => {
            if (!err2 && fs.existsSync(outputJpgPath)) {
              return resolve(true);
            }
            if (isLast) {
              if (err2) console.error(`[thumbnail] Gagal generate thumbnail untuk ${videoPath}: ${err2.message}`);
              else console.error(`[thumbnail] ffmpeg tidak menghasilkan file thumbnail untuk ${videoPath}`);
              return resolve(false);
            }
            retryAt(0, true);
          });
        };
        retryAt(1, false);
      });

      child.on("error", () => resolve(false));
    });
  });
}

module.exports = { generateThumbnail, checkFfmpeg };
