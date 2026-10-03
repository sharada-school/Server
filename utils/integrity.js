const { User, Student, Teacher, Mark, Attendance, pool } = require('../db');
const { getPreviousClass, getMarkRule } = require('./helpers');

const ensureDefaultAdmin = async () => {
  try {
    // 1. Clean up any accidental double-quoted records in Supabase
    if (pool) {
      await pool.query(`
        UPDATE public.users 
        SET email = REPLACE(TRIM(email), '"', ''),
            password = REPLACE(TRIM(password), '"', ''),
            role = REPLACE(TRIM(role), '"', '')
        WHERE email LIKE '%"%' OR password LIKE '%"%' OR role LIKE '%"%';
      `).catch(() => {});
    }

    // 2. Fetch existing admin or create/update with default admin credentials
    let existing = await User.findOne({ email: 'admin@sharada.edu' });
    if (!existing) {
      await User.create({
        email: 'admin@sharada.edu',
        password: 'admin123',
        name: 'School Admin',
        role: 'admin'
      });
      console.log('✅ Created default admin account: admin@sharada.edu / admin123');
    } else {
      await User.updateOne(
        { id: existing.id },
        { role: 'admin', password: 'admin123', name: existing.name || 'School Admin' }
      );
      console.log('✅ Verified & synchronized admin account: admin@sharada.edu / admin123');
    }
  } catch (err) {
    console.error('Error ensuring default admin:', err.message);
  }
};

