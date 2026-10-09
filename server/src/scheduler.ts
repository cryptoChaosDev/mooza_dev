import { prisma } from './index';
import { emitToUser } from './socket';
import logger from './utils/logger';
import { ensureDealConnection } from './lib/dealHelpers';

async function notify(userId: string, type: string, title: string, body: string, link: string) {
  try {
    const notif = await prisma.notification.create({
      data: { userId, type, title, body, link },
    });
    emitToUser(userId, 'new_notification', notif);
  } catch {}
}

// Каждый переход — условный updateMany по ожидаемому статусу: если сделку за это
// время уже перевели вручную (принял работу, отменил, сдал), count===0 и мы её не
// трогаем и никого не уведомляем. Ошибка по одной сделке не прерывает остальные.
async function transitionDeal(
  id: string,
  expectedStatus: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  const tr = await prisma.deal.updateMany({ where: { id, status: expectedStatus }, data });
  return tr.count === 1;
}

export async function processDealTimeouts() {
  const now = new Date();

  // Type A: IN_PROGRESS expired (executor didn't submit work)
  const inProgressExpired = await prisma.deal.findMany({
    where: {
      dealType: 'process',
      status: 'IN_PROGRESS',
      deadline: { lt: now, not: null },
    },
    select: { id: true, customerId: true, executorId: true, title: true },
  });
  for (const deal of inProgressExpired) {
    try {
      const ok = await transitionDeal(deal.id, 'IN_PROGRESS', { status: 'CANCELLED', cancelReason: 'Срок сдачи истёк' });
      if (!ok) continue;
      // Реальной оплаты через платформу пока нет — не пишем «деньги возвращены».
      await Promise.all([
        notify(deal.customerId, 'deal_auto_cancelled', 'Сделка автоматически отменена',
          `Срок сдачи «${deal.title}» истёк, работа не была сдана. Сделка отменена.`, `/deals/${deal.id}`),
        notify(deal.executorId, 'deal_auto_cancelled', 'Сделка автоматически отменена',
          `Срок сдачи «${deal.title}» истёк. Сделка отменена.`, `/deals/${deal.id}`),
      ]);
      logger.info(`[scheduler] Auto-cancelled deal ${deal.id} (IN_PROGRESS deadline expired)`);
    } catch (e: any) {
      logger.error(`[scheduler] deal ${deal.id} IN_PROGRESS timeout failed: ${e?.message}`);
    }
  }

  // Type A: REVIEW expired (customer didn't accept). acceptDeadline выставляется
  // при сдаче работы (/submit), так что REVIEW без срока не висит вечно.
  const reviewExpired = await prisma.deal.findMany({
    where: {
      dealType: 'process',
      status: 'REVIEW',
      acceptDeadline: { lt: now, not: null },
    },
    select: { id: true, customerId: true, executorId: true, title: true, serviceId: true },
  });
  for (const deal of reviewExpired) {
    try {
      const ok = await transitionDeal(deal.id, 'REVIEW', { status: 'COMPLETED' });
      if (!ok) continue;
      await ensureDealConnection(deal.customerId, deal.executorId, deal.serviceId);
      await Promise.all([
        notify(deal.customerId, 'deal_auto_completed', 'Сделка автоматически завершена',
          `Срок приёмки «${deal.title}» истёк. Работа принята автоматически.`, `/deals/${deal.id}`),
        notify(deal.executorId, 'deal_auto_completed', 'Сделка автоматически завершена',
          `Срок приёмки «${deal.title}» истёк — работа считается принятой.`, `/deals/${deal.id}`),
      ]);
      logger.info(`[scheduler] Auto-completed deal ${deal.id} (REVIEW acceptDeadline expired)`);
    } catch (e: any) {
      logger.error(`[scheduler] deal ${deal.id} REVIEW timeout failed: ${e?.message}`);
    }
  }

  // Type B: AWAITING_EVENT → AWAITING_CONFIRMATION when event date arrived
  const eventArrived = await prisma.deal.findMany({
    where: {
      dealType: 'event',
      status: 'AWAITING_EVENT',
      eventDate: { lte: now, not: null },
    },
    select: { id: true, customerId: true, executorId: true, title: true },
  });
  for (const deal of eventArrived) {
    try {
      const ok = await transitionDeal(deal.id, 'AWAITING_EVENT', { status: 'AWAITING_CONFIRMATION' });
      if (!ok) continue;
      await notify(deal.customerId, 'deal_awaiting_confirmation',
        'Подтвердите оказание услуги',
        `Сделка «${deal.title}» — подтвердите, что услуга была оказана.`,
        `/deals/${deal.id}`,
      );
      logger.info(`[scheduler] Deal ${deal.id} → AWAITING_CONFIRMATION`);
    } catch (e: any) {
      logger.error(`[scheduler] deal ${deal.id} AWAITING_EVENT transition failed: ${e?.message}`);
    }
  }

  // Type B: AWAITING_CONFIRMATION → COMPLETED after 3 days
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const confirmExpired = await prisma.deal.findMany({
    where: {
      dealType: 'event',
      status: 'AWAITING_CONFIRMATION',
      eventDate: { lt: threeDaysAgo, not: null },
    },
    select: { id: true, customerId: true, executorId: true, title: true, serviceId: true },
  });
  for (const deal of confirmExpired) {
    try {
      const ok = await transitionDeal(deal.id, 'AWAITING_CONFIRMATION', { status: 'COMPLETED' });
      if (!ok) continue;
      await ensureDealConnection(deal.customerId, deal.executorId, deal.serviceId);
      await Promise.all([
        notify(deal.customerId, 'deal_auto_completed', 'Сделка автоматически завершена',
          `Срок подтверждения «${deal.title}» истёк. Услуга принята автоматически.`, `/deals/${deal.id}`),
        notify(deal.executorId, 'deal_auto_completed', 'Сделка автоматически завершена',
          `Срок подтверждения «${deal.title}» истёк — услуга считается оказанной.`, `/deals/${deal.id}`),
      ]);
      logger.info(`[scheduler] Auto-completed event deal ${deal.id} (AWAITING_CONFIRMATION timeout)`);
    } catch (e: any) {
      logger.error(`[scheduler] deal ${deal.id} AWAITING_CONFIRMATION timeout failed: ${e?.message}`);
    }
  }
}

