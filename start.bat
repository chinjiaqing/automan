@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

:: Automan one-click launcher
:: Auto-download Node.js + Python, install deps, start dev env
:: All runtimes isolated in .bin/ directory

set "ROOT=%~dp0"
set "DOTBIN=%ROOT%.bin"

set "NODE_VER=v24.14.1"
set "NODE_DIR=%DOTBIN%\node"
set "NODE_EXE=%NODE_DIR%\node.exe"
set "NODE_ZIP=node-%NODE_VER%-win-x64.zip"
set "NODE_URL=https://mirrors.ustc.edu.cn/node/%NODE_VER%/%NODE_ZIP%"

set "PY_VER=3.12.10"
set "PY_DIR=%DOTBIN%\python"
set "PY_EXE=%PY_DIR%\python.exe"
set "PY_ZIP=python-%PY_VER%-embed-amd64.zip"
set "PY_URL=https://mirrors.huaweicloud.com/python/%PY_VER%/%PY_ZIP%"
set "PIP_URL=https://bootstrap.pypa.io/get-pip.py"

set "COREPACK=%NODE_DIR%\node_modules\corepack\dist\corepack.js"
set "PNPM_CMD=%NODE_EXE% %COREPACK% pnpm"

:: Force allow all build scripts
set CI=false
set npm_config_ignore_scripts=false

:: ── Step 0: Create .bin directory ────────────────
if not exist "%DOTBIN%" mkdir "%DOTBIN%"

echo ============================================
echo  Automan - Environment Setup
echo ============================================
echo.

:: ── Step 1: Node.js ──────────────────────────

if exist "%NODE_EXE%" (
    echo [OK] Node.js
    "%NODE_EXE%" -v
    echo [DEBUG] Node.js check passed, continuing...
) else (
    echo [1/5] Downloading Node.js %NODE_VER%...
    curl.exe -L -o "%DOTBIN%\%NODE_ZIP%" "%NODE_URL%" -#
    if not exist "%DOTBIN%\%NODE_ZIP%" (
        echo [ERROR] Node.js download failed
        goto :fail
    )
    echo       Extracting...
    powershell -NoProfile -Command "Expand-Archive -Path '%DOTBIN%\%NODE_ZIP%' -DestinationPath '%DOTBIN%' -Force"
    if exist "%DOTBIN%\node-%NODE_VER%-win-x64" (
        move "%DOTBIN%\node-%NODE_VER%-win-x64" "%NODE_DIR%" >nul
    )
    del "%DOTBIN%\%NODE_ZIP%" 2>nul
    if exist "%NODE_EXE%" (
        echo [OK] Node.js
        "%NODE_EXE%" -v
    ) else (
        echo [ERROR] Node.js extraction failed
        goto :fail
    )
)

:: Add bundled node to PATH
set "PATH=%NODE_DIR%;%PATH%"

:: ── Step 2: Python ───────────────────────────

if exist "%PY_EXE%" (
    echo [OK] Python
    "%PY_EXE%" --version
) else (
    echo [2/5] Downloading Python %PY_VER% embeddable...
    curl.exe -L -o "%DOTBIN%\%PY_ZIP%" "%PY_URL%" -#
    if not exist "%DOTBIN%\%PY_ZIP%" (
        echo [ERROR] Python download failed
        goto :fail
    )
    echo       Extracting...
    powershell -NoProfile -Command "Expand-Archive -Path '%DOTBIN%\%PY_ZIP%' -DestinationPath '%PY_DIR%' -Force"
    del "%DOTBIN%\%PY_ZIP%" 2>nul

    echo import site> "%PY_DIR%\python312._pth"
    echo.>> "%PY_DIR%\python312._pth"
    echo python312.zip>> "%PY_DIR%\python312._pth"
    echo .>> "%PY_DIR%\python312._pth"
    echo Lib\site-packages>> "%PY_DIR%\python312._pth"

    echo       Installing pip...
    curl.exe -sL -o "%DOTBIN%\get-pip.py" "%PIP_URL%"
    "%PY_EXE%" "%DOTBIN%\get-pip.py" --no-warn-script-location >nul 2>&1
    del "%DOTBIN%\get-pip.py" 2>nul

    if exist "%PY_EXE%" (
        echo [OK] Python
        "%PY_EXE%" --version
    ) else (
        echo [ERROR] Python setup failed
        goto :fail
    )
)

:: Add bundled python to PATH
set "PATH=%PY_DIR%;%PY_DIR%\Scripts;%PATH%"

:: -- Step 3: pnpm + Node.js deps ---------------------------------------

echo [3/5] Installing Node.js dependencies...

REM Always use corepack to run pnpm through bundled node
echo [DEBUG] Setting up pnpm via corepack...
"%NODE_EXE%" "%COREPACK%" enable pnpm

REM Lock pnpm version
"%NODE_EXE%" "%COREPACK%" prepare pnpm@10.8.0 --activate

echo [OK] pnpm available via bundled Node.js

cd /d "%ROOT%"
echo [DEBUG] Running pnpm install...

call %PNPM_CMD% install

if !errorlevel! neq 0 (
    echo [ERROR] pnpm install failed
    goto :fail
)
echo [OK] Node.js dependencies

:: -- Step 4: Python deps -----------------------------------------------

echo [4/5] Installing Python dependencies...
"%PY_EXE%" -m pip install -r "%ROOT%server\src\libs\requirements.txt" --no-warn-script-location -i https://pypi.tuna.tsinghua.edu.cn/simple >nul 2>&1
echo [OK] Python dependencies

:: -- Step 5: Start dev servers -----------------------------------------

echo.
echo [5/5] Starting development servers...
echo ============================================
echo  Automan Development Environment
echo ============================================
echo.
echo  Server: http://localhost:3000
echo  Web:    http://localhost:5173
echo.
echo  Press Ctrl+C to stop
echo ============================================
echo.

start "Automan Server" /D "%ROOT%server" "%ROOT%server\node_modules\.bin\tsx.cmd" watch src\server.ts

timeout /t 3 /nobreak >nul

start "Automan Web" /D "%ROOT%web" "%ROOT%web\node_modules\.bin\vite.cmd" --host

echo.
echo Development servers are running in separate windows.
echo Close this window or press any key to exit this launcher.
echo.
echo ============================================
echo  ALL DONE - Launcher finished successfully
echo ============================================
echo.
pause
goto :eof

:fail
echo.
echo ============================================
echo  [ERROR] Setup failed. Check the messages above.
echo ============================================
echo.
pause >nul
goto :eof