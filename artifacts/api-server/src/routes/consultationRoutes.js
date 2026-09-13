const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, requireRole } = require('../middleware/auth.js');

const prisma = new PrismaClient();
const router = express.Router();

class RouteError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function sendRouteError(res, error) {
  if (error instanceof RouteError) {
    return res.status(error.status).json({ error: error.code });
  }

  return res.status(500).json({ error: 'Internal server error' });
}

async function findConsultation(id, client = prisma) {
  return client.consultation.findUnique({
    where: { id },
  });
}

async function findDoctorForUser(userId, client = prisma) {
  return client.doctor.findUnique({
    where: { userId },
  });
}

async function canAccessConsultation(consultation, user, client = prisma) {
  if (user.role === 'PATIENT') {
    return consultation.patientId === user.userId;
  }

  if (user.role === 'DOCTOR') {
    const doctor = await findDoctorForUser(user.userId, client);
    return Boolean(doctor && consultation.doctorId === doctor.id);
  }

  return false;
}

router.patch(
  '/:id/complete',
  authMiddleware,
  requireRole('DOCTOR'),
  async (req, res) => {
    try {
      const [consultation, doctor] = await Promise.all([
        findConsultation(req.params.id),
        findDoctorForUser(req.user.userId),
      ]);

      if (!consultation) {
        throw new RouteError(404, 'CONSULTATION_NOT_FOUND');
      }

      if (!doctor || consultation.doctorId !== doctor.id) {
        throw new RouteError(403, 'Forbidden');
      }

      if (consultation.status !== 'SCHEDULED') {
        throw new RouteError(409, 'INVALID_STATUS_TRANSITION');
      }

      const updatedConsultation = await prisma.consultation.update({
        where: { id: consultation.id },
        data: { status: 'COMPLETED' },
      });

      await prisma.auditLog.create({ data: { userId: req.user.userId, action: 'CONSULTATION_COMPLETED', entity: 'Consultation', entityId: updatedConsultation.id } });

      return res.status(200).json(updatedConsultation);
    } catch (error) {
      return sendRouteError(res, error);
    }
  },
);

router.patch('/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const consultation = await findConsultation(req.params.id);

    if (!consultation) {
      throw new RouteError(404, 'CONSULTATION_NOT_FOUND');
    }

    if (!(await canAccessConsultation(consultation, req.user))) {
      throw new RouteError(403, 'Forbidden');
    }

    const updatedConsultation = await prisma.$transaction(async (tx) => {
      const currentConsultation = await findConsultation(consultation.id, tx);

      if (!currentConsultation) {
        throw new RouteError(404, 'CONSULTATION_NOT_FOUND');
      }

      if (currentConsultation.status !== 'SCHEDULED') {
        throw new RouteError(409, 'INVALID_STATUS_TRANSITION');
      }

      const updated = await tx.consultation.update({
        where: { id: currentConsultation.id },
        data: { status: 'CANCELLED' },
      });

      await tx.availabilitySlot.update({
        where: { id: currentConsultation.slotId },
        data: { isBooked: false },
      });

        await tx.auditLog.create({ data: { userId: req.user.userId, action: 'CONSULTATION_CANCELLED', entity: 'Consultation', entityId: updated.id } });

      return updated;
    });

    return res.status(200).json(updatedConsultation);
  } catch (error) {
    return sendRouteError(res, error);
  }
});

router.post(
  '/:id/prescription',
  authMiddleware,
  requireRole('DOCTOR'),
  async (req, res) => {
    try {
      const [consultation, doctor] = await Promise.all([
        findConsultation(req.params.id),
        findDoctorForUser(req.user.userId),
      ]);

      if (!consultation) {
        throw new RouteError(404, 'CONSULTATION_NOT_FOUND');
      }

      if (!doctor || consultation.doctorId !== doctor.id) {
        throw new RouteError(403, 'Forbidden');
      }

      if (consultation.status !== 'COMPLETED') {
        throw new RouteError(409, 'CONSULTATION_NOT_COMPLETED');
      }

      const { content } = req.body || {};

      if (typeof content !== 'string' || !content.trim()) {
        throw new RouteError(400, 'content is required');
      }

      const prescription = await prisma.prescription.create({
        data: {
          consultationId: consultation.id,
          content,
        },
      });

      await prisma.auditLog.create({ data: { userId: req.user.userId, action: 'PRESCRIPTION_CREATED', entity: 'Prescription', entityId: prescription.id } });

      return res.status(201).json(prescription);
    } catch (error) {
      if (error && error.code === 'P2002') {
        return res.status(409).json({ error: 'PRESCRIPTION_ALREADY_EXISTS' });
      }

      return sendRouteError(res, error);
    }
  },
);

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const consultation = await findConsultation(req.params.id);

    if (!consultation) {
      throw new RouteError(404, 'CONSULTATION_NOT_FOUND');
    }

    if (!(await canAccessConsultation(consultation, req.user))) {
      throw new RouteError(403, 'Forbidden');
    }

    const consultationWithPrescription = await prisma.consultation.findUnique({
      where: { id: consultation.id },
      include: { prescription: true },
    });

    return res.status(200).json(consultationWithPrescription);
  } catch (error) {
    return sendRouteError(res, error);
  }
});

module.exports = router;