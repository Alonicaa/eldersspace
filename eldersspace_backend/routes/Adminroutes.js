const express    = require('express');
const router     = express.Router();
const postCtrl   = require('../controllers/postController');
const adminCtrl  = require('../controllers/adminController');
const cloudCtrl  = require('../controllers/cloudSQLController');
const commentCtrl = require('../controllers/commentController');
const { verifyAdminToken } = require('../controllers/authController');
const upload = require('../config/multerConfig');
 
// ─── Admin Middleware ───────────────────────────────────────────────────────
const adminAuth = (req, res, next) => {
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Admin access only' });
  }
  next();
};

const adminTokenAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  
  console.log('[Admin Auth Middleware]', {
    authHeader: authHeader.substring(0, 30) + '...',
    token: token ? token.substring(0, 30) + '...' : 'NO_TOKEN',
    path: req.path
  });
  
  const payload = verifyAdminToken(token);

  if (!payload) {
    console.log('[Admin Auth] Token verification failed', {
      token: token ? token.substring(0, 30) + '...' : 'NO_TOKEN'
    });
    return res.status(401).json({ error: 'Unauthorized: invalid admin token' });
  }

  console.log('[Admin Auth] Token verified successfully', { role: payload.role, phone: payload.phone_number });
  req.admin = payload;
  return next();
};
 
// ================= DEBUG ENDPOINTS (ไม่ต้องมี Auth) =================
router.get('/test-auth', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  
  console.log('[TEST AUTH]', { token: token ? token.substring(0, 50) : 'NO_TOKEN' });
  
  if (!token) {
    return res.status(400).json({ error: 'No token provided' });
  }
  
  const payload = verifyAdminToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Token verification failed' });
  }
  
  res.json({ 
    message: 'Token valid',
    payload
  });
});

router.get('/test-health', (req, res) => {
  res.json({ 
    message: 'Backend API is running',
    timestamp: new Date().toISOString(),
    apiBase: '/api'
  });
});

// ─── DASHBOARD ROUTES ───────────────────────────────────────────────────────
router.get('/dashboard-summary', adminTokenAuth, adminCtrl.getDashboardSummary);
router.get('/dashboard-data', adminTokenAuth, adminCtrl.getDashboardData);

// ─── POST MANAGEMENT ROUTES ─────────────────────────────────────────────────
// Static paths must come before parameterized /:id routes to avoid shadowing.
router.get('/posts/deleted', adminAuth, postCtrl.getDeletedPosts);
router.get('/posts/reported', adminTokenAuth, cloudCtrl.getReportedPosts);
router.get('/posts/:id/detail', adminTokenAuth, adminCtrl.getPostDetail);
router.post('/posts/:id/moderate', adminTokenAuth, adminCtrl.moderatePost);
router.patch('/posts/:id/move-group', adminTokenAuth, adminCtrl.movePostGroup);
router.post('/posts/:id/restore', adminAuth, postCtrl.restorePost);

// ─── COMMENT MODERATION ROUTES ──────────────────────────────────────────────
router.get('/comments/reported', adminTokenAuth, commentCtrl.getReportedComments);
router.post('/comments/:commentId/moderate', adminTokenAuth, commentCtrl.moderateComment);

// ─── CLOUD SQL ROUTES ────────────────────────────────────────────────────────
// GET /api/admin/users/blocked       → ดึงรายชื่อผู้ใช้ที่ถูกแบน
router.get('/users/blocked', adminTokenAuth, cloudCtrl.getBlockedUsers);

// (posts/reported moved above to avoid /:id shadowing)

// GET /api/admin/campaigns           → ดึงรายชื่อแคมเปญ
router.get('/campaigns', adminTokenAuth, cloudCtrl.getCampaigns);

// ─── USER MANAGEMENT ROUTES ─────────────────────────────────────────────────
router.get('/users/:phone/detail', adminTokenAuth, adminCtrl.getUserDetailByPhone);
router.post('/users/block', adminTokenAuth, adminCtrl.blockUser);
router.post('/users/unblock', adminTokenAuth, adminCtrl.unblockUser);
router.get('/users', adminTokenAuth, adminCtrl.getAllUsers);
router.post('/users/search', adminTokenAuth, adminCtrl.searchUsers);

// ─── REWARD SETTINGS ROUTES ─────────────────────────────────────────────────
router.get('/reward-settings', adminTokenAuth, adminCtrl.getRewardSettings);
router.put('/reward-settings', adminTokenAuth, adminCtrl.updateRewardSettings);

