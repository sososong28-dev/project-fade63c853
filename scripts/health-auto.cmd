@echo off
chcp 65001 >nul
cd /d "%~dp0.."
node scripts\health-auto.js >> "config\path-patrol-scheduler.log" 2>&1
exit /b %ERRORLEVEL%
