const http = require('http');

// Test the /profile/posts endpoint
const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/profile/posts',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEsImlhdCI6MTcxOTQ0NDAyNywiZXhwIjoxNzE5NTMwNDI3fQ.XXXXX'
  }
};

const req = http.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  
  res.on('data', (chunk) => {
    console.log(`Body: ${chunk}`);
  });
  
  res.on('end', () => {
    console.log('Request completed');
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
});

req.end();