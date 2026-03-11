// prisma/seed.ts
import { PrismaClient, Role, ShiftType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create Company
  const company = await prisma.company.upsert({
    where: { code: 'PT-DEMO' },
    update: {},
    create: {
      name: 'PT Demo Perusahaan',
      code: 'PT-DEMO',
      address: 'Jl. Sudirman No. 1, Jakarta Pusat',
      phone: '021-12345678',
      email: 'info@demo.co.id',
      timezone: 'Asia/Jakarta',
    },
  });

  // Create Attendance Policy
  await prisma.attendancePolicy.upsert({
    where: { companyId: company.id },
    update: {},
    create: {
      companyId: company.id,
      maxLateMinutes: 15,
      autoAbsentAfterHours: 4,
      requireSelfie: true,
      requireLocation: true,
      workingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    },
  });

  // Create Shifts
  const morningShift = await prisma.shift.create({
    data: {
      companyId: company.id,
      name: 'Shift Pagi',
      type: ShiftType.MORNING,
      startTime: '08:00',
      endTime: '17:00',
      lateThreshold: 15,
    },
  });

  // Create Location
  const location = await prisma.location.create({
    data: {
      companyId: company.id,
      name: 'Kantor Pusat Jakarta',
      address: 'Jl. Sudirman No. 1, Jakarta Pusat',
      latitude: -6.2088,
      longitude: 106.8456,
      radius: 100,
    },
  });

  // Create Super Admin
  const hashedPassword = await bcrypt.hash('Admin@123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.co.id' },
    update: {},
    create: {
      companyId: company.id,
      employeeId: 'EMP-001',
      email: 'admin@demo.co.id',
      fullName: 'Super Administrator',
      role: Role.SUPER_ADMIN,
      password: hashedPassword,
      department: 'IT',
      position: 'System Administrator',
      shiftId: morningShift.id,
      emailVerified: true,
    },
  });

  // Create Supervisor
  const supervisor = await prisma.user.upsert({
    where: { email: 'supervisor@demo.co.id' },
    update: {},
    create: {
      companyId: company.id,
      employeeId: 'EMP-002',
      email: 'supervisor@demo.co.id',
      fullName: 'Budi Supervisor',
      role: Role.SUPERVISOR,
      password: hashedPassword,
      department: 'Operations',
      position: 'Field Supervisor',
      shiftId: morningShift.id,
      emailVerified: true,
    },
  });

  // Create Field Workers
  const fieldWorkers = [
    { name: 'Ahmad Fauzi', employeeId: 'EMP-003', email: 'ahmad@demo.co.id' },
    { name: 'Siti Rahayu', employeeId: 'EMP-004', email: 'siti@demo.co.id' },
    { name: 'Budi Santoso', employeeId: 'EMP-005', email: 'budi@demo.co.id' },
  ];

  for (const worker of fieldWorkers) {
    const user = await prisma.user.upsert({
      where: { email: worker.email },
      update: {},
      create: {
        companyId: company.id,
        employeeId: worker.employeeId,
        email: worker.email,
        fullName: worker.name,
        role: Role.EMPLOYEE,
        password: hashedPassword,
        department: 'Field Operations',
        position: 'Field Worker',
        shiftId: morningShift.id,
        supervisorId: supervisor.id,
        emailVerified: true,
      },
    });

    // Assign location to worker
    await prisma.userLocation.upsert({
      where: { userId_locationId: { userId: user.id, locationId: location.id } },
      update: {},
      create: { userId: user.id, locationId: location.id },
    });
  }

  console.log('✅ Seeding complete!');
  console.log('📝 Login credentials:');
  console.log('   Admin: admin@demo.co.id / Admin@123');
  console.log('   Supervisor: supervisor@demo.co.id / Admin@123');
  console.log('   Employee: ahmad@demo.co.id / Admin@123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
