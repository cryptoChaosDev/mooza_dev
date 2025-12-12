import { createServer } from "http";
import app from "./server";
import { sequelize } from './config/database';
import User from './models/User';
import Profile from './models/Profile';
import Post from './models/Post';
import Friendship from './models/Friendship';
import Like from './models/Like';

const port = Number(process.env.PORT || 4000);

// Sync database models
sequelize.sync({ alter: true })
  .then(() => {
    console.log('Database synchronized');
    
    const server = createServer(app);
    
    server.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`API listening on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to synchronize database:', error);
    process.exit(1);
  });

export default app;