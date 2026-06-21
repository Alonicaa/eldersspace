const express = require('express');
const router = express.Router();
const promoCodeController = require('../controllers/promoCodeController');

// Get promo codes with optional query filters
router.get('/', promoCodeController.getPromoCodes);

// Legacy route: get promo codes by reward_id path
router.get('/:reward_id', (req, res) => {
  req.query.reward_id = req.params.reward_id;
  return promoCodeController.getPromoCodes(req, res);
});

module.exports = router;
