/**
 * Welcome posts seed — creates the system "Команда Moooza" user (team@moooza.ru)
 * and seeds 7 welcome / onboarding posts authored by it.
 *
 * These posts are pinned to the top of the feed for new users (see
 * server/src/routes/posts.ts → GET /feed).
 *
 * Run inside the API container:
 *   docker exec mooza-api npx tsx prisma/seeds/welcome-posts.ts
 *
 * Local:
 *   cd server && npx tsx prisma/seeds/welcome-posts.ts
 *
 * Idempotent: if the team user already has any posts, the script logs and exits
 * without creating duplicates.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const TEAM_EMAIL = 'team@moooza.ru';

async function main() {
  // Find or create team user (mark as verified admin / system account)
  let team = await prisma.user.findUnique({ where: { email: TEAM_EMAIL } });
  if (!team) {
    team = await prisma.user.create({
      data: {
        email: TEAM_EMAIL,
        firstName: 'Команда',
        lastName: 'Moooza',
        nickname: 'moooza',
        isVerified: true,
        isAdmin: true,
        emailVerified: true,
      },
    });
    console.log(`Created team user: ${team.id}`);
  } else {
    console.log(`Team user already exists: ${team.id}`);
  }

  const posts: Array<{ type: string; content: string }> = [
    {
      type: 'blog',
      content:
        '👋 Привет! Это Moooza — соцсеть для музыкальной индустрии. Здесь профессионалы находят заказы, заказчики — исполнителей, а музыканты — друг друга. Заполни профиль, добавь свои услуги и начни строить связи!',
    },
    {
      type: 'blog',
      content:
        '🎯 Что есть в Moooza?\n\n• Каталог из 126 музыкальных профессий\n• Услуги с прайс-листами и сроками\n• Сделки с безопасной оплатой (скоро)\n• 10-балльные отзывы и репутация\n• Связи между профессионалами\n• Деловые и личные чаты\n• Артисты с релизами и клипами',
    },
    {
      type: 'blog',
      content:
        '💼 Как получить первый заказ:\n\n1. Заполни профиль на 100%\n2. Добавь 1-2 услуги в каталог\n3. Загрузи портфолио (аудио/изображения)\n4. Размести "Апдейт занятости" в Потоке — расскажи, что свободен\n5. Установи связи с коллегами\n\nЧем активнее ты в Потоке — тем выше шанс на заказ.',
    },
    {
      type: 'blog',
      content:
        '🤝 Что такое "Связи" в Moooza?\n\nЭто профессиональная сеть. С каждым, с кем поработал — устанавливается связь. У связи есть роли (исполнитель/заказчик/коллега) и предмет (услуга, по которой работали). Чем больше связей — тем сильнее твоя репутация.',
    },
    {
      type: 'blog',
      content:
        '📣 Как работает Поток?\n\nЭто общая лента всех публикаций платформы. Доступны типы: Блог, Вопрос, Опрос, Апдейт услуги, Апдейт занятости. Лайки, комментарии, реакции, сохранение в избранное (звёздочка) — всё знакомо.',
    },
    {
      type: 'blog',
      content:
        '🎸 Артисты на Moooza\n\nЕсли ты в группе, дуэте или соло-проекте — создай профиль артиста. После верификации (нужно разместить код в описании профиля артиста ВКонтакте) он появится в каталоге. Добавляй релизы, клипы, участников — это твоё лицо в индустрии.',
    },
    {
      type: 'blog',
      content:
        '🚀 Удачи в Moooza! Если есть вопросы — пиши в Telegram-поддержку через кнопку "Информация" в шапке. Развиваем платформу вместе с тобой — обратная связь очень ценна.',
    },
  ];

  // Don't duplicate — check if team already has posts
  const existing = await prisma.post.count({ where: { authorId: team.id } });
  if (existing > 0) {
    console.log(`Team already has ${existing} posts. Skipping.`);
    return;
  }

  for (const p of posts) {
    await prisma.post.create({
      data: {
        authorId: team.id,
        type: p.type,
        content: p.content,
      },
    });
  }
  console.log(`Created ${posts.length} welcome posts from team`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
