@echo off
echo Starting Mooza Music Social Network in Development Mode...
echo.

echo Installing/Updating dependencies...
call npm install
cd backend
call npm install
cd ..

echo.
echo Generating Prisma Client...
cd backend
call npx prisma generate
cd ..

echo.
echo Starting Backend Server...
cd backend
start "Backend Server" cmd /k "npm run dev"
cd ..

echo.
echo Waiting for backend to start...
timeout /t 5 /nobreak >nul

echo.
echo Starting Frontend Server...
start "Frontend Server" cmd /k "npm start"

echo.
echo Mooza Development Environment Started!
echo Frontend: http://localhost:3000
echo Backend API: http://localhost:4000
echo.

pause