// Auto-archive orders whose deadline has passed. Только активные заказы БЕЗ
// выбранного исполнителя: если исполнитель уже выбран, работа идёт — заказ не
// уходит в архив (иначе «Выполнен» становился недоступен). Переход условный
// (updateMany по status+executorId), автор уведомляется ровно один раз.
export async function processOrderDeadlines() {
  const now = new Date();
  const expired = await prisma.order.findMany({
    where: { status: 'active', executorId: null, deadline: { lt: now, not: null } },
    select: { id: true, authorId: true, title: true },
  });
  for (const order of expired) {
    try {
      const tr = await prisma.order.updateMany({
        where: { id: order.id, status: 'active', executorId: null, deadline: { lt: now } },
        data: { status: 'archived' },
      });
      if (tr.count !== 1) continue;
      await notify(order.authorId, 'order_auto_archived',
        'Срок выполнения заказа истёк',
        `Срок выполнения заказа «${order.title}» истёк. Заказ перемещён в архив. Чтобы опубликовать его снова, укажите новый срок.`,
        `/orders/${order.id}`);
      logger.info(`[scheduler] Auto-archived order ${order.id} (deadline expired)`);
    } catch (e: any) {
      logger.error(`[scheduler] order ${order.id} auto-archive failed: ${e?.message}`);
    }
  }
}

// Истёкшие ВРЕМЕННЫЕ блокировки: чистим только blockedUntil. isBlocked — это
// бессрочная (ручная) блокировка админа, по таймеру она не снимается.
export async function processUserUnblocks() {
  const now = new Date();
  const tr = await prisma.user.updateMany({
    where: { blockedUntil: { lte: now, not: null } },
    data: { blockedUntil: null },
  });
  if (tr.count > 0) logger.info(`[scheduler] Expired temporary blocks cleared: ${tr.count}`);
}

export function startScheduler() {
  const RUN_EVERY_MS = 60 * 1000;  // every minute

  // Защита от наложения прогонов: если предыдущий ещё идёт (медленная БД),
  // следующий тик пропускается.
  let running = false;
  const tasks: Array<[string, () => Promise<void>]> = [
    ['processDealTimeouts', processDealTimeouts],
    ['processOrderDeadlines', processOrderDeadlines],
    ['processUserUnblocks', processUserUnblocks],
  ];

  const run = async () => {
    if (running) return;
    running = true;
    try {
      // Каждая задача изолирована: исключение в одной не пропускает остальные.
      for (const [name, task] of tasks) {
        try {
          await task();
        } catch (e: any) {
          logger.error(`[scheduler] ${name} error: ${e?.message}`);
        }
      }
    } finally {
      running = false;
    }
  };

  // Run once on startup
  run();
  // Then every minute
  setInterval(run, RUN_EVERY_MS);

  logger.info('[scheduler] Started — running every 60s');
}
