@echo off
setlocal enabledelayedexpansion
title ClipCut AI Studio - Autonomous Video Engine

echo ======================================================================
echo                      CLIPCUT AI STUDIO
echo       Autonomous Multi-Pipeline AI Video Engine for Shorts & Reels
echo ======================================================================
echo.

:: 1. Navigate to autoclip directory if running from repository root
if exist "autoclip" (
    cd autoclip
)

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

:: 3. Check FFmpeg
where ffmpeg >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [!] Warning: FFmpeg is not detected in your PATH.
    echo ClipCut requires FFmpeg to slice and render videos.
    echo.
    echo Attempting to install FFmpeg automatically via winget...
    winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements
    if %ERRORLEVEL% neq 0 (
        echo [!] Could not auto-install FFmpeg. Please install FFmpeg from:
        echo https://www.gyan.dev/ffmpeg/builds/
        echo (or run: winget install Gyan.FFmpeg)
        echo.
    ) else (
        echo [+] FFmpeg installed successfully!
    )
)

:: 4. Create and activate virtual environment if it doesn't exist
if not exist ".venv\Scripts\activate.bat" (
    echo [*] First-time setup detected. Creating Python virtual environment...
    python -m venv .venv
    if %ERRORLEVEL% neq 0 (
        echo [X] Failed to create virtual environment. Please verify your Python installation.
        pause
        exit /b 1
    )
    
    echo [*] Activating virtual environment...
    call .venv\Scripts\activate.bat
    
    echo [*] Installing ClipCut AI dependencies (this takes 1-2 minutes on first run)...
    python -m pip install --upgrade pip
    pip install -e .
    if %ERRORLEVEL% neq 0 (
        echo [X] Failed to install dependencies. Please check your internet connection.
        pause
        exit /b 1
    )
    echo [+] Dependencies installed successfully!
) else (
    call .venv\Scripts\activate.bat
)

:: 5. Launch Browser & Server
echo.
echo ======================================================================
echo [*] Starting ClipCut Studio Server on http://localhost:8000 ...
echo [*] Opening ClipCut in your default browser...
echo [*] Press Ctrl+C in this window anytime to stop the server.
echo ======================================================================
echo.

:: Pop open the browser after a 2-second delay in background
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8000"

:: Start the FastAPI server
autoclip serve --no-open

pause

