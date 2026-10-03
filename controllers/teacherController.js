const { Teacher } = require('../db');
const { captureAudit } = require('../middleware/audit');
const { serialize } = require('../utils/helpers');

const getTeachers = async (_, res) => {
  const teachers = await Teacher.find({}).sort({ name: 1 }).lean();
  res.json(teachers.map((teacher) => serialize(teacher)));
};

const createTeacher = async (req, res) => {
  const teacher = await Teacher.create(req.body);
  await captureAudit('create', 'teachers', teacher, req.body, req.user);
  res.status(201).json(serialize(teacher));
};

const updateTeacher = async (req, res) => {
  const teacher = await Teacher.findByIdAndUpdate(
    req.params.id,
    {
      ...req.body,
      name: req.body.name || '',
      qualification: req.body.qualification || '',
      designation: req.body.designation || '',
      email: req.body.email || ''
    },
    { new: true }
  );

  if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
  await captureAudit('update', 'teachers', teacher, req.body, req.user);
  res.json(serialize(teacher));
};

const deleteTeacher = async (req, res) => {
  const teacher = await Teacher.findByIdAndDelete(req.params.id);
  if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
  res.json({ success: true, id: req.params.id });
};

module.exports = {
  getTeachers,
  createTeacher,
  updateTeacher,
  deleteTeacher
};
