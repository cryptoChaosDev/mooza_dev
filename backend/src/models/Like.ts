import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface LikeAttributes {
  id: number;
  userId: number;
  postId: number;
  createdAt?: Date;
}

interface LikeCreationAttributes extends Optional<LikeAttributes, 'id'> {}

class Like extends Model<LikeAttributes, LikeCreationAttributes> implements LikeAttributes {
  public id!: number;
  public userId!: number;
  public postId!: number;
  public readonly createdAt!: Date;
}

Like.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
  postId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
}, {
  sequelize,
  tableName: 'likes',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['userId', 'postId']
    }
  ]
});

export default Like;