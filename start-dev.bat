@echo off
:: Automan launcher - delegates to PowerShell script
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1"
if %errorlevel% neq 0 pause
