const rateLimit = require('express-rate-limit');

const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'ขอ OTP บ่อยเกินไป กรุณาลองใหม่ภายหลัง' }
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'ยืนยัน OTP ผิดพลาดหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง' }
});

module.exports = { otpRequestLimiter, otpVerifyLimiter };
