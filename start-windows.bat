@echo off
title Deadline Tracker
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
if not exist .env copy .env.example .env >nul
node build.js
node server.js
pause
