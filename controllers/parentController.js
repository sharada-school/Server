const { User, Student, Attendance, Mark } = require('../db');
const { createSession, calculateGrade } = require('../middleware/auth');
const { toObjectId, serialize, isPartBMark } = require('../utils/helpers');

// Parent Phone Login (Auto-creates user account if not existing before)
const parentLogin = async (req, res) => {
  try {
    const rawPhone = String(req.body.phone || '').trim();
    const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);

    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ error: 'A valid 10-digit mobile number is required.' });
    }

    // Find all students matching this parent's phone number
    const matchingStudents = await Student.find({
      $or: [
        { parentMobile: cleanPhone },
        { parentMobile: `+91${cleanPhone}` },
        { parentMobile: { $regex: `${cleanPhone}$` } }
      ]
    }).sort({ rollNumber: 1, firstName: 1 }).lean();

    // Verify that this mobile number is linked to at least one student in the school
    if (!matchingStudents || matchingStudents.length === 0) {
      return res.status(404).json({
        error: `Mobile number (+91 ${cleanPhone}) is not registered with any student at Sharada English Medium School. Please check for typos or contact the school office (Ph: 8867026358).`
      });
    }

    // Check if user already exists in User collection
    let user = await User.findOne({ phone: cleanPhone, role: 'parent' });
    let isNewUser = false;

    if (!user) {
      const inferredName = String(req.body.name || '').trim() ||
        matchingStudents[0]?.parentName ||
        `Account (${cleanPhone.slice(-4)})`;

      const userData = {
        phone: cleanPhone,
        name: inferredName,
        role: 'parent'
      };

      const parentEmailCandidate = matchingStudents.find(
        (s) => s.parentEmail && String(s.parentEmail).trim()
      )?.parentEmail;

      if (parentEmailCandidate && String(parentEmailCandidate).trim()) {
        const cleanEmail = String(parentEmailCandidate).trim().toLowerCase();
        const existingEmailUser = await User.findOne({ email: cleanEmail });
        if (!existingEmailUser) {
          userData.email = cleanEmail;
        }
      }

      user = await User.create(userData);
      isNewUser = true;
    } else if (req.body.name && String(req.body.name).trim() && user.name !== String(req.body.name).trim()) {
      user.name = String(req.body.name).trim();
      await user.save();
    }

    const token = createSession(user);
    res.json({
      token,
      user: serialize(user),
      isNewUser,
      kidsCount: matchingStudents.length,
      kids: matchingStudents.map(serialize)
    });
  } catch (error) {
    console.error('Login error:', error);
    if (error.code === 11000 || error.message?.includes('E11000')) {
      if (error.keyPattern?.email || error.message?.includes('email_1')) {
        return res.status(400).json({
          error: 'This email address is already linked with another account. Please contact the school office.'
        });
      }
      if (error.keyPattern?.phone || error.message?.includes('phone_1')) {
        try {
          const cleanPhone = String(req.body.phone || '').replace(/\D/g, '').slice(-10);
          const existing = await User.findOne({ phone: cleanPhone });
          if (existing) {
            const token = createSession(existing);
            return res.json({
              token,
              user: serialize(existing),
              isNewUser: false,
              kidsCount: 0,
              kids: []
            });
          }
        } catch {}
        return res.status(400).json({
          error: 'This mobile number is already registered in the system.'
        });
      }
      return res.status(400).json({
        error: 'An account with this mobile number already exists.'
      });
    }
    res.status(500).json({
      error: 'Login failed. Please verify your mobile number or contact Sharada English Medium School office.'
    });
  }
};