// ─── BONUS EVENTS ROUTES ────────────────────────────────────────────────────
router.get('/bonus-events', adminTokenAuth, adminCtrl.getBonusEvents);
router.post('/bonus-events', adminTokenAuth, adminCtrl.createBonusEvent);
router.put('/bonus-events/:id', adminTokenAuth, adminCtrl.updateBonusEvent);
router.delete('/bonus-events/:id', adminTokenAuth, adminCtrl.deleteBonusEvent);

// ─── POINTS MANAGEMENT ROUTES ───────────────────────────────────────────────
router.post('/update-user-points', adminTokenAuth, adminCtrl.updateUserPoints);
router.get('/user/:userId/points-history', adminTokenAuth, adminCtrl.getUserPointsHistory);
router.get('/point-history', adminTokenAuth, adminCtrl.getPointTransactionHistory);

// ─── REWARD MANAGEMENT ROUTES ───────────────────────────────────────────────
router.get('/rewards', adminTokenAuth, adminCtrl.getAllRewards);
router.get('/rewards/:id', adminTokenAuth, adminCtrl.getRewardDetail);
router.post('/rewards', adminTokenAuth, upload.single('image'), adminCtrl.createReward);
router.put('/rewards/:id', adminTokenAuth, upload.single('image'), adminCtrl.updateReward);
router.delete('/rewards/:id', adminTokenAuth, adminCtrl.deleteReward);
router.get('/rewards-categories', adminTokenAuth, adminCtrl.getRewardCategories);
// ─── PROMO CODES ADMIN ACTIONS ─────────────────────────────────────────────
const promoCodeCtrl = require('../controllers/promoCodeController');

// GET /api/admin/promo-codes   → ดึงรายการโค้ดทั้งหมด (with filters: reward_id, status, search)
router.get('/promo-codes', adminTokenAuth, promoCodeCtrl.getPromoCodes);

// GET /api/admin/promo-codes/stats → สรุปจำนวนโค้ดทั้งหมด/พร้อมใช้/ใช้แล้ว
router.get('/promo-codes/stats', adminTokenAuth, promoCodeCtrl.getPromoStats);

// POST /api/admin/promo-codes/upload-csv → upload promo codes via CSV file
router.post('/promo-codes/upload-csv', adminTokenAuth, upload.uploadCsv.single('file'), promoCodeCtrl.uploadPromoCodesFromCsv);

// Cleanup expired codes (request body: { older_than_days?: number })
router.post('/promo-codes/cleanup-expired', adminTokenAuth, promoCodeCtrl.cleanupExpiredPromoCodes);

// Update promo code status (PATCH)
router.patch('/promo-codes/:id/status', adminTokenAuth, promoCodeCtrl.updatePromoCodeStatus);

// Replace/assign a replacement promo code to a user
router.patch('/promo-codes/:id/replace', adminTokenAuth, promoCodeCtrl.replacePromoCodeForUser);

// ─── CODE REPORTS ROUTES ─────────────────────────────────────────────────────
const codeReportCtrl = require('../controllers/codeReportController');
router.get('/code-reports', adminTokenAuth, codeReportCtrl.adminGetReports);
router.get('/code-reports/:id', adminTokenAuth, codeReportCtrl.adminGetReportDetail);
router.patch('/code-reports/:id/status', adminTokenAuth, codeReportCtrl.adminUpdateReportStatus);

// ─── ARTICLE MANAGEMENT ROUTES ──────────────────────────────────────────────
const articleCtrl = require('../controllers/articleController');
router.get('/articles',               adminTokenAuth, articleCtrl.adminGetAllArticles);
router.get('/articles/:id',           adminTokenAuth, articleCtrl.adminGetArticleById);
router.post('/articles',              adminTokenAuth, articleCtrl.upload, articleCtrl.adminCreateArticle);
router.put('/articles/:id',           adminTokenAuth, articleCtrl.upload, articleCtrl.adminUpdateArticle);
router.patch('/articles/:id/approve', adminTokenAuth, articleCtrl.adminApproveArticle);
router.patch('/articles/:id/reject',  adminTokenAuth, articleCtrl.adminRejectArticle);
router.delete('/articles/:id',        adminTokenAuth, articleCtrl.adminDeleteArticle);

module.exports = router;
