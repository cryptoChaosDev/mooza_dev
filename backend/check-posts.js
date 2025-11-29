const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkPosts() {
  try {
    const posts = await prisma.post.findMany({
      include: {
        profile: {
          include: {
            user: true
          }
        }
      }
    });
    
    console.log(`Found ${posts.length} posts in the database:`);
    posts.forEach((post, index) => {
      console.log(`Post ${index + 1}:`);
      console.log(`  ID: ${post.id}`);
      console.log(`  Content: ${post.content}`);
      console.log(`  Created At: ${post.createdAt}`);
      console.log(`  Updated At: ${post.updatedAt}`);
      console.log(`  Profile ID: ${post.profileId}`);
      if (post.profile && post.profile.user) {
        console.log(`  User Name: ${post.profile.user.name}`);
      }
      console.log('---');
    });
  } catch (error) {
    console.error('Error querying posts:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPosts();