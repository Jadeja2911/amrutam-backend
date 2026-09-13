const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth.js');
const router = express.Router();
const prisma = new PrismaClient();

/**
 * Payment is modeled as a stub/mock gateway integration point.
 * In production this would call a real PCI-compliant payment provider
 * (Stripe, Razorpay, etc.) and this endpoint would instead be a webhook
 * handler reacting to that provider's events.
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { consultationId, amount, idempotencyKey } = req.body || {};
    if (!consultationId || !amount || !idempotencyKey) {
      return res.status(400).json({ error: 'consultationId, amount, and idempotencyKey are required' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findFirst({
        where: { consultationId, gatewayRef: idempotencyKey },
      });
      if (existing) return existing;

      const consultation = await tx.consultation.findUnique({ where: { id: consultationId } });
      if (!consultation) {
        throw Object.assign(new Error('CONSULTATION_NOT_FOUND'), { status: 404 });
      }
      if (consultation.patientId !== req.user.userId) {
        throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
      }

      const payment = await tx.payment.create({
        data: {
          consultationId,
          amount,
          status: 'SUCCESS', // stub: assume success; a real gateway callback would set this
          gatewayRef: idempotencyKey,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'PAYMENT_RECORDED',
          entity: 'Payment',
          entityId: payment.id,
        },
      });

      return payment;
    });

    return res.status(201).json(result);
  } catch (error) {
    const status = error.status || 500;
    const message = error.message === 'CONSULTATION_NOT_FOUND' || error.message === 'FORBIDDEN'
      ? error.message
      : 'Internal server error';
    return res.status(status).json({ error: message });
  }
});

router.get('/:consultationId', authMiddleware, async (req, res) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { consultationId: req.params.consultationId },
    });
    if (!payment) return res.status(404).json({ error: 'PAYMENT_NOT_FOUND' });
    return res.status(200).json(payment);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
