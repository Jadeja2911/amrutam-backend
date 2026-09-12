const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

router.get('/summary', async (req, res) => {
  try {
    const [totalUsers, totalDoctors, totalConsultations, consultationsByStatus, totalRevenue] = await Promise.all([
      prisma.user.count(),
      prisma.doctor.count(),
      prisma.consultation.count(),
      prisma.consultation.groupBy({ by: ['status'], _count: true }),
      prisma.payment.aggregate({ _sum: { amount: true }, where: { status: 'SUCCESS' } })
    ]);

    res.json({
      totalUsers,
      totalDoctors,
      totalConsultations,
      consultationsByStatus,
      totalRevenue: totalRevenue._sum.amount || 0
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
