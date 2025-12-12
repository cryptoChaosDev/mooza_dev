import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface PostAttributes {
  id: number;
  content: string;
  userId: number;
  createdAt?: Date;
  updatedAt?: Date;
  tags?: string[];
  attachmentUrl?: string;
}

interface PostCreationAttributes extends Optional<PostAttributes, 'id'> {}

class Post extends Model<PostAttributes, PostCreationAttributes> implements PostAttributes {
  public id!: number;
  public content!: string;
  public userId!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  public tags?: string[];
  public attachmentUrl?: string;
}

Post.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
  },
  attachmentUrl: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  sequelize,
  tableName: 'posts',
  timestamps: true,
});

export default Post;