const express = require('express');
const router = express.Router();
const { requireParentAuth } = require('../middleware/auth');
const {
  parentLogin,
  getParentKids,
  getKidAttendance,
  getKidMarks,
  getParentSummary,
  getParentProfile
} = require('../controllers/parentController');

router.post('/login', parentLogin);
router.get('/kids', requireParentAuth, getParentKids);
router.get('/kids/:studentId/attendance', requireParentAuth, getKidAttendance);
router.get('/kids/:studentId/marks', requireParentAuth, getKidMarks);
router.get('/summary', requireParentAuth, getParentSummary);
router.get('/profile', requireParentAuth, getParentProfile);

module.exports = router;
