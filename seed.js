require('dotenv').config();
const { connectPostgres, User, Student } = require('./db');
const { ensureDefaultAdmin, ensureCompleteMarksAndStudents } = require('./utils/integrity');

async function seed() {
  await connectPostgres();

  // Ensure default admin exists
  await ensureDefaultAdmin();

  // Parent with 3 kids (demonstrating >2 kids requirement)
  // Phone: 1234567890, Parent: Rajesh Sharma
  const parentPhone = '1234567890';
  const parentName = 'Rajesh Sharma';

  await User.findOneAndUpdate(
    { phone: parentPhone, role: 'parent' },
    { phone: parentPhone, name: parentName, role: 'parent', email: 'rajesh.sharma@example.com' },
    { upsert: true, new: true }
  );

  // Link any existing legacy admissions 1, 2, 3 to parent
  await Student.updateMany(
    { admissionNo: { $in: ['1', '2', '3'] } },
    { $set: { parentMobile: parentPhone, parentName } }
  );

  // Generate complete students, faculty, attendance and marks across all 6 exams & bands
  await ensureCompleteMarksAndStudents();

  console.log('✅ Seed completed successfully with:');
  console.log(`- Parent: ${parentName} (${parentPhone}) with kids`);
  console.log(`- Complete marks for all 6 exams (FA1, FA2, SA1, FA3, FA4, SA2) across all classes (1 to 10)`);
  console.log(`- Both Part A and Part B subjects fully populated`);
  console.log(`- Attendance history generated for each student`);
  process.exit(0);
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
