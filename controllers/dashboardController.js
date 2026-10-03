const { Student, Teacher, Attendance, Mark } = require('../db');
const { serialize } = require('../utils/helpers');

const getDashboard = async (_, res) => {
  const [students, teachers, attendance, marks] = await Promise.all([
    Student.find({}).sort({ createdAt: -1 }).lean(),
    Teacher.countDocuments(),
    Attendance.find({ date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }).lean(),
    Mark.find({}).lean()
  ]);

  const marksByStudent = marks.reduce((map, mark) => {
    const studentId = mark.studentId?.toString();
    if (!studentId) return map;
    map[studentId] = map[studentId] || [];
    map[studentId].push({
      ...mark,
      id: mark._id.toString(),
      studentId: mark.studentId.toString(),
      className: mark.className || '',
      academicYear: mark.academicYear || '2024-2025',
      teacherId: mark.teacherId ? mark.teacherId.toString() : null
    });
    return map;
  }, {});

  const serializedStudents = students.map((student) => ({
    ...serialize(student),
    marks: (marksByStudent[student._id.toString()] || []).map((mark) => ({
      ...mark,
      teacher: mark.teacherId ? { id: mark.teacherId, name: 'Assigned teacher' } : null
    }))
  }));

  const present = attendance.reduce((total, item) => {
    if (item.status === 'Present') return total + 1;
    if (item.status === 'Half Day') return total + 0.5;
    return total;
  }, 0);
  const attendancePercent = attendance.length ? Math.round((present / attendance.length) * 100) : 96;
  const average = marks.length ? Math.round(marks.reduce((sum, item) => sum + ((item.score / (item.maxScore || 100)) * 100), 0) / marks.length) : 84;

  res.json({
    students: serializedStudents,
    stats: {
      students: serializedStudents.length,
      teachers,
      attendance: attendancePercent,
      average
    }
  });
};

module.exports = {
  getDashboard
};
