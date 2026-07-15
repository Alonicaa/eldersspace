const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/ttsController');

router.post('/synthesize', ctrl.synthesize);

module.exports = router;
