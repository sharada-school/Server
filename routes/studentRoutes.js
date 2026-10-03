const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const {
  getStudentById,
  createStudent,
  updateStudent,
  promoteStudents
} = require('../controllers/studentController');

router.post('/promote', requireRole('admin'), promoteStudents);
router.get('/:id', getStudentById);
router.post('/', requireRole('admin'), createStudent);
router.put('/:id', requireRole('admin'), updateStudent);

module.exports = router;
