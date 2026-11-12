@echo off
setlocal enabledelayedexpansion
title ClipCut AI Studio - Autonomous Video Engine

:: 1. Ensure working directory is the script folder
cd /d "%~dp0"

echo ======================================================================
echo                      CLIPCUT AI STUDIO
echo       Autonomous Multi-Pipeline AI Video Engine for Shorts and Reels
echo ======================================================================
echo.

:: 2. Check Python installation
where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [X] Python was not found on your system PATH!
    echo.
    echo Please install Python 3.10 or 3.11 from:
    echo https://www.python.org/downloads/
    echo.
    echo IMPORTANT: Make sure to check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

:: 3. Check FFmpeg installation
where ffmpeg >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [!] Warning: FFmpeg is not detected in your system PATH.
    echo ClipCut requires FFmpeg to slice, caption, and render videos.
    echo.
    echo Attempting to install FFmpeg automatically via winget...
    winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements
    if !ERRORLEVEL! neq 0 (
        echo [!] Could not auto-install FFmpeg.
        echo Please download and install FFmpeg from https://www.gyan.dev/ffmpeg/builds/
        echo or run: winget install Gyan.FFmpeg
        echo.
    ) else (
        echo [+] FFmpeg installed successfully!
    )
)

:: 4. Create virtual environment if it does not exist
if not exist ".venv\Scripts\activate.bat" (
    echo [*] First-time setup detected. Creating Python virtual environment...
    python -m venv .venv
    if !ERRORLEVEL! neq 0 (
        echo [X] Failed to create virtual environment. Please verify your Python installation.
        pause
        exit /b 1
    )
    
    echo [*] Activating virtual environment...
    call .venv\Scripts\activate.bat
    
    echo [*] Installing ClipCut AI dependencies... This takes 1 to 2 minutes on first run.
    python -m pip install --upgrade pip
    pip install -e .
    if !ERRORLEVEL! neq 0 (
        echo [X] Failed to install dependencies. Please check your internet connection.
        pause
        exit /b 1
    )
    echo [+] Dependencies installed successfully!
) else (
    call .venv\Scripts\activate.bat
)

:: 5. Launch ClipCut Studio Server and open browser
echo.
echo ======================================================================
echo [*] Starting ClipCut Studio Server on http://localhost:8000 ...
echo [*] Opening ClipCut in your default browser...
echo [*] Press Ctrl+C in this terminal window anytime to stop the server.
echo ======================================================================
echo.

:: Launch via the virtual environment's python directly
.venv\Scripts\python.exe -m autoclip.cli serve --open

if %ERRORLEVEL% neq 0 (
    echo.
    echo [X] Server stopped or exited with error code: %ERRORLEVEL%
    pause
)
