@echo off
title CampusFix AI Local Server
echo ========================================================
echo Starting CampusFix AI...
echo ========================================================
node server.js
if %errorlevel% neq 0 (
  "C:\Program Files\nodejs\node.exe" server.js
)
pause
