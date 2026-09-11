import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function bookSlot({ patientId, slotId, idempotencyKey }) {
  return await prisma.$transaction(async (tx) => {
    // 1. Idempotency check - same request retry hoy to already-created return karo
    const existing = await tx.consultation.findUnique({
      where: { idempotencyKey },
    });
    if (existing) return existing;

    // 2. Row lock - raw query jaruri chhe kem ke Prisma no FOR UPDATE built-in nathi
    const [slot] = await tx.$queryRaw`
      SELECT * FROM "AvailabilitySlot" WHERE id = ${slotId} FOR UPDATE
    `;

    if (!slot) throw new Error("SLOT_NOT_FOUND");
    if (slot.isBooked) throw new Error("SLOT_ALREADY_BOOKED");

    // 3. Mark slot booked
    await tx.availabilitySlot.update({
      where: { id: slotId },
      data: { isBooked: true },
    });

    // 4. Create consultation
    const consultation = await tx.consultation.create({
      data: {
        patientId,
        doctorId: slot.doctorId,
        slotId,
        idempotencyKey,
        status: "SCHEDULED",
      },
    });

    // 5. Audit log - same transaction ma, atomicity guarantee
    await tx.auditLog.create({
      data: {
        userId: patientId,
        action: "BOOKING_CREATED",
        entity: "Consultation",
        entityId: consultation.id,
      },
    });

    return consultation;
  }, {
    isolationLevel: "ReadCommitted",
    timeout: 5000, // 5 sec ma lock release na thay to fail
  });
}

export { bookSlot };