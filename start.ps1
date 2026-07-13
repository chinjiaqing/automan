[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

# ── Config ──────────────────────────────────────────────
$ROOT   = Split-Path -Parent $MyInvocation.MyCommand.Path
$DOTBIN = Join-Path $ROOT '.bin'

$NODE_VER = 'v24.14.1'
$NODE_DIR = Join-Path $DOTBIN 'node'
$NODE_EXE = Join-Path $NODE_DIR 'node.exe'
$NODE_ZIP = "node-$NODE_VER-win-x64.zip"
$NODE_URLS = @(
    "https://cdn.npmmirror.com/binaries/node/$NODE_VER/$NODE_ZIP",
    "https://mirrors.ustc.edu.cn/node/$NODE_VER/$NODE_ZIP",
    "https://nodejs.org/dist/$NODE_VER/$NODE_ZIP"
)

$PY_VER  = '3.12.10'
$PY_DIR  = Join-Path $DOTBIN 'python'
$PY_EXE  = Join-Path $PY_DIR 'python.exe'
$PY_ZIP  = "python-$PY_VER-embed-amd64.zip"
$PY_URLS = @(
    "https://mirrors.huaweicloud.com/python/$PY_VER/$PY_ZIP",
    "https://cdn.npmmirror.com/binaries/python/$PY_VER/$PY_ZIP",
    "https://www.python.org/ftp/python/$PY_VER/$PY_ZIP"
)
$PIP_URL = 'https://bootstrap.pypa.io/get-pip.py'

$COREPACK = Join-Path $NODE_DIR 'node_modules\corepack\dist\corepack.js'
$PNPM_VER = '11.12.0'

# ── Helpers ─────────────────────────────────────────────

function Write-Ok   { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Err  { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }
function Write-Step { param($msg) Write-Host $msg -ForegroundColor Cyan }

function Download-File {
    param([string[]]$Urls, [string]$Dest)
    foreach ($url in $Urls) {
        Write-Host "  Trying: $url"
        try {
            Invoke-WebRequest -Uri $url -OutFile $Dest -UseBasicParsing
            # Validate ZIP header (PK magic bytes)
            $bytes = [System.IO.File]::ReadAllBytes($Dest)
            if ($bytes.Length -ge 4 -and $bytes[0] -eq 0x50 -and $bytes[1] -eq 0x4B) {
                Write-Host "  Downloaded: $([math]::Round($bytes.Length / 1MB, 1)) MB" -ForegroundColor DarkGray
                return $true
            }
            Write-Host "  Not a valid ZIP, trying next mirror..." -ForegroundColor Yellow
            Remove-Item $Dest -Force -ErrorAction SilentlyContinue
        } catch {
            Write-Host "  Failed: $($_.Exception.Message)" -ForegroundColor Yellow
            if (Test-Path $Dest) { Remove-Item $Dest -Force }
        }
    }
    Write-Err "All mirrors failed"
    return $false
}

function Extract-Zip {
    param([string]$ZipPath, [string]$DestDir)
    try {
        Expand-Archive -Path $ZipPath -DestinationPath $DestDir -Force
        return $true
    } catch {
        Write-Err "Extraction failed: $($_.Exception.Message)"
        return $false
    } finally {
        Remove-Item $ZipPath -Force -ErrorAction SilentlyContinue
    }
}

# ── Step 0: Create .bin ─────────────────────────────────

if (-not (Test-Path $DOTBIN)) { New-Item -ItemType Directory -Path $DOTBIN | Out-Null }

Write-Host ""
Write-Host "============================================" -ForegroundColor Yellow
Write-Host "  Automan - Environment Setup" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Yellow
Write-Host ""

# ── Step 1: Node.js ─────────────────────────────────────

if (Test-Path $NODE_EXE) {
    Write-Ok "Node.js $((& $NODE_EXE -v 2>&1))"
} else {
    Write-Step "[1/5] Downloading Node.js $NODE_VER..."
    $zipPath = Join-Path $DOTBIN $NODE_ZIP
    if (-not (Download-File -Urls $NODE_URLS -Dest $zipPath)) { exit 1 }
    Write-Host "  Extracting..."
    if (-not (Extract-Zip -ZipPath $zipPath -DestDir $DOTBIN)) { exit 1 }

    $extracted = Join-Path $DOTBIN "node-$NODE_VER-win-x64"
    if (Test-Path $extracted) {
        if (Test-Path $NODE_DIR) { Remove-Item $NODE_DIR -Recurse -Force }
        Move-Item $extracted $NODE_DIR
    }
    if (-not (Test-Path $NODE_EXE)) {
        Write-Err "node.exe not found after extraction"
        exit 1
    }
    Write-Ok "Node.js $((& $NODE_EXE -v 2>&1))"
}

$env:PATH = "$NODE_DIR;$env:PATH"

# ── Step 2: Python ──────────────────────────────────────

if (Test-Path $PY_EXE) {
    Write-Ok "Python $((& $PY_EXE --version 2>&1))"
} else {
    Write-Step "[2/5] Downloading Python $PY_VER embeddable..."
    $zipPath = Join-Path $DOTBIN $PY_ZIP
    if (-not (Download-File -Urls $PY_URLS -Dest $zipPath)) { exit 1 }
    Write-Host "  Extracting..."
    if (-not (Extract-Zip -ZipPath $zipPath -DestDir $PY_DIR)) { exit 1 }

    # Configure python312._pth to enable pip
    $pthFile = Join-Path $PY_DIR 'python312._pth'
    @"
import site

python312.zip
.
Lib\site-packages
"@ | Set-Content -Path $pthFile -Encoding ASCII

    # Install pip
    Write-Host "  Installing pip..."
    $getPip = Join-Path $DOTBIN 'get-pip.py'
    try {
        Invoke-WebRequest -Uri $PIP_URL -OutFile $getPip -UseBasicParsing
        & $PY_EXE $getPip --no-warn-script-location 2>&1 | Out-Null
    } finally {
        Remove-Item $getPip -Force -ErrorAction SilentlyContinue
    }
    if (-not (Test-Path $PY_EXE)) {
        Write-Err "python.exe not found after setup"
        exit 1
    }
    Write-Ok "Python $((& $PY_EXE --version 2>&1))"
}

$env:PATH = "$PY_DIR;$PY_DIR\Scripts;$env:PATH"

# ── Step 3: pnpm + Node.js deps ─────────────────────────

Write-Step "[3/5] Installing Node.js dependencies..."

# Force allow all build scripts
$env:CI = 'false'
$env:npm_config_ignore_scripts = 'false'

Write-Host "  Setting up pnpm via corepack..."
& $NODE_EXE $COREPACK enable pnpm 2>&1 | Out-Null
& $NODE_EXE $COREPACK "prepare" "pnpm@$PNPM_VER" --activate 2>&1 | Out-Null
Write-Ok "pnpm available"

Set-Location $ROOT

Write-Host "  Running pnpm install..."
$pnpmArgs = @($COREPACK, 'pnpm', 'install', '--force')
& $NODE_EXE @pnpmArgs
if ($LASTEXITCODE -ne 0) {
    Write-Err "pnpm install failed"
    exit 1
}

# pnpm v11: approve and run native build scripts (better-sqlite3, esbuild, etc.)
Write-Host "  Approving build scripts..."
$approveArgs = @($COREPACK, 'pnpm', 'approve-builds', '--all')
try { & $NODE_EXE @approveArgs 2>&1 | Out-Null } catch { }

Write-Ok "Node.js dependencies"

# ── Step 4: Python deps ─────────────────────────────────

Write-Step "[4/5] Installing Python dependencies..."
$reqFile = Join-Path $ROOT 'server\src\libs\requirements.txt'
& $PY_EXE -m pip install -r $reqFile --no-warn-script-location -i https://pypi.tuna.tsinghua.edu.cn/simple 2>&1 | Out-Null
Write-Ok "Python dependencies"

# ── Step 5: Start dev servers ───────────────────────────

Write-Host ""
Write-Step "[5/5] Starting development servers..."
Write-Host ""
Write-Host "============================================" -ForegroundColor Yellow
Write-Host "  Automan Development Environment" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Server: http://localhost:3000" -ForegroundColor White
Write-Host "  Web:    http://localhost:5173" -ForegroundColor White
Write-Host ""
Write-Host "  Press Ctrl+C to stop" -ForegroundColor DarkGray
Write-Host "============================================" -ForegroundColor Yellow
Write-Host ""

# Launch server in a new CMD window (tsx watch)
$serverDir = Join-Path $ROOT 'server'
$tsxCmd    = Join-Path $serverDir 'node_modules\.bin\tsx.cmd'
Start-Process -FilePath $tsxCmd -ArgumentList 'watch','src\server.ts' -WorkingDirectory $serverDir -WindowStyle Normal

Start-Sleep -Seconds 3

# Launch web in a new CMD window (vite)
$webDir  = Join-Path $ROOT 'web'
$viteCmd = Join-Path $webDir 'node_modules\.bin\vite.cmd'
Start-Process -FilePath $viteCmd -ArgumentList '--host' -WorkingDirectory $webDir -WindowStyle Normal

Write-Host ""
Write-Host "Development servers are running in separate windows." -ForegroundColor Green
Write-Host "Close this window or press any key to exit this launcher." -ForegroundColor DarkGray
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  ALL DONE - Launcher finished successfully" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
