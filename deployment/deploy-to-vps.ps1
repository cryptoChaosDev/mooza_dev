# Mooza Music Social Network - VPS Deployment Script for Windows
# This script helps deploy the Mooza application to a VPS server from Windows

Write-Host "=== Mooza VPS Deployment Helper ===" -ForegroundColor Blue
Write-Host ""

# Function to check if required tools are installed
function Check-Dependencies {
    Write-Host "Checking dependencies..." -ForegroundColor Cyan
    
    $dependencies = @("ssh", "scp")
    $missing = @()
    
    foreach ($dep in $dependencies) {
        try {
            $null = Get-Command $dep -ErrorAction Stop
        } catch {
            $missing += $dep
        }
    }
    
    if ($missing.Count -gt 0) {
        Write-Host "Missing dependencies: $($missing -join ', ')" -ForegroundColor Red
        Write-Host "Please install OpenSSH client and ensure it's in your PATH" -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "All dependencies are installed" -ForegroundColor Green
}

# Function to validate VPS connection
function Test-VPSConnection {
    param(
        [string]$VpsIp,
        [string]$Username
    )
    
    Write-Host "Testing connection to $Username@$VpsIp..." -ForegroundColor Cyan
    
    try {
        $result = Test-NetConnection -ComputerName $VpsIp -Port 22 -WarningAction SilentlyContinue
        if ($result.TcpTestSucceeded) {
            Write-Host "Connection successful" -ForegroundColor Green
            return $true
        } else {
            Write-Host "Connection failed. Please check your VPS IP and network connectivity." -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "Connection test failed: $_" -ForegroundColor Red
        return $false
    }
}

# Function to deploy to VPS
function Deploy-ToVPS {
    param(
        [string]$VpsIp,
        [string]$Username,
        [string]$KeyPath
    )
    
    Write-Host "Deploying Mooza to VPS..." -ForegroundColor Cyan
    
    # Define paths
    $localDeployScript = "deploy-to-vps.sh"
    $remoteDeployDir = "/tmp/mooza-deploy"
    
    # Create remote deployment directory
    Write-Host "Creating remote deployment directory..." -ForegroundColor Gray
    if ($KeyPath) {
        ssh -i "$KeyPath" "$Username@$VpsIp" "mkdir -p $remoteDeployDir"
    } else {
        ssh "$Username@$VpsIp" "mkdir -p $remoteDeployDir"
    }
    
    # Copy deployment script to VPS
    Write-Host "Copying deployment script to VPS..." -ForegroundColor Gray
    if ($KeyPath) {
        scp -i "$KeyPath" "$localDeployScript" "$Username@$VpsIp:$remoteDeployDir/"
    } else {
        scp "$localDeployScript" "$Username@$VpsIp:$remoteDeployDir/"
    }
    
    # Make script executable and run it
    Write-Host "Running deployment script on VPS..." -ForegroundColor Gray
    if ($KeyPath) {
        ssh -i "$KeyPath" "$Username@$VpsIp" "chmod +x $remoteDeployDir/deploy-to-vps.sh && $remoteDeployDir/deploy-to-vps.sh"
    } else {
        ssh "$Username@$VpsIp" "chmod +x $remoteDeployDir/deploy-to-vps.sh && $remoteDeployDir/deploy-to-vps.sh"
    }
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Deployment completed successfully!" -ForegroundColor Green
        return $true
    } else {
        Write-Host "Deployment failed!" -ForegroundColor Red
        return $false
    }
}

# Main function
function Main {
    Write-Host "Mooza Music Social Network - VPS Deployment Helper" -ForegroundColor Blue
    Write-Host "===================================================" -ForegroundColor Blue
    Write-Host ""
    
    # Check dependencies
    Check-Dependencies
    
    # Get VPS information
    Write-Host "Please enter your VPS information:" -ForegroundColor Yellow
    $vpsIp = Read-Host "VPS IP Address"
    $username = Read-Host "SSH Username (usually 'root' or your username)"
    
    $useKey = Read-Host "Use SSH key authentication? (y/n)"
    $keyPath = $null
    if ($useKey -eq 'y' -or $useKey -eq 'Y') {
        $keyPath = Read-Host "Path to your private key file (leave empty for default)"
        if (-not $keyPath) {
            $keyPath = "$env:USERPROFILE\.ssh\id_rsa"
        }
        
        if (-not (Test-Path $keyPath)) {
            Write-Host "Key file not found: $keyPath" -ForegroundColor Red
            exit 1
        }
    }
    
    # Validate connection
    if (-not (Test-VPSConnection -VpsIp $vpsIp -Username $username)) {
        exit 1
    }
    
    # Confirm deployment
    Write-Host ""
    Write-Host "Deployment Summary:" -ForegroundColor Yellow
    Write-Host "  VPS IP: $vpsIp" -ForegroundColor Gray
    Write-Host "  Username: $username" -ForegroundColor Gray
    Write-Host "  Authentication: $(if ($keyPath) { "SSH Key ($keyPath)" } else { "Password" })" -ForegroundColor Gray
    Write-Host ""
    
    $confirm = Read-Host "Proceed with deployment? (y/n)"
    if ($confirm -ne 'y' -and $confirm -ne 'Y') {
        Write-Host "Deployment cancelled." -ForegroundColor Yellow
        exit 0
    }
    
    # Deploy to VPS
    if (Deploy-ToVPS -VpsIp $vpsIp -Username $username -KeyPath $keyPath) {
        Write-Host ""
        Write-Host "=== DEPLOYMENT SUCCESSFUL ===" -ForegroundColor Green
        Write-Host "Your Mooza application is now running on your VPS!" -ForegroundColor Green
        Write-Host "Access it at: http://$vpsIp" -ForegroundColor Blue
        Write-Host ""
        Write-Host "For further configuration and maintenance, please refer to the VPS_DEPLOYMENT.md guide." -ForegroundColor Gray
    } else {
        Write-Host ""
        Write-Host "=== DEPLOYMENT FAILED ===" -ForegroundColor Red
        Write-Host "Please check the error messages above and try again." -ForegroundColor Yellow
        Write-Host "Refer to the VPS_DEPLOYMENT.md guide for troubleshooting steps." -ForegroundColor Gray
    }
}

# Run main function
Main