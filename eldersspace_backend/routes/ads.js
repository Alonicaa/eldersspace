const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const ctrl    = require('../controllers/adController');

const adsDir = path.join(__dirname, '../uploads/ads');
if (!fs.existsSync(adsDir)) fs.mkdirSync(adsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, adsDir),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Static routes (must be before /:id pattern)
router.get('/admin/all',     ctrl.getAdsAdmin);
router.post('/push',         ctrl.sendPushNotification);
router.post('/fcm-token',    ctrl.registerFcmToken);

// Public
router.get('/', ctrl.getAds);

// Tracking
router.post('/:id/view',    ctrl.trackView);
router.post('/:id/click',   ctrl.trackClick);
router.post('/:id/dismiss', ctrl.trackDismiss);

// Admin CRUD
router.post('/',    upload.single('image'), ctrl.createAd);
router.put('/:id',  upload.single('image'), ctrl.updateAd);
router.delete('/:id', ctrl.deleteAd);

module.exports = router;
