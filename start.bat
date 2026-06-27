@echo off
echo Starting ToolGate...

:: Backend
start "ToolGate Backend" cmd /k "cd /d d:\toolGate\backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

:: Frontend
start "ToolGate Frontend" cmd /k "cd /d d:\toolGate\frontend && npm run dev"

timeout /t 3 /nobreak >nul
start http://localhost:5173
