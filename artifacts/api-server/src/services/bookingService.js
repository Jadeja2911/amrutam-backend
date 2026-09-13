const { PrismaClient } = require('@prisma/client');
const { enqueue } = require('./jobQueue');
const prisma = new PrismaClient();

async function bookSlot({ patientId, slotId, idempotencyKey }) {
  return await prisma.$transaction(async (tx) => {
    const existing = await tx.consultation.findUnique({
      where: { idempotencyKey },
    });
    if (existing) return existing;

    const [slot] = await tx.$queryRaw`
      SELECT * FROM "AvailabilitySlot" WHERE id = ${slotId} FOR UPDATE
    `;

    if (!slot) throw new Error('SLOT_NOT_FOUND');
    if (slot.isBooked) throw new Error('SLOT_ALREADY_BOOKED');

    await tx.availabilitySlot.update({
      where: { id: slotId },
      data: { isBooked: true },
    });

    const consultation = await tx.consultation.create({
      data: {
        patientId,
        doctorId: slot.doctorId,
        slotId,
        idempotencyKey,
        status: 'SCHEDULED',
      },
    });

    await tx.auditLog.create({
      data: {
        userId: patientId,
        action: 'BOOKING_CREATED',
        entity: 'Consultation',
        entityId: consultation.id,
      },
    });

    enqueue('SEND_BOOKING_CONFIRMATION', { consultationId: consultation.id, patientId: consultation.patientId });

    return consultation;
  }, {
    isolationLevel: 'ReadCommitted',
    timeout: 5000,
  });
}

module.exports = { bookSlot };