# Database Indexes Documentation

This document describes all database indexes in the Mooza application for performance optimization.

## Overview

Indexes are created to optimize the most common query patterns in the application:
- User searches and filtering
- Post feed queries
- Message retrieval
- Friendship status checks
- Profile lookups

## Index List by Table

### User Table
- `email` - For login and user lookup
- `city` - For location-based searches
- `role` - For filtering by user role
- `fieldOfActivityId` - For profession-based searches
- `employerId` - For employer-based queries

### Profession Table
- `fieldOfActivityId` - For filtering professions by field of activity

### UserProfession Table (Join Table)
- `userId` - For user's profession lookups
- `professionId` - For finding users by profession

### UserArtist Table (Join Table)
- `userId` - For user's artist lookups
- `artistId` - For finding users by artist

### Post Table
- `authorId` - For user's posts
- `createdAt` - For chronological sorting
- `(authorId, createdAt)` - Composite index for user's posts sorted by date

### Like Table
- `postId` - For counting post likes
- `(userId, postId)` - Unique constraint + index for preventing duplicate likes

### Comment Table
- `postId` - For post's comments
- `authorId` - For user's comments

### Message Table
- `senderId` - For sent messages
- `receiverId` - For received messages
- `createdAt` - For chronological sorting
- `(receiverId, readAt)` - For unread message queries
- `(senderId, receiverId, createdAt)` - Composite index for conversation history

### Friendship Table
- `requesterId` - For sent friend requests
- `receiverId` - For received friend requests
- `status` - For filtering by friendship status
- `(receiverId, status)` - For user's pending requests
- `(requesterId, status)` - For user's sent requests
- `(requesterId, receiverId)` - Unique constraint + index for preventing duplicate friendships

## Migration History

### 20260202212811_add_performance_indexes
Initial performance indexes:
- Friendship composite indexes
- Message composite indexes
- Post composite index
- User employerId index

### 20260202214000_add_missing_indexes
Completed indexing strategy with all missing indexes:
- All single-column indexes for foreign keys
- Search and filter indexes for User table
- Join table indexes for many-to-many relationships

## Performance Considerations

1. **Write Performance**: Each index adds overhead to INSERT/UPDATE operations
2. **Read Performance**: Indexes significantly improve SELECT query performance
3. **Index Maintenance**: PostgreSQL automatically maintains indexes
4. **Query Planning**: Use `EXPLAIN ANALYZE` to verify index usage

## Monitoring

To check if indexes are being used:
```sql
EXPLAIN ANALYZE SELECT * FROM "User" WHERE city = 'Moscow';
```

To see index sizes:
```sql
SELECT
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_indexes
JOIN pg_class ON indexname = relname
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

## Future Optimization

Consider adding these indexes if needed:
- Full-text search indexes for content fields
- GIN indexes for array fields (genres, professions)
- Partial indexes for specific query patterns
- Expression indexes for computed values
