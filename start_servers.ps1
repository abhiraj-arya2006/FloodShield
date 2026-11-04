Write-Host "Starting FloodShield River Flood Forecasting System..." -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor DarkGray

Start-Process powershell -ArgumentList "-NoExit", "-Command", "python -m uvicorn app.backend.main:app --host 127.0.0.1 --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location 'app/frontend'; npm run dev"

Write-Host "Backend running at:  http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "Swagger API docs at: http://127.0.0.1:8000/docs" -ForegroundColor Green
Write-Host "Frontend running at: http://localhost:5173/" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor DarkGray

