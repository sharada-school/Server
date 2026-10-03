const { AuditLog } = require('../db');

const captureAudit = async (action, entity, record, values, actor) => {
  try {
    await AuditLog.create({
      action,
      entity,
      recordId: record?._id?.toString() || record?.id || '',
      actorName: actor?.name || '',
      actorEmail: actor?.email || '',
      actorRole: actor?.role || '',
      values
    });
  } catch (error) {
    console.error('Audit log failed:', error.message);
  }
};

module.exports = { captureAudit };
