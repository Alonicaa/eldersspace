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
const { otpRequestLimiter, otpVerifyLimiter } = require('../middleware/rateLimiter');

router.post('/request-otp', otpRequestLimiter, requestOtp);
router.post('/verify-otp', otpVerifyLimiter, verifyOtp);
router.post('/set-name', setName);
router.post('/admin-login', adminLogin);
router.post('/admin/request-otp', otpRequestLimiter, requestAdminOtp);
router.post('/admin/verify-otp', otpVerifyLimiter, verifyAdminOtp);
router.get('/user/:phone', getUserByPhone);
router.get('/profile/:phone', getUserProfile);

module.exports = router;
