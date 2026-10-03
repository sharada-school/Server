const express = require('express');
const router = express.Router();
const {
  login,
  registerRequest,
  registerVerify,
  passwordResetRequest,
  passwordResetVerify,
  passwordResetComplete
} = require('../controllers/authController');

router.post('/login', login);
router.post('/register/request', registerRequest);
router.post('/register/verify', registerVerify);
router.post('/password-reset/request', passwordResetRequest);
router.post('/password-reset/verify', passwordResetVerify);
router.post('/password-reset/complete', passwordResetComplete);

module.exports = router;
