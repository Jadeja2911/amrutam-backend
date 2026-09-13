const express = require('express');
const { authMiddleware, requireRole } = require('../middleware/auth.js');
const { bookSlot } = require('../services/bookingService.js');
const { validate, bookingSchema } = require('../middleware/validation.js');

const router = express.Router();

router.post('/', authMiddleware, requireRole('PATIENT'), validate(bookingSchema), async (req, res) => {
  const { slotId, idempotencyKey } = req.body || {};

  if (!slotId || !idempotencyKey) {
    return res.status(400).json({
      error: 'slotId and idempotencyKey are required',
    });
  }

  try {
    const consultation = await bookSlot({
      patientId: req.user.userId,
      slotId,
      idempotencyKey,
    });

    return res.status(201).json(consultation);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

    if (message === 'SLOT_NOT_FOUND') {
      return res.status(404).json({ error: 'SLOT_NOT_FOUND' });
    }

    if (message === 'SLOT_ALREADY_BOOKED') {
      return res.status(409).json({ error: 'SLOT_ALREADY_BOOKED' });
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;