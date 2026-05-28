import { prisma } from './index';
import { emitToUser } from './socket';
import logger from './utils/logger';

async function notify(userId: string, type: string, title: string, body: string, link: string) {
  try {
    const notif = await prisma.notification.create({
      data: { userId, type, title, body, link },
    });
    emitToUser(userId, 'new_notification', notif);
  } catch {}
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
    await prisma.deal.update({
      where: { id: deal.id },
      data: { status: 'CANCELLED', cancelReason: 'Срок сдачи истёк' },
    });
    await Promise.all([
      notify(deal.customerId, 'deal_auto_cancelled', 'Сделка автоматически отменена',
        `Срок сдачи «${deal.title}» истёк. Деньги возвращены.`, `/deals/${deal.id}`),
      notify(deal.executorId, 'deal_auto_cancelled', 'Сделка автоматически отменена',
        `Срок сдачи «${deal.title}» истёк.`, `/deals/${deal.id}`),
    ]);
    logger.info(`[scheduler] Auto-cancelled deal ${deal.id} (IN_PROGRESS deadline expired)`);
  }

  // Type A: REVIEW expired (customer didn't accept)
  const reviewExpired = await prisma.deal.findMany({
    where: {
      dealType: 'process',
      status: 'REVIEW',
      acceptDeadline: { lt: now, not: null },
    },
    select: { id: true, customerId: true, executorId: true, title: true },
  });
  for (const deal of reviewExpired) {
    await prisma.deal.update({
      where: { id: deal.id },
      data: { status: 'COMPLETED' },
    });
    // Auto-create connection
    const existing = await prisma.connection.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: deal.customerId, receiverId: deal.executorId },
          { requesterId: deal.executorId, receiverId: deal.customerId },
        ],
      },
    });
    if (!existing) {
      await prisma.connection.create({
        data: {
          requesterId: deal.customerId, receiverId: deal.executorId,
          status: 'ACCEPTED',
          requesterRole: 'CUSTOMER', receiverRole: 'EXECUTOR',
        },
      });
    }
    await Promise.all([
      notify(deal.customerId, 'deal_auto_completed', 'Сделка автоматически завершена',
        `Срок приёмки «${deal.title}» истёк. Работа принята автоматически.`, `/deals/${deal.id}`),
      notify(deal.executorId, 'deal_auto_completed', 'Сделка автоматически завершена',
        `«${deal.title}» — выплата произойдёт автоматически.`, `/deals/${deal.id}`),
    ]);
    logger.info(`[scheduler] Auto-completed deal ${deal.id} (REVIEW acceptDeadline expired)`);
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
    await prisma.deal.update({
      where: { id: deal.id },
      data: { status: 'AWAITING_CONFIRMATION' },
    });
    await notify(deal.customerId, 'deal_awaiting_confirmation',
      'Подтвердите оказание услуги',
      `Сделка «${deal.title}» — подтвердите, что услуга была оказана.`,
      `/deals/${deal.id}`,
    );
    logger.info(`[scheduler] Deal ${deal.id} → AWAITING_CONFIRMATION`);
  }

  // Type B: AWAITING_CONFIRMATION → COMPLETED after 3 days
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const confirmExpired = await prisma.deal.findMany({
    where: {
      dealType: 'event',
      status: 'AWAITING_CONFIRMATION',
      eventDate: { lt: threeDaysAgo, not: null },
    },
    select: { id: true, customerId: true, executorId: true, title: true },
  });
  for (const deal of confirmExpired) {
    await prisma.deal.update({
      where: { id: deal.id },
      data: { status: 'COMPLETED' },
    });
    const existing = await prisma.connection.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: deal.customerId, receiverId: deal.executorId },
          { requesterId: deal.executorId, receiverId: deal.customerId },
        ],
      },
    });
    if (!existing) {
      await prisma.connection.create({
        data: {
          requesterId: deal.customerId, receiverId: deal.executorId,
          status: 'ACCEPTED',
          requesterRole: 'CUSTOMER', receiverRole: 'EXECUTOR',
        },
      });
    }
    await Promise.all([
      notify(deal.customerId, 'deal_auto_completed', 'Сделка автоматически завершена',
        `Срок подтверждения «${deal.title}» истёк. Услуга принята автоматически.`, `/deals/${deal.id}`),
      notify(deal.executorId, 'deal_auto_completed', 'Сделка автоматически завершена',
        `«${deal.title}» — выплата произойдёт автоматически.`, `/deals/${deal.id}`),
    ]);
    logger.info(`[scheduler] Auto-completed event deal ${deal.id} (AWAITING_CONFIRMATION timeout)`);
  }
}

// Process expired temporary user blocks: unblock when blockedUntil < now
export async function processUserUnblocks() {
  const now = new Date();
  const expired = await prisma.user.findMany({
    where: { blockedUntil: { lt: now, not: null } },
    select: { id: true },
  });
  for (const user of expired) {
    await prisma.user.update({
      where: { id: user.id },
      data: { blockedUntil: null, isBlocked: false },
    });
    logger.info(`[scheduler] Auto-unblocked user ${user.id}`);
  }
}

export function startScheduler() {
  const RUN_EVERY_MS = 60 * 1000;  // every minute

  const run = async () => {
    try {
      await processDealTimeouts();
      await processUserUnblocks();
    } catch (e: any) {
      logger.error(`[scheduler] Error: ${e.message}`);
    }
  };

  // Run once on startup
  run();
  // Then every minute
  setInterval(run, RUN_EVERY_MS);

  logger.info('[scheduler] Started — running every 60s');
}
