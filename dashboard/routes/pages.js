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

module.exports = router;
