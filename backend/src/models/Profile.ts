import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface ProfileAttributes {
  id: number;
  userId: number;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  bio?: string;
  workPlace?: string;
  skills?: string;
  interests?: string;
  portfolio?: string;
  city?: string;
  country?: string;
  vkId?: string;
  youtubeId?: string;
  telegramId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ProfileCreationAttributes extends Optional<ProfileAttributes, 'id'> {}

class Profile extends Model<ProfileAttributes, ProfileCreationAttributes> implements ProfileAttributes {
  public id!: number;
  public userId!: number;
  public firstName?: string;
  public lastName?: string;
  public avatarUrl?: string;
  public bio?: string;
  public workPlace?: string;
  public skills?: string;
  public interests?: string;
  public portfolio?: string;
  public city?: string;
  public country?: string;
  public vkId?: string;
  public youtubeId?: string;
  public telegramId?: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Profile.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    unique: true,
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
}, {
  sequelize,
  tableName: 'profiles',
  timestamps: true,
});

export default Profile;