# Mooza Development Environment

This document explains how to start the Mooza music social network in development mode using the provided scripts.

## Prerequisites

- Node.js (v16 or higher)
- npm (comes with Node.js)

## Starting the Development Environment

You have several options to start the development environment:

### Option 1: Using npm script (Recommended)

```bash
npm run dev
```

This will start both the backend and frontend servers.

### Option 2: Using the Windows Batch Script

Double-click on `start-dev.bat` or run from command prompt:

```cmd
start-dev.bat
```

### Option 3: Using the PowerShell Script

Right-click on `start-dev.ps1` and select "Run with PowerShell" or run from PowerShell:

```powershell
.\start-dev.ps1
```

## Manual Startup

If you prefer to start the services manually:

1. Start the backend server:
   ```bash
   cd backend
   npm run dev
   ```

2. In a separate terminal, start the frontend:
   ```bash
   npm start
   ```

## Accessing the Application

Once both servers are running:

- Frontend: http://localhost:3000
- Backend API: http://localhost:4000

## Stopping the Servers

Press `Ctrl+C` in each terminal window to stop the servers.

## Troubleshooting

### Port Conflicts

If you get an error about ports being in use:

1. Make sure no other instances are running
2. Kill processes on ports 3000 and 4000:
   - On Windows: Use Task Manager or Resource Monitor
   - On Mac/Linux: `sudo kill $(lsof -t -i:3000) && sudo kill $(lsof -t -i:4000)`

### Dependency Issues

If you encounter dependency issues:

1. Delete `node_modules` folders:
   ```bash
   rm -rf node_modules
   cd backend
   rm -rf node_modules
   ```

2. Reinstall dependencies:
   ```bash
   cd ..
   npm install
   cd backend
   npm install
   ```