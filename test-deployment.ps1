# Mooza Deployment and Testing Script (PowerShell)
# This script rebuilds the containers and tests their functionality

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "Mooza Deployment and Testing Script" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan

Write-Host "`nStep 1: Stopping existing containers..." -ForegroundColor Yellow
docker compose down 2>$null

Write-Host "`nStep 2: Pulling latest code changes..." -ForegroundColor Yellow
git pull origin master

Write-Host "`nStep 3: Building frontend..." -ForegroundColor Yellow
Set-Location frontend
npm install
npm run build
Set-Location ..

Write-Host "`nStep 4: Rebuilding API container with no cache..." -ForegroundColor Yellow
docker compose build --no-cache api

Write-Host "`nStep 5: Starting services..." -ForegroundColor Yellow
docker compose up -d

Write-Host "`nStep 6: Waiting for containers to start (10 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

Write-Host "`nStep 7: Checking container status..." -ForegroundColor Yellow
docker ps

Write-Host "`nStep 8: Checking API logs for errors..." -ForegroundColor Yellow
Write-Host "API Container Logs:" -ForegroundColor Green
docker compose logs api

Write-Host "`nStep 9: Checking nginx logs..." -ForegroundColor Yellow
Write-Host "Nginx Container Logs:" -ForegroundColor Green
docker compose logs nginx

Write-Host "`nStep 10: Testing API endpoint..." -ForegroundColor Yellow
try {
    $apiResponse = Invoke-WebRequest -Uri "http://localhost:4000/" -TimeoutSec 10 -UseBasicParsing
    Write-Host "✓ API is responding" -ForegroundColor Green
} catch {
    Write-Host "✗ API is not responding" -ForegroundColor Red
}

Write-Host "`nStep 11: Testing nginx frontend..." -ForegroundColor Yellow
try {
    $frontendResponse = Invoke-WebRequest -Uri "http://localhost/" -TimeoutSec 10 -UseBasicParsing
    Write-Host "✓ Frontend is accessible" -ForegroundColor Green
} catch {
    Write-Host "✗ Frontend is not accessible" -ForegroundColor Red
}

Write-Host "`nStep 12: Checking if API container is running..." -ForegroundColor Yellow
$apiStatus = docker ps --filter "name=mooza-api-1" --format "table {{.Status}}" 2>$null
if ($apiStatus -match "Up") {
    Write-Host "✓ API container is running" -ForegroundColor Green
} else {
    Write-Host "✗ API container is not running - check the logs above for errors" -ForegroundColor Red
}

Write-Host "`nStep 13: Checking if nginx container is running..." -ForegroundColor Yellow
$nginxStatus = docker ps --filter "name=mooza-nginx-1" --format "table {{.Status}}" 2>$null
if ($nginxStatus -match "Up") {
    Write-Host "✓ Nginx container is running" -ForegroundColor Green
} else {
    Write-Host "✗ Nginx container is not running" -ForegroundColor Red
}

Write-Host "`nStep 14: Testing specific API endpoints..." -ForegroundColor Yellow
Write-Host "Testing API root endpoint:" -ForegroundColor Green
try {
    $apiRoot = Invoke-WebRequest -Uri "http://localhost:4000/" -TimeoutSec 5 -UseBasicParsing
    Write-Host "HTTP Status:" $apiRoot.StatusCode -ForegroundColor Green
} catch {
    Write-Host "Could not reach API root endpoint" -ForegroundColor Red
}

Write-Host "`nStep 15: Checking frontend CSS file accessibility..." -ForegroundColor Yellow
try {
    # Get the index.html to find the actual CSS file name
    $html = Invoke-WebRequest -Uri "http://localhost/" -UseBasicParsing
    $cssMatch = [regex]::Match($html.Content, 'href="(/static/css/main\.[a-z0-9]+\.css)"')
    if ($cssMatch.Success) {
        $cssFile = $cssMatch.Groups[1].Value
        $cssResponse = Invoke-WebRequest -Uri "http://localhost$cssFile" -TimeoutSec 10 -UseBasicParsing
        Write-Host "✓ Frontend CSS is accessible as $cssFile" -ForegroundColor Green
        Write-Host "CSS file size:" $cssResponse.RawContentLength "bytes" -ForegroundColor Green
    } else {
        Write-Host "✗ Could not find CSS file in frontend" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Frontend CSS is not accessible" -ForegroundColor Red
}

Write-Host "`n===========================================" -ForegroundColor Cyan
Write-Host "Deployment and Testing Complete" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan

Write-Host "`nSummary:" -ForegroundColor Cyan
Write-Host "- Check the logs above for any errors" -ForegroundColor Cyan
Write-Host "- If API container is still failing, run: docker compose logs api" -ForegroundColor Cyan
Write-Host "- If you need to troubleshoot further, check: docker ps -a" -ForegroundColor Cyan
Write-Host "- To view live logs: docker compose logs -f api" -ForegroundColor Cyan