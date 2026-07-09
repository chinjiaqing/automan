@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

:: ── Automan 一键启动 ─────────────────────────────
:: 自动下载 Node.js + Python，安装依赖，启动开发环境
:: 所有运行时隔离在 .bin/ 目录，不污染系统环境
:: ──────────────────────────────────────────────────

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

:: ── Step 0: 创建 .bin 目录 ────────────────────

if not exist "%DOTBIN%" mkdir "%DOTBIN%"

echo ============================================
echo  Automan - Environment Setup
echo ============================================
echo.

:: ── Step 1: Node.js ──────────────────────────

if exist "%NODE_EXE%" (
    echo [OK] Node.js
    "%NODE_EXE%" -v
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

:: 将 bundled node 加入 PATH
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

    :: 启用 import site（embed 默认禁用）
    echo import site> "%PY_DIR%\python312._pth"
    echo.>> "%PY_DIR%\python312._pth"
    echo python312.zip>> "%PY_DIR%\python312._pth"
    echo .>> "%PY_DIR%\python312._pth"
    echo Lib\site-packages>> "%PY_DIR%\python312._pth"

    :: 安装 pip
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

:: 将 bundled python 加入 PATH
set "PATH=%PY_DIR%;%PY_DIR%\Scripts;%PATH%"

:: ── Step 3: pnpm + Node.js 依赖 ──────────────

echo [3/5] Installing Node.js dependencies (pnpm --frozen-lockfile)...

:: 启用 pnpm（通过 corepack）
where pnpm >nul 2>&1
if !errorlevel! neq 0 (
    if exist "%COREPACK%" (
        "%NODE_EXE%" "%COREPACK%" enable pnpm >nul 2>&1
        "%NODE_EXE%" "%COREPACK%" prepare pnpm@latest --activate >nul 2>&1
    )
)

cd /d "%ROOT%"
pnpm install --frozen-lockfile
if !errorlevel! neq 0 (
    echo [WARN] pnpm install encountered issues, continuing...
)

:: ── Step 4: Python 依赖 ──────────────────────

echo [4/5] Installing Python dependencies...
"%PY_EXE%" -m pip install -r "%ROOT%server\src\libs\requirements.txt" --no-warn-script-location >nul 2>&1
echo [OK] Python dependencies

:: ── Step 5: 启动开发环境 ─────────────────────

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

:: 启动 server（新窗口，调用 .cmd 文件而非 node.exe）
start "Automan Server" /D "%ROOT%server" "%ROOT%server\node_modules\.bin\tsx.cmd" watch src\server.ts

:: 等待 server 启动
timeout /t 3 /nobreak >nul

:: 启动 web（新窗口）
start "Automan Web" /D "%ROOT%web" "%ROOT%web\node_modules\.bin\vite.cmd" --host

:: 保持主窗口
echo.
echo Development servers are running in separate windows.
echo Close this window or press any key to exit this launcher.
echo.
pause >nul