// Get all kids for the authenticated parent (handles 1, 2, or 3+ kids)
const getParentKids = async (req, res) => {
  try {
    const cleanPhone = String(req.user.phone || '').replace(/\D/g, '').slice(-10);
    if (!cleanPhone) {
      return res.status(400).json({ error: 'No phone number associated with parent session.' });
    }

    const kids = await Student.find({
      $or: [
        { parentMobile: cleanPhone },
        { parentMobile: `+91${cleanPhone}` },
        { parentMobile: { $regex: `${cleanPhone}$` } }
      ]
    }).sort({ rollNumber: 1, firstName: 1 }).lean();

    const enrichedKids = await Promise.all(kids.map(async (kid) => {
      const [attendanceCount, presentCount, marksCount, recentAttendance] = await Promise.all([
        Attendance.countDocuments({ studentId: kid._id }),
        Attendance.countDocuments({ studentId: kid._id, status: { $in: ['Present', 'Half Day'] } }),
        Mark.countDocuments({ studentId: kid._id }),
        Attendance.findOne({ studentId: kid._id }).sort({ date: -1 }).lean()
      ]);

      const attendancePercent = attendanceCount > 0 ? Math.round((presentCount / attendanceCount) * 100) : 100;
      return {
        ...serialize(kid),
        stats: {
          attendancePercent,
          attendanceRecords: attendanceCount,
          marksRecorded: marksCount,
          recentStatus: recentAttendance?.status || 'Present',
          recentDate: recentAttendance?.date ? new Date(recentAttendance.date).toISOString() : null
        }
      };
    }));

    res.json(enrichedKids);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Kid's Attendance records and statistics
const getKidAttendance = async (req, res) => {
  try {
    const studentId = toObjectId(req.params.studentId);
    const student = await Student.findById(studentId).lean();
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const records = await Attendance.find({ studentId }).sort({ date: -1 }).lean();

    const presentDays = records.filter((r) => r.status === 'Present').length;
    const absentDays = records.filter((r) => r.status === 'Absent').length;
    const halfDays = records.filter((r) => r.status === 'Half Day').length;
    const lateDays = records.filter((r) => r.status === 'Late').length;
    const totalDays = records.length;
    const attendancePercent = totalDays > 0 ? Math.round(((presentDays + halfDays * 0.5) / totalDays) * 100) : 100;

    res.json({
      student: serialize(student),
      stats: {
        totalDays,
        presentDays,
        absentDays,
        halfDays,
        lateDays,
        percentage: attendancePercent
      },
      records: records.map((r) => ({
        ...serialize(r),
        date: r.date ? new Date(r.date).toISOString() : null
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Kid's Marks grouped by exam with multi-year session isolation
const getKidMarks = async (req, res) => {
  try {
    const studentId = toObjectId(req.params.studentId);
    const student = await Student.findById(studentId).lean();
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const marks = await Mark.find({ studentId })
      .populate('teacherId', 'name designation')
      .populate('classTeacherId', 'name')
      .populate('subjectTeacherId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const currentClass = student.className || '';
    const currentYear = student.academicYear || '2024-2025';

    // Build unique historical sessions list
    const sessionMap = new Map();
    const currentKey = `${currentClass}::${currentYear}`;
    sessionMap.set(currentKey, {
      className: currentClass,
      academicYear: currentYear,
      isCurrent: true,
      label: `Class ${currentClass} (${currentYear} - Current)`
    });

    if (Array.isArray(student.academicHistory)) {
      for (const h of student.academicHistory) {
        if (h.academicYear && h.className) {
          const hKey = `${h.className}::${h.academicYear}`;
          if (!sessionMap.has(hKey)) {
            sessionMap.set(hKey, {
              className: h.className,
              academicYear: h.academicYear,
              isCurrent: false,
              label: `Class ${h.className} (${h.academicYear})`
            });
          }
        }
      }
    }

    for (const m of marks) {
      const mClass = m.className || (m.academicYear && student.academicHistory?.find((h) => h.academicYear === m.academicYear)?.className) || currentClass;
      const mYear = m.academicYear || '2024-2025';
      const key = `${mClass}::${mYear}`;
      if (!sessionMap.has(key)) {
        sessionMap.set(key, {
          className: mClass,
          academicYear: mYear,
          isCurrent: key === currentKey,
          label: `Class ${mClass} (${mYear})`
        });
      }
    }

    const availableSessions = Array.from(sessionMap.values());

    const reqYear = req.query.year ? String(req.query.year).trim() : null;
    const reqClass = req.query.class ? String(req.query.class).trim() : null;

    const selectedClass = reqClass || currentClass;
    const selectedAcademicYear = reqYear || currentYear;

    // Filter marks for the selected class/session
    const sessionMarks = marks.filter((m) => {
      const mClass = m.className || currentClass;
      const mYear = m.academicYear || '2024-2025';
      const matchClass = !selectedClass || mClass.toLowerCase() === selectedClass.toLowerCase();
      const matchYear = !selectedAcademicYear || mYear === selectedAcademicYear;
      return matchClass && matchYear;
    });

    const examsMap = {};
    for (const m of sessionMarks) {
      const exam = m.examType || 'FA1';
      if (!examsMap[exam]) {
        examsMap[exam] = {
          examType: exam,
          subjects: [],
          totalScore: 0,
          totalMaxScore: 0
        };
      }
      const isPartB = isPartBMark(m);
      const score = Number(m.score || 0);
      const maxScore = Number(m.maxScore || 100);
      const grade = m.grade || calculateGrade(score, maxScore);
      const teacherName = m.subjectTeacherId?.name || m.teacherId?.name || m.classTeacherId?.name || 'Subject Teacher';

      if (!isPartB) {
        examsMap[exam].totalScore += score;
        examsMap[exam].totalMaxScore += maxScore;
      }

      examsMap[exam].subjects.push({
        ...serialize(m),
        className: m.className || selectedClass,
        academicYear: m.academicYear || selectedAcademicYear,
        part: isPartB ? 'Part B' : (m.part || 'Part A'),
        score: isPartB ? 0 : score,
        maxScore: isPartB ? 0 : maxScore,
        percentage: isPartB ? 0 : (maxScore > 0 ? Math.round((score / maxScore) * 100) : 0),
        grade,
        teacherName
      });
    }

    const exams = Object.values(examsMap).map((e) => {
      const percentage = e.totalMaxScore > 0 ? Math.round((e.totalScore / e.totalMaxScore) * 100) : 0;
      return {
        ...e,
        percentage,
        overallGrade: calculateGrade(e.totalScore, e.totalMaxScore)
      };
    });

    res.json({
      student: serialize(student),
      selectedClass,
      selectedAcademicYear,
      availableSessions,
      exams,
      allMarks: sessionMarks.map(serialize),
      totalHistoricalMarks: marks.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Parent multi-child summary overview
const getParentSummary = async (req, res) => {
  try {
    const cleanPhone = String(req.user.phone || '').replace(/\D/g, '').slice(-10);
    const kids = await Student.find({
      $or: [
        { parentMobile: cleanPhone },
        { parentMobile: `+91${cleanPhone}` },
        { parentMobile: { $regex: `${cleanPhone}$` } }
      ]
    }).sort({ rollNumber: 1, firstName: 1 }).lean();

    const summary = await Promise.all(kids.map(async (kid) => {
      const [attendance, marks] = await Promise.all([
        Attendance.find({ studentId: kid._id }).sort({ date: -1 }).lean(),
        Mark.find({ studentId: kid._id }).sort({ createdAt: -1 }).lean()
      ]);

      const present = attendance.filter((a) => a.status === 'Present').length;
      const half = attendance.filter((a) => a.status === 'Half Day').length;
      const attendancePercent = attendance.length > 0
        ? Math.round(((present + half * 0.5) / attendance.length) * 100)
        : 100;

      const currentClass = kid.className || '';
      const activeMarks = marks.filter((m) => (m.className || currentClass).toLowerCase() === currentClass.toLowerCase());
      const hasCurrentMarks = activeMarks.length > 0;
      const targetMarks = hasCurrentMarks ? activeMarks : marks;

      const latestExamType = targetMarks[0]?.examType || 'FA1';
      const latestMarks = targetMarks.filter((m) => m.examType === latestExamType && !isPartBMark(m));
      const totalScore = latestMarks.reduce((s, m) => s + (Number(m.score) || 0), 0);
      const totalMax = latestMarks.reduce((s, m) => s + (Number(m.maxScore) || 100), 0);
      const examPercent = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

      return {
        student: serialize(kid),
        attendance: {
          totalDays: attendance.length,
          presentDays: present,
          percentage: attendancePercent,
          recentStatus: attendance[0]?.status || 'Present',
          recentDate: attendance[0]?.date ? new Date(attendance[0].date).toISOString() : null
        },
        academics: {
          hasCurrentMarks,
          latestExam: hasCurrentMarks ? latestExamType : (targetMarks.length ? `${latestExamType} (Past)` : 'New Session'),
          percentage: examPercent,
          grade: calculateGrade(totalScore, totalMax),
          subjectsCount: latestMarks.length
        }
      };
    }));

    res.json({
      parent: req.user,
      kidsCount: kids.length,
      kids: summary
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Parent profile endpoint
const getParentProfile = async (req, res) => {
  res.json({ user: req.user });
};

module.exports = {
  parentLogin,
  getParentKids,
  getKidAttendance,
  getKidMarks,
  getParentSummary,
  getParentProfile
};
