@echo off
echo =========================================================
echo Starting FloodShield Early Warning System (Backend & Frontend)
echo =========================================================

echo Starting FastAPI Backend on http://127.0.0.1:8000 ...
start "FloodShield Backend" cmd /k "python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload"

echo Waiting for backend initialization...
timeout /t 3 /nobreak >nul

echo Starting Vite Frontend on http://localhost:5173 ...
start "FloodShield Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo =========================================================
echo Both servers have been launched!
echo Access the Prototype Dashboard at: http://localhost:5173
echo Backend API Docs at:                http://127.0.0.1:8000/docs
echo =========================================================
