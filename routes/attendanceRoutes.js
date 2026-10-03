const express = require('express');
const router = express.Router();
const {
  getAttendance,
  createAttendance,
  updateAttendance,
  deleteAttendance
} = require('../controllers/attendanceController');

router.get('/', getAttendance);
router.post('/', createAttendance);
router.put('/:id', updateAttendance);
router.delete('/:id', deleteAttendance);

module.exports = router;
