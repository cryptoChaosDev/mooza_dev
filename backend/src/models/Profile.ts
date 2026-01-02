import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class Profile extends Model {
  declare id: number;
  declare userId: number;
  declare firstName: string;
  declare lastName: string;
  declare avatarUrl?: string;
  declare bio?: string;
  declare workPlace?: string;
  declare skills?: string;
  declare interests?: string;
  declare portfolio?: string;
  declare city?: string;
  declare country?: string;
  declare vkId?: string;
  declare youtubeId?: string;
  declare telegramId?: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

Profile.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  avatarUrl: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  bio: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  workPlace: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  skills: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  interests: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  portfolio: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  city: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  country: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  vkId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  youtubeId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  telegramId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'profiles',
  sequelize,
  timestamps: true,
});

export default Profile;