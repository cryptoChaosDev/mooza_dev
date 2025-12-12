import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface FriendshipAttributes {
  id: number;
  userId: number;
  friendId: number;
  createdAt?: Date;
}

interface FriendshipCreationAttributes extends Optional<FriendshipAttributes, 'id'> {}

class Friendship extends Model<FriendshipAttributes, FriendshipCreationAttributes> implements FriendshipAttributes {
  public id!: number;
  public userId!: number;
  public friendId!: number;
  public readonly createdAt!: Date;
}

Friendship.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
  friendId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
}, {
  sequelize,
  tableName: 'friendships',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['userId', 'friendId']
    }
  ]
});

export default Friendship;