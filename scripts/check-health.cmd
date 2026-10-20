@echo off
chcp 65001 >nul
cd /d "%~dp0.."
node scripts\api-client.js status
exit /b %ERRORLEVEL%
