const { Mark, Student } = require('../db');
const { captureAudit } = require('../middleware/audit');
const { toObjectId, serialize, prepareMark } = require('../utils/helpers');

const getMarks = async (_, res) => {
  const marks = await Mark.find({})
    .sort({ createdAt: -1 })
    .populate('studentId', 'firstName lastName admissionNo className section rollNumber')
    .populate('classTeacherId', 'name')
    .populate('subjectTeacherId', 'name')
    .populate('teacherId', 'name')
    .lean();

  res.json(marks.map((mark) => ({
    ...serialize(mark),
    studentId: mark.studentId ? serialize(mark.studentId) : null,
    classTeacherId: mark.classTeacherId ? serialize(mark.classTeacherId) : null,
    subjectTeacherId: mark.subjectTeacherId ? serialize(mark.subjectTeacherId) : null,
    teacherId: mark.teacherId ? serialize(mark.teacherId) : null,
    className: mark.className || mark.studentId?.className || '',
    academicYear: mark.academicYear || mark.studentId?.academicYear || '2024-2025',
    studentName: mark.studentId ? `${mark.studentId.firstName || ''} ${mark.studentId.lastName || ''}`.trim() : '',
    classTeacherName: mark.classTeacherId ? mark.classTeacherId.name : '',
    subjectTeacherName: mark.subjectTeacherId ? mark.subjectTeacherId.name : mark.teacherId ? mark.teacherId.name : ''
  })));
};

const createMark = async (req, res) => {
  let student = null;
  if (req.body.studentId) {
    student = await Student.findById(req.body.studentId).lean();
  }
  const payloadWithDefaults = {
    ...req.body,
    className: req.body.className || student?.className || '',
    academicYear: req.body.academicYear || student?.academicYear || '2024-2025'
  };
  const preparedMark = prepareMark(payloadWithDefaults);
  const mark = await Mark.create({
    ...preparedMark,
    studentId: toObjectId(req.body.studentId),
    teacherId: toObjectId(req.body.teacherId),
    classTeacherId: toObjectId(req.body.classTeacherId),
    subjectTeacherId: toObjectId(req.body.subjectTeacherId || req.body.teacherId),
    grade: req.body.grade || ''
  });
  await captureAudit('create', 'marks', mark, preparedMark, req.user);

  const populated = await Mark.findById(mark._id)
    .populate('studentId', 'firstName lastName admissionNo className section academicYear')
    .populate('classTeacherId', 'name')
    .populate('subjectTeacherId', 'name')
    .populate('teacherId', 'name')
    .lean();

  res.status(201).json({
    ...serialize(populated),
    studentId: populated.studentId ? serialize(populated.studentId) : null,
    classTeacherId: populated.classTeacherId ? serialize(populated.classTeacherId) : null,
    subjectTeacherId: populated.subjectTeacherId ? serialize(populated.subjectTeacherId) : null,
    teacherId: populated.teacherId ? serialize(populated.teacherId) : null,
    className: populated.className || populated.studentId?.className || '',
    academicYear: populated.academicYear || populated.studentId?.academicYear || '2024-2025',
    studentName: populated.studentId ? `${populated.studentId.firstName || ''} ${populated.studentId.lastName || ''}`.trim() : '',
    classTeacherName: populated.classTeacherId ? populated.classTeacherId.name : '',
    subjectTeacherName: populated.subjectTeacherId ? populated.subjectTeacherId.name : populated.teacherId ? populated.teacherId.name : ''
  });
};

const updateMark = async (req, res) => {
  const preparedMark = prepareMark(req.body);
  const mark = await Mark.findByIdAndUpdate(
    req.params.id,
    {
      ...preparedMark,
      studentId: toObjectId(req.body.studentId),
      classTeacherId: toObjectId(req.body.classTeacherId),
      subjectTeacherId: toObjectId(req.body.subjectTeacherId || req.body.teacherId),
      grade: req.body.grade || ''
    },
    { new: true }
  )
    .populate('studentId', 'firstName lastName admissionNo className section academicYear')
    .populate('classTeacherId', 'name')
    .populate('subjectTeacherId', 'name')
    .populate('teacherId', 'name')
    .lean();

  if (!mark) return res.status(404).json({ error: 'Mark not found' });
  await captureAudit('update', 'marks', mark, preparedMark, req.user);

  res.json({
    ...serialize(mark),
    studentId: mark.studentId ? serialize(mark.studentId) : null,
    classTeacherId: mark.classTeacherId ? serialize(mark.classTeacherId) : null,
    subjectTeacherId: mark.subjectTeacherId ? serialize(mark.subjectTeacherId) : null,
    teacherId: mark.teacherId ? serialize(mark.teacherId) : null,
    className: mark.className || mark.studentId?.className || '',
    academicYear: mark.academicYear || mark.studentId?.academicYear || '2024-2025',
    studentName: mark.studentId ? `${mark.studentId.firstName || ''} ${mark.studentId.lastName || ''}`.trim() : '',
    classTeacherName: mark.classTeacherId ? mark.classTeacherId.name : '',
    subjectTeacherName: mark.subjectTeacherId ? mark.subjectTeacherId.name : mark.teacherId ? mark.teacherId.name : ''
  });
};

const deleteMark = async (req, res) => {
  const mark = await Mark.findByIdAndDelete(req.params.id);
  if (!mark) return res.status(404).json({ error: 'Mark not found' });
  res.json({ success: true, id: req.params.id });
};

module.exports = {
  getMarks,
  createMark,
  updateMark,
  deleteMark
};
