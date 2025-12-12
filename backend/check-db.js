const { sequelize } = require('./dist/config/database');
const User = require('./dist/models/User').default;
const Profile = require('./dist/models/Profile').default;

async function checkDB() {
  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
    
    // Check if tables exist
    const userTable = await sequelize.getQueryInterface().describeTable('users');
    console.log('Users table structure:', userTable);
    
    const profileTable = await sequelize.getQueryInterface().describeTable('profiles');
    console.log('Profiles table structure:', profileTable);
    
    // Try to create a test user and profile
    console.log('Creating test user...');
    const user = await User.create({
      email: 'test@example.com',
      password: 'testpass',
      name: 'Test User'
    });
    console.log('Created user:', user.toJSON());
    
    console.log('Creating test profile...');
    const profile = await Profile.create({
      userId: user.id,
      firstName: 'Test',
      lastName: 'User'
    });
    console.log('Created profile:', profile.toJSON());
    
    // Clean up
    await profile.destroy();
    await user.destroy();
    
    console.log('Database check completed successfully.');
  } catch (error) {
    console.error('Database check failed:', error);
  } finally {
    await sequelize.close();
  }
}

checkDB();