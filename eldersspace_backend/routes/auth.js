const express = require('express');
const router = express.Router();
const {
	requestOtp,
	verifyOtp,
	setName,
	getUserByPhone,
	getUserProfile,
	adminLogin,
	requestAdminOtp,
	verifyAdminOtp,
} = require('../controllers/authController');

router.post('/request-otp', requestOtp);
router.post('/verify-otp', verifyOtp);
router.post('/set-name', setName);
router.post('/admin-login', adminLogin);
router.post('/admin/request-otp', requestAdminOtp);
router.post('/admin/verify-otp', verifyAdminOtp);
router.get('/user/:phone', getUserByPhone);
router.get('/profile/:phone', getUserProfile);

module.exports = router;
