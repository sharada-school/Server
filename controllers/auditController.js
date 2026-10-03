const { AuditLog } = require('../db');
const { serialize } = require('../utils/helpers');

const getAuditLogs = async (_, res) => {
  const logs = await AuditLog.find({}).sort({ createdAt: -1 }).lean();
  res.json(logs.map((log) => serialize(log)));
};

module.exports = {
  getAuditLogs
};
