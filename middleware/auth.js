const crypto = require('crypto');
const { User } = require('../db');

const sessions = new Map();
const passwordResetTokens = new Map();

const createSession = (user) => {
  const token = crypto.randomUUID();
  sessions.set(token, {
    id: user._id.toString(),
    name: user.name,
    email: user.email || '',
    phone: user.phone || '',
    role: user.role || 'teacher'
  });
  return token;
};

const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const session = token ? sessions.get(token) : null;
  if (!session) return res.status(401).json({ error: 'Authentication required' });
  req.user = session;
  next();
};

const requireRole = (role) => (req, res, next) => {
  if (req.user?.role !== role) return res.status(403).json({ error: `${role[0].toUpperCase() + role.slice(1)} access required` });
  next();
};

const requireParentAuth = async (req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  let session = token ? sessions.get(token) : null;

  if (!session && req.headers['x-parent-phone']) {
    const cleanPhone = String(req.headers['x-parent-phone']).replace(/\D/g, '').slice(-10);
    const user = await User.findOne({ phone: cleanPhone, role: 'parent' }).lean();
    if (user) {
      session = { id: user._id.toString(), name: user.name, phone: user.phone, role: 'parent' };
    }
  }

  if (!session) return res.status(401).json({ error: 'Parent authentication required. Please log in with phone number.' });
  req.user = session;
  next();
};

const calculateGrade = (score, maxScore) => {
  const percent = maxScore > 0 ? (score / maxScore) * 100 : 0;
  if (percent >= 90) return 'A+';
  if (percent >= 80) return 'A';
  if (percent >= 70) return 'B+';
  if (percent >= 60) return 'B';
  if (percent >= 50) return 'C+';
  if (percent >= 35) return 'C';
  return 'D';
};

module.exports = {
  sessions,
  passwordResetTokens,
  createSession,
  requireAuth,
  requireRole,
  requireParentAuth,
  calculateGrade
};
