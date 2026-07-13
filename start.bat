@echo off
:: Automan production launcher - delegates to PowerShell script
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-prod.ps1"
if %errorlevel% neq 0 pause
