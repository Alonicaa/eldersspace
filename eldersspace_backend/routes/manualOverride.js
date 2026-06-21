/**
 * Manual Override Routes
 * API endpoints for manual code override operations
 * Created: May 13, 2026
 */

const express = require('express');
const router = express.Router();
const manualOverrideController = require('../controllers/manualOverrideController');
const { verifyAdminToken } = require('../controllers/authController');

// ─── Admin Token Authentication Middleware ──────────────────────────────────
const adminTokenAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  
  const payload = verifyAdminToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized: invalid admin token' });
  }
  // Set both `req.admin` and `req.user` so controllers expecting either name work
  req.admin = payload;
  // Normalize token payload shape for controllers that expect `req.user.user_id`
  req.user = Object.assign({}, payload, {
    user_id: payload.sub,
    full_name: payload.full_name || payload.fullName || payload.name,
    phone_number: payload.phone_number || payload.phone
  });
  return next();
};

// All routes require authentication
router.use(adminTokenAuth);

// ─── GET ROUTES ──────────────────────────────────────────────────────────────

/**
 * GET /api/admin/promo-codes/:promo_code_id/detail
 * Get full details of a promo code with timeline and audit log
 */
router.get('/promo-codes/:promo_code_id/detail', manualOverrideController.getPromoCodeDetail);

/**
 * GET /api/admin/override/audit-log
 * Query Parameters:
 *   - admin_id: Filter by admin who performed action
 *   - action: Filter by action type (force_redeem, reset_status, etc)
 *   - override_reason: Filter by override reason
 *   - search_code: Search by code value
 *   - date_from: Filter from date (YYYY-MM-DD)
 *   - date_to: Filter to date (YYYY-MM-DD)
 *   - limit: Results per page (default: 100)
 *   - offset: Pagination offset (default: 0)
 */
router.get('/override/audit-log', manualOverrideController.getAuditLog);

/**
 * GET /api/admin/override/audit-log/export
 * Export audit log as CSV or JSON
 * Query Parameters:
 *   - format: 'csv' or 'json' (default: json)
 *   - date_from: From date
 *   - date_to: To date
 *   - admin_id: Filter by admin
 */
router.get('/override/audit-log/export', manualOverrideController.exportAuditLog);

/**
 * GET /api/admin/override/statistics
 * Get override statistics and analytics
 */
router.get('/override/statistics', manualOverrideController.getOverrideStats);

// ─── POST ROUTES (ACTION ROUTES) ──────────────────────────────────────────────

/**
 * POST /api/admin/override/force-redeem
 * Force mark a code as manually redeemed
 * 
 * Body:
 * {
 *   "promo_code_id": 123,
 *   "override_reason": "qr_failed",
 *   "override_reason_custom": "Custom reason if 'other'",
 *   "admin_notes": "Optional notes",
 *   "branch_id": 456,
 *   "branch_name": "Branch Name",
 *   "staff_id": 789,
 *   "staff_name": "Staff Name",
 *   "device_ip": "192.168.1.1",
 *   "user_agent": "Mozilla/5.0..."
 * }
 */
router.post('/override/force-redeem', manualOverrideController.forceRedeemCode);

/**
 * POST /api/admin/override/confirm
 * Confirm code redemption (ยืนยันการใช้งาน) → status = redeemed
 */
router.post('/override/confirm', manualOverrideController.confirmCode);

/**
 * POST /api/admin/override/cancel
 * Cancel a code (ยกเลิกโค้ด) → status = cancelled
 */
router.post('/override/cancel', manualOverrideController.cancelCode);

/**
 * POST /api/admin/override/replace
 * Issue replacement code (ออกโค้ดใหม่แทน) → old=replaced, new=active
 */
router.post('/override/replace', manualOverrideController.replaceCode);

/**
 * POST /api/admin/override/reset-status
 * General status change with audit trail
 * new_status: active | redeemed | expired | cancelled | replaced
 *             (also accepts legacy: ready, manual_redeemed)
 */
router.post('/override/reset-status', manualOverrideController.resetCodeStatus);

module.exports = router;
