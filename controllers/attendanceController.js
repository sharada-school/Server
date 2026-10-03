const { Attendance } = require('../db');
const { captureAudit } = require('../middleware/audit');
const { toObjectId, serialize } = require('../utils/helpers');

const getAttendance = async (_, res) => {
  const records = await Attendance.find({}).sort({ date: -1 }).populate('studentId', 'firstName lastName admissionNo className section rollNumber').lean();
  const attendance = records.map((entry) => ({
    ...serialize(entry),
    studentId: entry.studentId ? serialize(entry.studentId) : null,
    date: entry.date ? new Date(entry.date).toISOString() : null
  }));
  res.json(attendance);
};

const createAttendance = async (req, res) => {
  const studentId = toObjectId(req.body.studentId);
  const dateValue = req.body.date ? new Date(req.body.date) : null;

  if (!studentId || !req.body.date || Number.isNaN(dateValue?.getTime?.())) {
    return res.status(400).json({ error: 'Student and date are required to save attendance.' });
  }

  const attendance = await Attendance.findOneAndUpdate(
    { studentId, date: dateValue },
    {
      status: req.body.status || 'Present',
      sessionStatus: req.body.sessionStatus || 'Full Day',
      attendanceType: req.body.attendanceType || 'Full Day',
      remarks: req.body.remarks || '',
      studentId,
      date: dateValue
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await captureAudit('create', 'attendance', attendance, req.body, req.user);
  res.status(201).json(serialize(attendance));
};

const updateAttendance = async (req, res) => {
  const studentId = toObjectId(req.body.studentId);
  const dateValue = req.body.date ? new Date(req.body.date) : null;

  if (!studentId || !req.body.date || Number.isNaN(dateValue?.getTime?.())) {
    return res.status(400).json({ error: 'Student and date are required to update attendance.' });
  }

  const attendance = await Attendance.findByIdAndUpdate(
    req.params.id,
    {
      studentId,
      date: dateValue,
      status: req.body.status || 'Present',
      sessionStatus: req.body.sessionStatus || 'Full Day',
      attendanceType: req.body.attendanceType || 'Full Day',
      remarks: req.body.remarks || ''
    },
    { new: true }
  );

  if (!attendance) return res.status(404).json({ error: 'Attendance not found' });
  await captureAudit('update', 'attendance', attendance, req.body, req.user);
  res.json(serialize(attendance));
};

const deleteAttendance = async (req, res) => {
  const attendance = await Attendance.findByIdAndDelete(req.params.id);
  if (!attendance) return res.status(404).json({ error: 'Attendance not found' });
  res.json({ success: true, id: req.params.id });
};

module.exports = {
  getAttendance,
  createAttendance,
  updateAttendance,
  deleteAttendance
};
