const express = require('express');
const { bookSlot } = require('../services/bookingService.js');

const router = express.Router();

router.post('/', async (req, res) => {
  const { patientId, slotId, idempotencyKey } = req.body || {};

  if (!patientId || !slotId || !idempotencyKey) {
    return res.status(400).json({
      error: 'patientId, slotId, and idempotencyKey are required',
    });
  }

  try {
    const consultation = await bookSlot({
      patientId,
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