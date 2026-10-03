const express = require('express');
const router = express.Router();
const {
  getMarks,
  createMark,
  updateMark,
  deleteMark
} = require('../controllers/markController');

router.get('/', getMarks);
router.post('/', createMark);
router.put('/:id', updateMark);
router.delete('/:id', deleteMark);

module.exports = router;
