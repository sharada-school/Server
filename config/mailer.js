const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { OtpChallenge } = require('../db');

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

const mailTransport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
});

const hashOtp = (email, purpose, code) =>
  crypto.createHash('sha256').update(`${email}:${purpose}:${code}:${process.env.OTP_SECRET || 'sharada-school-otp'}`).digest('hex');

const sendOtp = async (email, code, purpose) => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM.');
  }
  const subject = purpose === 'registration' ? 'Verify your Sharada School teacher account' : 'Reset your Sharada School password';
  await mailTransport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject,
    text: `Your Sharada School verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`
  });
};

const createOtpChallenge = async (email, purpose, payload = {}) => {
  const code = String(crypto.randomInt(100000, 1000000));
  await OtpChallenge.deleteMany({ email, purpose });
  await OtpChallenge.create({
    email,
    purpose,
    codeHash: hashOtp(email, purpose, code),
    payload,
    expiresAt: new Date(Date.now() + OTP_TTL_MS)
  });
  await sendOtp(email, code, purpose);
};

const consumeOtp = async (email, purpose, code) => {
  const challenge = await OtpChallenge.findOne({ email, purpose });
  if (!challenge || challenge.expiresAt <= new Date()) throw new Error('The OTP is invalid or expired.');
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) throw new Error('Too many invalid OTP attempts. Request a new code.');
  const valid = hashOtp(email, purpose, String(code || '')) === challenge.codeHash;
  if (!valid) {
    await OtpChallenge.updateOne({ _id: challenge._id }, { $inc: { attempts: 1 } });
    throw new Error('The OTP is invalid or expired.');
  }
  await OtpChallenge.deleteOne({ _id: challenge._id });
  return challenge.payload || {};
};

module.exports = {
  mailTransport,
  sendOtp,
  createOtpChallenge,
  consumeOtp,
  OTP_TTL_MS,
  OTP_MAX_ATTEMPTS
};
