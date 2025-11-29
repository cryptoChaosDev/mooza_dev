const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, 'prisma', 'dev.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Apply the migration
db.serialize(() => {
  db.run(`ALTER TABLE Profile ADD COLUMN friendsCsv TEXT NOT NULL DEFAULT ''`, (err) => {
    if (err) {
      console.error('Error applying migration:', err.message);
    } else {
      console.log('Successfully added friendsCsv column to Profile table');
    }
  });
});

// Close the database connection
db.close((err) => {
  if (err) {
    console.error('Error closing database:', err.message);
  } else {
    console.log('Database connection closed.');
  }
});