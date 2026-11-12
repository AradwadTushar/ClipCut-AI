#!/bin/bash
set -e

echo "======================================================================"
echo "                     CLIPCUT AI STUDIO"
echo "      Autonomous Multi-Pipeline AI Video Engine for Shorts and Reels"
echo "======================================================================"
echo ""

if [ -d "autoclip" ]; then
    cd autoclip
fi

# Locate Python 3.11 or 3.12
PYTHON_BIN=""
for cmd in python3.11 python3.12 python3 python; do
    if command -v "$cmd" &> /dev/null; then
        if "$cmd" -c "import sys; sys.exit(0 if (3, 11) <= sys.version_info < (3, 13) else 1)" &> /dev/null; then
            PYTHON_BIN="$cmd"
            break
        fi
    fi
done

if [ -z "$PYTHON_BIN" ]; then
    echo "[X] Python 3.11 or 3.12 was not found! ClipCut requires Python 3.11 or 3.12."
    echo "On macOS: brew install python@3.11"
    echo "On Ubuntu/Debian: sudo apt update && sudo apt install -y python3.11 python3.11-venv"
    exit 1
fi

echo "[+] Using Python runtime: $($PYTHON_BIN --version)"

if ! command -v ffmpeg &> /dev/null; then
    echo "[!] Warning: FFmpeg is not detected in your PATH."
    echo "On macOS: brew install ffmpeg"
    echo "On Ubuntu/Debian: sudo apt update && sudo apt install -y ffmpeg"
fi

# Rebuild venv if it was built with incompatible Python
if [ -f ".venv/bin/python" ]; then
    if ! .venv/bin/python -c "import sys; sys.exit(0 if (3, 11) <= sys.version_info < (3, 13) else 1)" &> /dev/null; then
        echo "[!] Incompatible virtual environment detected. Rebuilding with Python 3.11/3.12..."
        rm -rf .venv
    fi
fi

if [ ! -d ".venv" ]; then
    echo "[*] First-time setup detected. Creating Python virtual environment..."
    "$PYTHON_BIN" -m venv .venv
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

.venv/bin/python -m autoclip.cli serve --no-open
