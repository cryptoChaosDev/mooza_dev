import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class User extends Model {
  declare id: number;
  declare email: string;
  declare phone: string;
  declare password: string;
  declare name: string;
  declare profileType: string;
  declare firstName: string;
  declare lastName: string;
  declare middleName: string;
  declare avatarUrl?: string;
  declare isSeller: boolean;
  declare isEmployer: boolean;
  declare city?: string;
  declare country?: string;
  declare myGroup?: string;
  declare workPlace?: string;
  declare bio?: string;
  declare education?: string;
  declare interests?: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

User.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  profileType: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  middleName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  avatarUrl: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  isSeller: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  isEmployer: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  city: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  country: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  myGroup: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  workPlace: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  bio: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  education: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  interests: {
    type: DataTypes.TEXT,
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
  tableName: 'users',
  sequelize,
  timestamps: true,
});

export default User;