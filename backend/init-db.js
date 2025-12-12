const { sequelize } = require('./dist/config/database');
const User = require('./dist/models/User').default;
const Profile = require('./dist/models/Profile').default;
const Post = require('./dist/models/Post').default;
const Friendship = require('./dist/models/Friendship').default;
const Like = require('./dist/models/Like').default;

async function initDB() {
  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
    
    // Sync all models
    console.log('Syncing database models...');
    await sequelize.sync({ alter: true });
    console.log('Database models synced successfully.');
    
    console.log('Database initialization completed.');
  } catch (error) {
    console.error('Database initialization failed:', error);
  } finally {
    await sequelize.close();
  }
}

initDB();