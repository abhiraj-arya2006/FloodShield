Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "Starting FloodShield Early Warning System (Backend & Frontend)" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

Write-Host "Starting FastAPI Backend on http://127.0.0.1:8000 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload"

Start-Sleep -Seconds 3

Write-Host "Starting Vite Frontend on http://localhost:5173 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location frontend; npm run dev"

Write-Host "`nServers launched!" -ForegroundColor Cyan
Write-Host "Frontend Application: http://localhost:5173" -ForegroundColor Green
Write-Host "FastAPI Interactive Docs: http://127.0.0.1:8000/docs" -ForegroundColor Yellow
Write-Host "=========================================================" -ForegroundColor Cyan
