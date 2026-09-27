@echo off
title Trading Console

echo Starting backend...
start "Trading Backend" cmd /k "cd /d D:\Projects\trading\version1\backend && D:\Projects\trading\version1\backend\venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 3 /nobreak >nul

echo Starting frontend...
start "Trading Frontend" cmd /k "cd /d D:\Projects\trading\version1\frontend && npm run dev -- --host"

timeout /t 5 /nobreak >nul

echo Opening browser...
start http://localhost:5173

echo Both servers are running. Close this window anytime.
