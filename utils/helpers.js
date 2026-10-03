const { normalizeDocument } = require('../db');

const toObjectId = (value) => {
  if (!value) return null;
  if (typeof value === 'object' && value.id) return String(value.id);
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value).trim();
};

const serialize = (doc) => normalizeDocument(doc);

const getNextClass = (className) => {
  if (!className) return '';
  const str = String(className).trim();
  if (/graduated|alumni|passed/i.test(str)) {
    return 'Graduated';
  }
  const match = str.match(/\d+/);
  if (!match) return str;
  const currentNum = parseInt(match[0], 10);
  if (currentNum >= 10) {
    return 'Graduated';
  }
  const nextNum = currentNum + 1;

  const hasOrdinal = new RegExp(`\\b${currentNum}(st|nd|rd|th)\\b`, 'i').test(str);
  if (hasOrdinal) {
    const getOrdinal = (n) => {
      if (n === 1) return '1st';
      if (n === 2) return '2nd';
      if (n === 3) return '3rd';
      return `${n}th`;
    };
    return str.replace(new RegExp(`\\b${currentNum}(st|nd|rd|th)\\b`, 'i'), getOrdinal(nextNum));
  }

  return str.replace(new RegExp(`\\b${currentNum}\\b`), String(nextNum));
};

const getPreviousClass = (className) => {
  if (!className) return '';
  const str = String(className).trim();
  if (/graduated/i.test(str)) return '10th';
  const match = str.match(/\d+/);
  if (!match) return str;
  const currentNum = parseInt(match[0], 10);
  if (currentNum <= 1) return str;
  const prevNum = currentNum - 1;
  const hasOrdinal = new RegExp(`\\b${currentNum}(st|nd|rd|th)\\b`, 'i').test(str);
  if (hasOrdinal) {
    const getOrdinal = (n) => {
      if (n === 1) return '1st';
      if (n === 2) return '2nd';
      if (n === 3) return '3rd';
      return `${n}th`;
    };
    return str.replace(new RegExp(`\\b${currentNum}(st|nd|rd|th)\\b`, 'i'), getOrdinal(prevNum));
  }
  return str.replace(new RegExp(`\\b${currentNum}\\b`), String(prevNum));
};

const getNextAcademicYear = (academicYear) => {
  const currentYearStr = String(academicYear || '').trim();
  const match = currentYearStr.match(/(\d{4})[^\d]+(\d{4})/);
  if (match) {
    const y1 = parseInt(match[1], 10) + 1;
    const y2 = parseInt(match[2], 10) + 1;
    return `${y1}-${y2}`;
  }
  const singleMatch = currentYearStr.match(/\d{4}/);
  if (singleMatch) {
    const y = parseInt(singleMatch[0], 10) + 1;
    return `${y}-${y + 1}`;
  }
  const y = new Date().getFullYear();
  return `${y}-${y + 1}`;
};

const getMarkRule = (className, examType, subject = '') => {
  const classNumber = Number.parseInt(String(className || '').match(/\d+/)?.[0] || '', 10);
  const band = classNumber >= 1 && classNumber <= 5 ? '1-5' : classNumber >= 6 && classNumber <= 8 ? '6-8' : '9-10';
  if (String(examType || '').startsWith('FA')) return { maxScore: 25, convertedMaxScore: band === '6-8' ? 10 : 15 };
  if (String(examType || '').startsWith('SA')) return { maxScore: band === '9-10' && String(subject).toLowerCase() === 'english' ? 100 : band === '9-10' ? 80 : 40, convertedMaxScore: band === '6-8' ? 30 : 20 };
  return { maxScore: 25, convertedMaxScore: 15 };
};

const PART_B_NAMES = ['computer', 'physical education', 'moral science', 'drawing', 'general knowledge'];
const isPartBMark = (m) => m && (m.part === 'Part B' || PART_B_NAMES.includes(String(m.subject || '').trim().toLowerCase()));

const prepareMark = (payload) => {
  const className = payload.className || '';
  const academicYear = payload.academicYear || '2024-2025';
  const examType = payload.examType || 'FA1';
  const rule = getMarkRule(className, examType, payload.subject);
  const isPartB = isPartBMark(payload);
  const maxScore = isPartB ? 0 : Number(payload.maxScore || rule.maxScore);
  const score = isPartB ? 0 : Number(payload.score || 0);
  return {
    ...payload,
    className,
    academicYear,
    part: isPartB ? 'Part B' : (payload.part || 'Part A'),
    examType,
    score,
    maxScore,
    oralScore: isPartB ? 0 : Math.min(Math.max(Number(payload.oralScore || 0), 0), 10),
    convertedScore: isPartB ? 0 : Math.round((score / Math.max(maxScore, 1)) * rule.convertedMaxScore * 100) / 100,
    convertedMaxScore: isPartB ? 0 : rule.convertedMaxScore
  };
};

module.exports = {
  toObjectId,
  serialize,
  getNextClass,
  getPreviousClass,
  getNextAcademicYear,
  getMarkRule,
  PART_B_NAMES,
  isPartBMark,
  prepareMark
};
