const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const {
  getTeachers,
  createTeacher,
  updateTeacher,
  deleteTeacher
} = require('../controllers/teacherController');

router.get('/', getTeachers);
router.post('/', requireRole('admin'), createTeacher);
router.put('/:id', requireRole('admin'), updateTeacher);
router.delete('/:id', requireRole('admin'), deleteTeacher);

module.exports = router;
