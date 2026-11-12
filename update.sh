#!/bin/bash
set -e

echo "======================================================================"
echo "                     CLIPCUT AI ONE-CLICK UPDATER"
echo "======================================================================"
echo ""

if [ -d "autoclip" ]; then
    cd autoclip
fi

echo "[*] Pulling latest features from GitHub..."
git pull origin main

if [ -f ".venv/bin/activate" ]; then
    echo "[*] Syncing dependencies..."
    source .venv/bin/activate
    pip install -e .
fi

echo ""
echo "======================================================================"
echo "[+] ClipCut AI is fully up to date! Run ./run.sh to launch."
echo "======================================================================"
echo ""

