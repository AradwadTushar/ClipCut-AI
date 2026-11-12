#!/bin/bash
set -e

echo "======================================================================"
echo "                     CLIPCUT AI STUDIO"
echo "      Autonomous Multi-Pipeline AI Video Engine for Shorts & Reels"
echo "======================================================================"
echo ""

if [ -d "autoclip" ]; then
    cd autoclip
fi

if ! command -v python3 &> /dev/null; then
    echo "[X] Python 3 was not found! Please install Python 3.10 or 3.11."
    exit 1
fi

if ! command -v ffmpeg &> /dev/null; then
    echo "[!] Warning: FFmpeg is not detected in your PATH."
    echo "On macOS: brew install ffmpeg"
    echo "On Ubuntu/Debian: sudo apt update && sudo apt install -y ffmpeg"
fi

if [ ! -d ".venv" ]; then
    echo "[*] First-time setup detected. Creating Python virtual environment..."
    python3 -m venv .venv
    source .venv/bin/activate
    echo "[*] Installing ClipCut AI dependencies (takes 1-2 minutes on first run)..."
    pip install --upgrade pip
    pip install -e .
    echo "[+] Dependencies installed successfully!"
else
    source .venv/bin/activate
fi

echo ""
echo "======================================================================"
echo "[*] Starting ClipCut Studio Server on http://localhost:8000 ..."
echo "[*] Press Ctrl+C anytime to stop the server."
echo "======================================================================"
echo ""

if [[ "$OSTYPE" == "darwin"* ]]; then
    (sleep 2 && open http://localhost:8000) &
elif command -v xdg-open &> /dev/null; then
    (sleep 2 && xdg-open http://localhost:8000) &
fi

autoclip serve --no-open

