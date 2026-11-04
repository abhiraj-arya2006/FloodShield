@echo off
echo Starting FloodShield River Flood Forecasting System...
echo ========================================================

start "FloodShield Backend (FastAPI)" cmd /k "python -m uvicorn app.backend.main:app --host 127.0.0.1 --port 8000"
start "FloodShield Frontend (Vite React)" cmd /k "cd app\frontend && npm run dev"

echo.
echo Backend running at:  http://127.0.0.1:8000
echo Swagger API docs at: http://127.0.0.1:8000/docs
echo Frontend running at: http://localhost:5173/
echo ========================================================
pause