const ensureCompleteMarksAndStudents = async () => {
  try {
    // 1. Ensure faculty members exist
    const teachersData = [
      { email: 'anita@sharada.edu', name: 'Dr. Anita Rao', qualification: 'M.Sc, B.Ed', designation: 'Senior Mathematics Teacher' },
      { email: 'rahul@sharada.edu', name: 'Rahul Menon', qualification: 'M.Sc, B.Ed', designation: 'Science Teacher' },
      { email: 'priya@sharada.edu', name: 'Priya Sundaram', qualification: 'M.A, B.Ed', designation: 'English Language Teacher' },
      { email: 'suresh@sharada.edu', name: 'Suresh Patil', qualification: 'M.A, B.Ed', designation: 'Kannada Language Teacher' },
      { email: 'sunita@sharada.edu', name: 'Sunita Sharma', qualification: 'M.A, B.Ed', designation: 'Hindi Language Teacher' },
      { email: 'ramesh@sharada.edu', name: 'Ramesh Kulkarni', qualification: 'M.A, M.Ed', designation: 'Social Science Teacher' },
      { email: 'geeta@sharada.edu', name: 'Geeta Nayak', qualification: 'B.Sc, B.Ed', designation: 'Arts & Environmental Studies' }
    ];

    const teacherMap = {};
    for (const t of teachersData) {
      const doc = await Teacher.findOneAndUpdate(
        { email: t.email },
        { ...t, phone: '9876543210', joiningDate: new Date('2020-06-01') },
        { upsert: true, new: true }
      );
      if (t.name.includes('Anita')) teacherMap.math = doc;
      if (t.name.includes('Rahul')) teacherMap.science = doc;
      if (t.name.includes('Priya')) teacherMap.english = doc;
      if (t.name.includes('Suresh')) teacherMap.kannada = doc;
      if (t.name.includes('Sunita')) teacherMap.hindi = doc;
      if (t.name.includes('Ramesh')) teacherMap.social = doc;
      if (t.name.includes('Geeta')) teacherMap.evs = doc;
    }

    // 2. Ensure students exist across all 3 bands (Classes 1 to 10)
    const sampleStudents = [
      { admissionNo: 'STU-2024-004', firstName: 'Ananya', lastName: 'Rao', className: '1 A', section: 'A', rollNumber: 1, parentName: 'Suresh Rao', parentMobile: '9845012341', email: 'ananya@example.com' },
      { admissionNo: 'STU-2024-005', firstName: 'Rohan', lastName: 'Gowda', className: '2 A', section: 'A', rollNumber: 2, parentName: 'Manjunath Gowda', parentMobile: '9845012342', email: 'rohan@example.com' },
      { admissionNo: 'STU-2024-006', firstName: 'Tanvi', lastName: 'Bhat', className: '3 A', section: 'A', rollNumber: 3, parentName: 'Ganesh Bhat', parentMobile: '9845012343', email: 'tanvi@example.com' },
      { admissionNo: 'STU-2024-003', firstName: 'Vivaan', lastName: 'Sharma', className: '4 A', section: 'A', rollNumber: 12, parentName: 'Rajesh Sharma', parentMobile: '1234567890', email: 'vivaan@example.com' },
      { admissionNo: 'STU-2024-007', firstName: 'Ishaan', lastName: 'Joshi', className: '5 A', section: 'A', rollNumber: 5, parentName: 'Prashant Joshi', parentMobile: '9845012345', email: 'ishaan@example.com' },
      { admissionNo: 'STU-2024-008', firstName: 'Sneha', lastName: 'Patil', className: '6 A', section: 'A', rollNumber: 6, parentName: 'Basavaraj Patil', parentMobile: '9845012346', email: 'sneha@example.com' },
      { admissionNo: 'STU-2024-002', firstName: 'Meera', lastName: 'Sharma', className: '7 B', section: 'B', rollNumber: 5, parentName: 'Rajesh Sharma', parentMobile: '1234567890', email: 'meera@example.com' },
      { admissionNo: 'STU-2024-009', firstName: 'Aditya', lastName: 'Verma', className: '8 A', section: 'A', rollNumber: 8, parentName: 'Sunil Verma', parentMobile: '9845012348', email: 'aditya@example.com' },
      { admissionNo: 'STU-2024-010', firstName: 'Diya', lastName: 'Shetty', className: '9 A', section: 'A', rollNumber: 9, parentName: 'Sathish Shetty', parentMobile: '9845012349', email: 'diya@example.com' },
      { admissionNo: 'STU-2024-001', firstName: 'Aarav', lastName: 'Sharma', className: '10 A', section: 'A', rollNumber: 1, parentName: 'Rajesh Sharma', parentMobile: '1234567890', email: 'aarav@example.com' }
    ];

    for (const s of sampleStudents) {
      await Student.findOneAndUpdate(
        { admissionNo: s.admissionNo },
        { ...s, academicYear: '2024-2025', status: 'Active' },
        { upsert: true, new: true }
      );
    }

    // 3. Generate complete marks for all active students across all 6 exams and all subjects
    const allStudents = await Student.find({ status: { $ne: 'Graduated' } });
    const allExams = ['FA1', 'FA2', 'SA1', 'FA3', 'FA4', 'SA2'];

    const getTeacherForSubject = (subject) => {
      const s = String(subject).toLowerCase();
      if (s === 'mathematics') return teacherMap.math?._id || null;
      if (s === 'science') return teacherMap.science?._id || null;
      if (s === 'english') return teacherMap.english?._id || null;
      if (s === 'kannada') return teacherMap.kannada?._id || null;
      if (s === 'hindi') return teacherMap.hindi?._id || null;
      if (s === 'social' || s === 'social studies') return teacherMap.social?._id || null;
      return teacherMap.evs?._id || teacherMap.science?._id || null;
    };

    for (const student of allStudents) {
      const classNum = parseInt(String(student.className).match(/\d+/)?.[0] || '1', 10);
      const isBand1To5 = classNum >= 1 && classNum <= 5;
      const isBand6To8 = classNum >= 6 && classNum <= 8;
      const isBand9To10 = classNum >= 9 && classNum <= 10;

      const partASubjects = isBand1To5
        ? ['English', 'Kannada', 'Hindi', 'Mathematics', 'Environmental Studies']
        : ['English', 'Kannada', 'Hindi', 'Mathematics', 'Science', 'Social'];

      const partBSubjects = isBand1To5
        ? ['General Knowledge', 'Moral Science']
        : ['Computer', 'Physical Education', 'Moral Science', 'Drawing'];

      const roll = Number(student.rollNumber) || 1;

      // Part A marks for all 6 exams
      for (let subIdx = 0; subIdx < partASubjects.length; subIdx++) {
        const subject = partASubjects[subIdx];
        const teacherId = getTeacherForSubject(subject);

        for (let examIdx = 0; examIdx < allExams.length; examIdx++) {
          const examType = allExams[examIdx];
          const isFA = examType.startsWith('FA');

          let maxScore = 25;
          let convertedMaxScore = 15;
          let score = 21;
          let oralScore = 0;

          if (isFA) {
            maxScore = 25;
            convertedMaxScore = isBand6To8 ? 10 : 15;
            score = Math.min(25, 19 + ((roll * 3 + subIdx * 2 + examIdx) % 6));
            oralScore = 0;
          } else {
            // SA1 or SA2
            if (isBand9To10) {
              const isEnglish = subject.toLowerCase() === 'english';
              maxScore = isEnglish ? 100 : 80;
              convertedMaxScore = 20;
              score = isEnglish
                ? Math.min(100, 85 + ((roll * 2 + subIdx * 3 + examIdx) % 13))
                : Math.min(80, 67 + ((roll * 2 + subIdx * 2 + examIdx) % 11));
              oralScore = 0;
            } else {
              // Band 1-5 and Band 6-8
              maxScore = 40;
              convertedMaxScore = isBand6To8 ? 30 : 20;
              score = Math.min(40, 32 + ((roll * 2 + subIdx * 2 + examIdx) % 7));
              oralScore = 8 + ((roll + subIdx + examIdx) % 3);
            }
          }

          const convertedScore = Math.round((score / Math.max(maxScore, 1)) * convertedMaxScore * 100) / 100;
          const pct = (score / maxScore) * 100;
          const grade = pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B+' : pct >= 60 ? 'B' : 'C+';

          await Mark.findOneAndUpdate(
            { studentId: student._id, subject, examType, academicYear: student.academicYear || '2024-2025' },
            {
              studentId: student._id,
              className: student.className,
              academicYear: student.academicYear || '2024-2025',
              subject,
              examType,
              part: 'Part A',
              score,
              maxScore,
              oralScore,
              convertedScore,
              convertedMaxScore,
              grade,
              teacherId,
              subjectTeacherId: teacherId,
              classTeacherId: teacherMap.english?._id || teacherMap.math?._id || teacherId
            },
            { upsert: true }
          );
        }
      }

      // Part B marks
      for (const bSub of partBSubjects) {
        for (const examType of ['SA1', 'SA2']) {
          await Mark.findOneAndUpdate(
            { studentId: student._id, subject: bSub, examType, academicYear: student.academicYear || '2024-2025' },
            {
              studentId: student._id,
              className: student.className,
              academicYear: student.academicYear || '2024-2025',
              subject: bSub,
              examType,
              part: 'Part B',
              score: 0,
              maxScore: 0,
              oralScore: 0,
              convertedScore: 0,
              convertedMaxScore: 0,
              grade: 'A',
              teacherId: teacherMap.evs?._id || null,
              subjectTeacherId: teacherMap.evs?._id || null,
              classTeacherId: teacherMap.english?._id || null
            },
            { upsert: true }
          );
        }
      }

      // 4. Ensure Attendance history (30 days)
      const today = new Date();
      for (let dayOffset = 1; dayOffset <= 25; dayOffset++) {
        const attDate = new Date(today);
        attDate.setDate(today.getDate() - dayOffset);
        if (attDate.getDay() === 0) continue; // Skip Sundays

        const isAbsent = (roll + dayOffset) % 19 === 0;
        const isLate = (roll + dayOffset) % 13 === 0;
        const status = isAbsent ? 'Absent' : isLate ? 'Late' : 'Present';
        const remarks = isAbsent ? 'Medical leave' : isLate ? 'Bus delayed' : 'Regular';

        await Attendance.findOneAndUpdate(
          { studentId: student._id, date: new Date(attDate.setHours(0, 0, 0, 0)) },
          {
            studentId: student._id,
            date: attDate,
            status,
            sessionStatus: 'Full Day',
            attendanceType: 'Full Day',
            remarks
          },
          { upsert: true }
        );
      }
    }
    console.log('✅ Ensure complete marks and students finished successfully.');
  } catch (err) {
    console.error('Error ensuring marks and students:', err);
  }
};

