const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const { getAuditLogs } = require('../controllers/auditController');

router.get('/', requireRole('admin'), getAuditLogs);

module.exports = router;
