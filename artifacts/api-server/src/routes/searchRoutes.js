const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    const { specialization, minFee, maxFee, page = 1, limit = 10 } = req.query;
    const where = {};
    if (specialization) {
      where.specialization = { contains: specialization, mode: 'insensitive' };
    }
    if (minFee || maxFee) {
      where.consultFee = {};
      if (minFee) where.consultFee.gte = parseFloat(minFee);
      if (maxFee) where.consultFee.lte = parseFloat(maxFee);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [doctors, total] = await Promise.all([
      prisma.doctor.findMany({
        where,
        skip,
        take: parseInt(limit),
        include: { user: { select: { email: true } } },
        orderBy: { consultFee: 'asc' }
      }),
      prisma.doctor.count({ where })
    ]);

    res.json({
      data: doctors,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
