# PowerShell script to stop and restart Mooza development servers
Write-Host "Stopping Mooza Development Servers..." -ForegroundColor Yellow

# Stop processes running on ports 3000 and 4000
Write-Host "Stopping processes on ports 3000 and 4000..." -ForegroundColor Cyan

# Get and stop processes on port 3000 (Frontend)
try {
    $port3000Connections = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
    if ($port3000Connections) {
        Write-Host "Found connections on port 3000, stopping associated processes..." -ForegroundColor Gray
        $port3000Connections | ForEach-Object {
            $process = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
            if ($process -and $process.ProcessName -ne "Idle") {
                Write-Host "Stopping process: $($process.ProcessName) (PID: $($_.OwningProcess))" -ForegroundColor Gray
                Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
            }
        }
        Write-Host "Processes on port 3000 stopped successfully." -ForegroundColor Green
    } else {
        Write-Host "No connections found on port 3000." -ForegroundColor Gray
    }
} catch {
    Write-Host "Error stopping processes on port 3000: $_" -ForegroundColor Red
}

# Get and stop processes on port 4000 (Backend)
try {
    $port4000Connections = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue
    if ($port4000Connections) {
        Write-Host "Found connections on port 4000, stopping associated processes..." -ForegroundColor Gray
        $port4000Connections | ForEach-Object {
            $process = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
            if ($process -and $process.ProcessName -ne "Idle") {
                Write-Host "Stopping process: $($process.ProcessName) (PID: $($_.OwningProcess))" -ForegroundColor Gray
                Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
            }
        }
        Write-Host "Processes on port 4000 stopped successfully." -ForegroundColor Green
    } else {
        Write-Host "No connections found on port 4000." -ForegroundColor Gray
    }
} catch {
    Write-Host "Error stopping processes on port 4000: $_" -ForegroundColor Red
}

# Wait a moment for processes to fully terminate
Start-Sleep -Seconds 2

# Start the development environment
Write-Host "Starting Mooza Development Environment..." -ForegroundColor Yellow
try {
    # Start backend server in background
    Write-Host "Starting backend server..." -ForegroundColor Cyan
    Set-Location ..\backend
    Start-Process powershell -ArgumentList "-Command", "npm run dev" -WindowStyle Minimized
    
    # Wait a moment for backend to start
    Start-Sleep -Seconds 3
    
    # Start frontend server
    Write-Host "Starting frontend server..." -ForegroundColor Cyan
    Set-Location ..\frontend
    npm start
} catch {
    Write-Host "Error starting development environment: $_" -ForegroundColor Red
}