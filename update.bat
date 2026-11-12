@echo off
setlocal enabledelayedexpansion
title ClipCut AI - One-Click Updater

cd /d "%~dp0"

echo ======================================================================
echo                     CLIPCUT AI ONE-CLICK UPDATER
echo ======================================================================
echo.

echo [*] Pulling latest features from GitHub...
git pull origin main

if exist ".venv\Scripts\activate.bat" (
    echo [*] Syncing dependencies...
    call .venv\Scripts\activate.bat
    pip install -e .
)

echo.
echo ======================================================================
echo [+] ClipCut AI is fully up to date! Double-click run.bat to launch.
echo ======================================================================
echo.
pause
