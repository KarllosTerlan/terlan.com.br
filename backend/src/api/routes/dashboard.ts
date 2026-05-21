import type { FastifyInstance } from 'fastify';
import dayjs from 'dayjs';
import { prisma } from '../../lib/prisma.js';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/dashboard/summary', { preHandler: app.auth }, async (req) => {
    const clinicId = req.auth!.clinicId;
    const today = dayjs().startOf('day').toDate();
    const tomorrow = dayjs().endOf('day').toDate();
    const monthStart = dayjs().startOf('month').toDate();
    const monthEnd = dayjs().endOf('month').toDate();

    const [todayCount, monthCount, activeClients, monthConfirmed, monthTotal] = await Promise.all([
      prisma.appointment.count({
        where: { clinicId, dateTime: { gte: today, lte: tomorrow }, status: { not: 'CANCELLED' } },
      }),
      prisma.appointment.count({
        where: { clinicId, dateTime: { gte: monthStart, lte: monthEnd } },
      }),
      prisma.client.count({
        where: {
          appointments: {
            some: { clinicId, createdAt: { gte: dayjs().subtract(60, 'day').toDate() } },
          },
        },
      }),
      prisma.appointment.count({
        where: {
          clinicId,
          dateTime: { gte: monthStart, lte: monthEnd },
          status: { in: ['CONFIRMED', 'COMPLETED'] },
        },
      }),
      prisma.appointment.count({
        where: { clinicId, dateTime: { gte: monthStart, lte: monthEnd } },
      }),
    ]);

    const confirmationRate = monthTotal > 0 ? Math.round((monthConfirmed / monthTotal) * 100) : 0;

    // last 30 days timeline
    const since = dayjs().subtract(29, 'day').startOf('day').toDate();
    const recent = await prisma.appointment.findMany({
      where: { clinicId, dateTime: { gte: since } },
      select: { dateTime: true },
    });
    const buckets: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      buckets[dayjs().subtract(29 - i, 'day').format('YYYY-MM-DD')] = 0;
    }
    for (const a of recent) {
      const k = dayjs(a.dateTime).format('YYYY-MM-DD');
      if (k in buckets) buckets[k] += 1;
    }
    const timeline = Object.entries(buckets).map(([date, count]) => ({ date, count }));

    return {
      todayCount,
      monthCount,
      activeClients,
      confirmationRate,
      timeline,
    };
  });

  app.get('/dashboard/upcoming', { preHandler: app.auth }, async (req) => {
    const list = await prisma.appointment.findMany({
      where: {
        clinicId: req.auth!.clinicId,
        dateTime: { gte: new Date() },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      include: { professional: true, client: true },
      orderBy: { dateTime: 'asc' },
      take: 10,
    });
    return { appointments: list };
  });
}
