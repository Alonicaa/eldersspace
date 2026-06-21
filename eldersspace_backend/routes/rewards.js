const express = require('express');
const router = express.Router();
const {
  dailyCheckin,
  startSession,
  endSession,
  sessionHeartbeat,
  getRewardSummary,
  getAvailableRewards,
  redeemReward,
  checkAndApplyBonusEvents,
  getRewardSettings,
  getBonusEvents,
  checkProfileCompletion,
  checkPostActivity,
  checkCommentActivity,
  checkShareActivity,
} = require('../controllers/rewardController');

// ล็อคอินรายวัน
router.post('/checkin', dailyCheckin);

// session ใช้งานแอพ
router.post('/session/start', startSession);
router.post('/session/end', endSession);
router.post('/session/heartbeat', sessionHeartbeat);

// ดูสรุปแต้ม
router.get('/summary/:phone', getRewardSummary);

// ดูรางวัลที่ปลดล็อกได้
router.get('/available/:phone', getAvailableRewards);

// แลกรางวัล
router.post('/redeem', redeemReward);

// ดึงข้อมูลการแลกรางวัลล่าสุด
router.get('/redemption-history/:phone/:qrCode', require('../controllers/rewardController').getRedemptionRecord);

// ตรวจสอบ QR code สำหรับร้านค้า
router.post('/verify-qr', require('../controllers/rewardController').verifyQRCode);

// ใช้ QR code เมื่อลูกค้า scan ที่ร้าน
router.post('/use-qr', require('../controllers/rewardController').useQRCode);

// ตรวจสอบและปรับใช้ bonus events
router.get('/check-bonus/:phone', checkAndApplyBonusEvents);

// ดึงการตั้งค่าแต้ม (Public)
router.get('/settings', getRewardSettings);

// ดึงรายการอีเว้นแจกแต้ม (Public)
router.get('/bonus-events', getBonusEvents);

// ====== Activity-Based Rewards ======
// ตรวจสอบ profile completion (+50)
router.post('/check-profile-completion/:phone', checkProfileCompletion);

// ตรวจสอบ post activity (+10)
router.post('/check-post-activity/:phone', checkPostActivity);

// ตรวจสอบ comment activity (+2 per comment, max 5/day)
router.post('/check-comment-activity/:phone', checkCommentActivity);

// ตรวจสอบ share activity (+10 ต่อกิจกรรม 1 ครั้ง)
router.post('/check-share-activity/:phone', checkShareActivity);

// ── Code reports ─────────────────────────────────────────────────────────────
const codeReportCtrl = require('../controllers/codeReportController');
router.post('/report-code', codeReportCtrl.submitReport);
router.get('/my-reports', codeReportCtrl.getUserReports);

module.exports = router;