import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const doctorUser = await prisma.user.create({
    data: {
      email: "doc1@test.com",
      passwordHash: "seed-placeholder-doctor-password-hash",
      role: "DOCTOR",
    },
  });

  const doctor = await prisma.doctor.create({
    data: {
      userId: doctorUser.id,
      specialization: "General Physician",
      licenseNo: "LIC001",
      consultFee: new Prisma.Decimal("500.00"),
    },
  });

  const patientUser = await prisma.user.create({
    data: {
      email: "patient1@test.com",
      passwordHash: "seed-placeholder-patient-password-hash",
      role: "PATIENT",
    },
  });

  const now = new Date();
  const availabilitySlot = await prisma.availabilitySlot.create({
    data: {
      doctorId: doctor.id,
      startTime: new Date(now.getTime() + 60 * 60 * 1000),
      endTime: new Date(now.getTime() + 90 * 60 * 1000),
      isBooked: false,
    },
  });

  console.log("Created seed records:");
  console.log({
    doctorUserId: doctorUser.id,
    doctorId: doctor.id,
    patientUserId: patientUser.id,
    availabilitySlotId: availabilitySlot.id,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });