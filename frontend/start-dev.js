const { spawn } = require('child_process');

console.log('\x1b[32m%s\x1b[0m', 'Starting Mooza Music Social Network in Development Mode...');
console.log();

// Function to execute commands
function runCommand(command, cwd, name) {
  console.log('\x1b[33m%s\x1b[0m', `Starting ${name}...`);
  
  const child = spawn(command, {
    cwd,
    shell: true,
    stdio: 'inherit'
  });

  child.on('error', (error) => {
    console.error(`Error starting ${name}:`, error);
  });

  return child;
}

console.log('\x1b[33m%s\x1b[0m', 'Note: Make sure ports 3000 and 4000 are free before proceeding.');
console.log('\x1b[33m%s\x1b[0m', 'If servers fail to start, stop any existing processes on these ports.');
console.log();

// Give user a moment to read the note
setTimeout(() => {
  // Start backend server
  runCommand('npm run dev', './backend', 'Backend Server');
  
  // Wait a bit for backend to start, then start frontend
  setTimeout(() => {
    runCommand('npm start', '.', 'Frontend Server');
    
    console.log();
    console.log('\x1b[32m%s\x1b[0m', 'Mooza Development Environment Started!');
    console.log('\x1b[36m%s\x1b[0m', 'Frontend: http://localhost:3000');
    console.log('\x1b[36m%s\x1b[0m', 'Backend API: http://localhost:4000');
    console.log('\x1b[33m%s\x1b[0m', 'Press Ctrl+C to stop both servers.');
  }, 3000);
}, 3000);