const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('index');
});

router.get('/interactions', (req, res) => {
  res.render('interactions');
});

router.get('/interactions/:id', (req, res) => {
  res.render('review', { id: req.params.id });
});

router.get('/conversations', (req, res) => {
  res.render('conversations');
});

router.get('/conversations/:cid', (req, res) => {
  res.render('conversation', { cid: req.params.cid });
});

router.get('/aichat', (req, res) => {
  res.render('aichat');
});

module.exports = router;
