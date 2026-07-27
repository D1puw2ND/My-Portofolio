#!/bin/bash
# Jalankan server dari folder tempat file ini berada, apapun direktori aktifnya
cd "$(dirname "$0")"
echo "========================================"
echo "  Menjalankan Rak Anime (server offline)"
echo "========================================"
echo ""
node server.js
echo ""
echo "Server berhenti. Tekan ENTER untuk menutup."
read
