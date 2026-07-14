# ----------------------------------------------------------------------
# dist-win -- one-click Windows installer build
#
# Runs the full pipeline on a Windows x64 machine:
#   pnpm install -> build web -> build sidecar (bundle + native modules
#   + portable node + electron main) -> sidecar smoke test -> embedded
#   Python -> electron-builder NSIS installer
#
# Prerequisites (install once):
#   - Node.js 24 LTS   (https://nodejs.org or "winget install OpenJS.NodeJS.LTS")
#   - pnpm 10+         ("corepack enable pnpm" or "npm i -g pnpm")
#   - Python 3.12      (https://python.org or "winget install Python.Python.3.12")
#
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 misreads
# BOM-less UTF-8 sources).
#
# Usage: powershell -ExecutionPolicy Bypass -File desktop\scripts\dist-win.ps1
#        add -SkipMirror outside mainland China networks
# ----------------------------------------------------------------------

param([switch]$SkipMirror)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$DESKTOP = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$REPO    = Split-Path -Parent $DESKTOP

function Write-Step { param($msg) Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Fail       { param($msg) Write-Host "[dist-win] FAIL: $msg" -ForegroundColor Red; exit 1 }
function Check-Exit { param($msg) if ($LASTEXITCODE -ne 0) { Fail $msg } }

# -- Step 0: environment checks --
Write-Step 'checking environment'
if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { Fail "requires Windows x64 (got $env:PROCESSOR_ARCHITECTURE)" }
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Fail 'node not found. Install Node.js 24 LTS first' }
$nodeVer = & node -v
Write-Host "  node $nodeVer"
$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpm) { Fail 'pnpm not found. Run "corepack enable pnpm" or "npm i -g pnpm"' }
Write-Host "  pnpm $(& pnpm -v)"
# python is validated strictly inside prepare-python.ps1

# -- Step 1: mirrors for mainland China networks --
if (-not $SkipMirror) {
    $env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
    $env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
    Write-Host '  mirrors: npmmirror (pass -SkipMirror to disable)'
}

Set-Location $REPO

# -- Step 2: install workspace dependencies --
Write-Step 'pnpm install'
# pnpm behaviour for this non-interactive packaging run (set once, applies to all steps):
#  - CI=true: authorize the node_modules purge pnpm 11 wants when build-script approvals
#    change; without a TTY it otherwise aborts (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY)
#  - verify-deps-before-run=false: Step 4's "pnpm deploy --prod" flips the workspace into
#    prod mode; pnpm would then auto-strip devDependencies (electron-builder) before the
#    next filtered command (Step 5 smoke / Step 7 installer)
$env:CI = 'true'
$env:pnpm_config_verify_deps_before_run = 'false'
& pnpm install --frozen-lockfile
Check-Exit 'pnpm install failed'

# -- Step 3: build web frontend --
Write-Step 'building web'
& pnpm --filter '@automan/web' build
Check-Exit 'web build failed'

# -- Step 4: build sidecar + electron main --
Write-Step 'building sidecar (bundle + native modules + portable node + main)'
& pnpm --filter '@automan/desktop' build:all
Check-Exit 'desktop build:all failed'

# -- Step 5: sidecar artifact smoke test --
Write-Step 'sidecar smoke test'
& pnpm --filter '@automan/desktop' smoke:server
Check-Exit 'sidecar smoke test failed'

# -- Step 6: embedded Python runtime --
Write-Step 'preparing embedded python'
& powershell -ExecutionPolicy Bypass -File (Join-Path $DESKTOP 'scripts\prepare-python.ps1')
Check-Exit 'prepare-python failed'

# -- Step 7: NSIS installer --
Write-Step 'building NSIS installer'
# Belt-and-suspenders: restore any devDependencies (electron-builder) that Step 4's
# prod deploy may have pruned, so the binary is present before we invoke it.
& pnpm install --frozen-lockfile
Check-Exit 'restore dev dependencies failed'
& pnpm --filter '@automan/desktop' exec electron-builder --win --publish never
Check-Exit 'electron-builder failed'

Write-Host ''
Write-Host '============================================' -ForegroundColor Green
Get-ChildItem (Join-Path $DESKTOP 'release\*.exe') | ForEach-Object {
    Write-Host ("  {0}  ({1:N0} MB)" -f $_.FullName, ($_.Length / 1MB)) -ForegroundColor Green
}
Write-Host '============================================' -ForegroundColor Green
