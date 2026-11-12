@echo off
setlocal enabledelayedexpansion
title ClipCut AI Studio - Autonomous Video Engine

:: 1. Ensure working directory is the script folder
cd /d "%~dp0"

:: Check if launched in silent background mode
set "IS_SILENT=0"
if "%1"=="--silent" set "IS_SILENT=1"
if "%2"=="--silent" set "IS_SILENT=1"

echo ======================================================================
echo                      CLIPCUT AI STUDIO
echo       Autonomous Multi-Pipeline AI Video Engine for Shorts and Reels
echo ======================================================================
echo.

:: 2. Check if an existing virtual environment exists and is compatible (Python >=3.11 and <3.13)
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" -c "import sys; sys.exit(0 if (3, 11) <= sys.version_info < (3, 13) else 1)" >nul 2>&1
    if errorlevel 1 (
        echo [!] Existing virtual environment was created with an incompatible Python version.
        echo [*] Rebuilding virtual environment with Python 3.11...
        rmdir /s /q ".venv"
    )
)

:: 3. Find a compatible Python executable (Python 3.11 or 3.12)
set "PYTHON_EXE="
set "PYTHON_ARGS="

:: Check standard Windows AppData user installations (most common)
if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    goto :python_found
)
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    goto :python_found
)

:: Check standard Program Files system installations
if exist "%ProgramFiles%\Python311\python.exe" (
    set "PYTHON_EXE=%ProgramFiles%\Python311\python.exe"
    goto :python_found
)
if exist "%ProgramFiles%\Python312\python.exe" (
    set "PYTHON_EXE=%ProgramFiles%\Python312\python.exe"
    goto :python_found
)

:: Check root drive installations
if exist "C:\Python311\python.exe" (
    set "PYTHON_EXE=C:\Python311\python.exe"
    goto :python_found
)
if exist "C:\Python312\python.exe" (
    set "PYTHON_EXE=C:\Python312\python.exe"
    goto :python_found
)

:: Check if default python on PATH is compatible (>= 3.11 and < 3.13)
where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
    python -c "import sys; sys.exit(0 if (3, 11) <= sys.version_info < (3, 13) else 1)" >nul 2>&1
    if not errorlevel 1 (
        set "PYTHON_EXE=python"
        goto :python_found
    )
)

:: Check Windows py launcher for 3.11 or 3.12
py -3.11 -c "exit()" >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_EXE=py"
    set "PYTHON_ARGS=-3.11"
    goto :python_found
)
py -3.12 -c "exit()" >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_EXE=py"
    set "PYTHON_ARGS=-3.12"
    goto :python_found
)

:: Scan all python binaries on PATH to find any 3.11 or 3.12
for /f "delims=" %%p in ('where python 2^>nul') do (
    "%%p" -c "import sys; sys.exit(0 if (3, 11) <= sys.version_info < (3, 13) else 1)" >nul 2>&1
    if not errorlevel 1 (
        set "PYTHON_EXE=%%p"
        goto :python_found
    )
)

:: If no compatible Python was found
echo [X] Python 3.11 or 3.12 was not found!
echo ClipCut AI requires Python 3.11 or 3.12 (MediaPipe and faster-whisper require 3.11/3.12).
echo.
echo Attempting to install Python 3.11 automatically via winget...
winget install --id Python.Python.3.11 -e --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
    echo.
    echo Could not auto-install Python 3.11.
    echo Please download and install Python 3.11 from:
    echo https://www.python.org/downloads/release/python-3119/
    echo.
    echo IMPORTANT: Make sure to check "Add Python to PATH" during installation.
    echo After installing, double-click run.bat again.
    echo.
    pause
    exit /b 1
) else (
    echo [+] Python 3.11 installed successfully! Please double-click run.bat again.
    pause
    exit /b 0
)

:python_found
echo [+] Python runtime located: %PYTHON_EXE% %PYTHON_ARGS%

:: 4. Check FFmpeg installation
where ffmpeg >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [!] Warning: FFmpeg is not detected in your system PATH.
    echo ClipCut requires FFmpeg to slice, caption, and render videos.
    echo.
    echo Attempting to install FFmpeg automatically via winget...
    winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements
    if errorlevel 1 (
        echo [!] Could not auto-install FFmpeg.
        echo Please download and install FFmpeg from https://www.gyan.dev/ffmpeg/builds/
        echo or run: winget install Gyan.FFmpeg
        echo.
    ) else (
        echo [+] FFmpeg installed successfully!
    )
)

:: 5. Create virtual environment if it does not exist
if not exist ".venv\Scripts\activate.bat" (
    echo [*] First-time setup detected. Creating Python virtual environment...
    "%PYTHON_EXE%" %PYTHON_ARGS% -m venv .venv
    if errorlevel 1 (
        echo [X] Failed to create virtual environment. Please verify your Python installation.
        pause
        exit /b 1
    )
    
    echo [*] Activating virtual environment...
    call .venv\Scripts\activate.bat
    
    echo [*] Installing ClipCut AI dependencies... This takes 1 to 2 minutes on first run.
    python -m pip install --upgrade pip
    pip install -e .
    if errorlevel 1 (
        echo [X] Failed to install dependencies. Please check your internet connection.
        pause
        exit /b 1
    )
    echo [+] Dependencies installed successfully!
) else (
    call .venv\Scripts\activate.bat
    python -c "import edge_tts, googleapiclient, mcp" >nul 2>&1
    if errorlevel 1 (
        echo [*] Syncing newly added dependencies in virtual environment...
        pip install -e .
    )
)

:: 6. Register Desktop and Windows Start Menu shortcuts
if not exist "%USERPROFILE%\Desktop\ClipCut AI Studio.lnk" (
    echo [*] Registering Desktop and Start Menu shortcuts...
    cscript //nologo "%~dp0scripts\create_shortcuts.vbs" >nul 2>&1
    if exist "%USERPROFILE%\Desktop\ClipCut AI Studio.lnk" (
        echo [+] Pinned ClipCut AI Studio to Desktop and Start Menu!
    )
)

:: 7. Launch ClipCut Studio Server and open native app window
echo.
echo ======================================================================
echo [*] Starting ClipCut Studio Server on http://localhost:8000 ...
echo [*] Launching ClipCut dedicated desktop window...
echo [*] Press Ctrl+C in this terminal window anytime to stop the server.
echo ======================================================================
echo.

:: Launch via the virtual environment's python directly
.venv\Scripts\python.exe -m autoclip.cli serve --open

if errorlevel 1 (
    echo.
    echo [X] Server stopped or exited with error code: %ERRORLEVEL%
    if !IS_SILENT! equ 0 pause
)