const ensureDataIntegrity = async () => {
  try {
    const marksWithoutYear = await Mark.find({
      $or: [{ academicYear: null }, { academicYear: '' }, { academicYear: { $exists: false } }]
    }).populate('studentId', 'className academicYear academicHistory');

    for (const m of marksWithoutYear) {
      let resolvedYear = '2024-2025';
      let resolvedClass = m.className || '';
      if (m.studentId) {
        const matchedHistory = (m.studentId.academicHistory || []).find((h) => h.className === m.className);
        if (matchedHistory?.academicYear) {
          resolvedYear = matchedHistory.academicYear;
        } else if (m.studentId.academicYear && m.studentId.academicYear === '2024-2025') {
          resolvedYear = m.studentId.academicYear;
        } else {
          resolvedYear = '2024-2025';
        }
        if (!resolvedClass) {
          resolvedClass = matchedHistory?.className || getPreviousClass(m.studentId.className) || m.studentId.className || '';
        }
      }
      await Mark.updateOne({ _id: m._id }, { $set: { academicYear: resolvedYear, className: resolvedClass } });
    }

    const advancedStudents = await Student.find({
      academicYear: { $ne: '2024-2025' },
      $or: [{ academicHistory: { $size: 0 } }, { academicHistory: { $exists: false } }]
    });

    for (const student of advancedStudents) {
      const prevClass = getPreviousClass(student.className);
      const prevYear = '2024-2025';
      await Student.updateOne(
        { _id: student._id },
        {
          $set: {
            academicHistory: [
              {
                academicYear: prevYear,
                className: prevClass,
                section: student.section || '',
                status: 'Completed',
                promotedAt: new Date()
              }
            ]
          }
        }
      );

      if (prevClass) {
        await Mark.updateMany(
          {
            studentId: student._id,
            $or: [
              { className: prevClass },
              { academicYear: '2024-2025' },
              { academicYear: student.academicYear }
            ]
          },
          { $set: { academicYear: prevYear, className: prevClass } }
        );
      }
    }

    // Populate full marks and students so all tables show complete data
    await ensureCompleteMarksAndStudents();
  } catch (err) {
    console.error('Data integrity check warning:', err.message);
  }
};

module.exports = {
  ensureDefaultAdmin,
  ensureDataIntegrity,
  ensureCompleteMarksAndStudents
};
