Write-Host "Starting Mooza Music Social Network in Development Mode..." -ForegroundColor Green
Write-Host ""

Write-Host "Installing/Updating dependencies..." -ForegroundColor Yellow
npm install
Set-Location -Path "backend"
npm install

Write-Host ""
Write-Host "Generating Prisma Client..." -ForegroundColor Yellow
npx prisma generate

Write-Host ""
Write-Host "Starting Backend Server..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev" -WorkingDirectory (Get-Location)

Write-Host ""
Write-Host "Waiting for backend to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Set-Location -Path ".."
Write-Host "Starting Frontend Server..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm start" -WorkingDirectory (Get-Location)

Write-Host ""
Write-Host "Mooza Development Environment Started!" -ForegroundColor Green
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Backend API: http://localhost:4000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to exit..."
$host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")