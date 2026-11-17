@echo off
chcp 65001 >nul
cd /d "%~dp0"
where yarn >nul 2>nul
if not errorlevel 1 (
  call yarn install
  if errorlevel 1 (
    pause
    exit /b 1
  )
  call yarn dev --open
  pause
  exit /b
)
if not exist node_modules (
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm run dev -- --open
pause
