const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, requireRole } = require('../middleware/auth.js');

const prisma = new PrismaClient();
const router = express.Router();

function parseDate(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

router.post(
  '/',
  authMiddleware,
  requireRole('DOCTOR'),
  async (req, res) => {
    const { startTime: startTimeInput, endTime: endTimeInput } = req.body || {};
    const startTime = parseDate(startTimeInput);
    const endTime = parseDate(endTimeInput);

    if (
      !startTime ||
      !endTime ||
      startTime >= endTime ||
      startTime <= new Date()
    ) {
      return res.status(400).json({
        error:
          'startTime and endTime must be valid ISO dates, with startTime in the future and before endTime',
      });
    }

    try {
      const doctor = await prisma.doctor.findUnique({
        where: { userId: req.user.userId },
      });

      if (!doctor) {
        return res.status(404).json({ error: 'Doctor record not found' });
      }

      const slot = await prisma.availabilitySlot.create({
        data: {
          doctorId: doctor.id,
          startTime,
          endTime,
        },
      });

      return res.status(201).json(slot);
    } catch (_error) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.get('/:doctorId', async (req, res) => {
  try {
    const slots = await prisma.availabilitySlot.findMany({
      where: {
        doctorId: req.params.doctorId,
        isBooked: false,
        startTime: { gt: new Date() },
      },
      orderBy: { startTime: 'asc' },
    });

    return res.status(200).json(slots);
  } catch (_error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;