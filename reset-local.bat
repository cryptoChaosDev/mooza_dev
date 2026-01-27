@echo off
echo ========================================
echo    Mooza Local Reset Script
echo ========================================
echo.
echo This will:
echo - Stop all containers
echo - Remove all volumes (DATABASE WILL BE DELETED!)
echo - Rebuild and restart fresh
echo.
pause

echo.
echo [1/5] Stopping containers...
docker-compose down

echo.
echo [2/5] Removing volumes...
docker volume rm mooza_dev_postgres_data 2>nul

echo.
echo [3/5] Removing old images...
docker-compose down --rmi local 2>nul

echo.
echo [4/5] Building fresh images...
docker-compose build --no-cache

echo.
echo [5/5] Starting services...
docker-compose up -d

echo.
echo ========================================
echo    Reset Complete!
echo ========================================
echo.
echo Waiting 10 seconds for services to start...
timeout /t 10 /nobreak

echo.
echo Checking status...
docker ps

echo.
echo ========================================
echo Application ready at:
echo - Web: http://localhost:3000
echo - API: http://localhost:4000
echo ========================================
echo.
echo To view logs: docker-compose logs -f
echo.
pause
