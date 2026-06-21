const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ctrl = require('../controllers/partnerController');

const bannersDir = path.join(__dirname, '../uploads/banners');
if (!fs.existsSync(bannersDir)) fs.mkdirSync(bannersDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, bannersDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Static paths before /:id
router.get('/admin/all', ctrl.getAllBannersAdmin);

// Public — GET banners (optionally ?type=benefits|announcement|special_offer|sponsor|general)
router.get('/', ctrl.getHomeBanners);

// Tracking (fire-and-forget, no auth needed)
router.post('/:id/view',  ctrl.trackBannerView);
router.post('/:id/click', ctrl.trackBannerClick);

// Admin CRUD
router.post('/',    upload.single('image'), ctrl.createBanner);
router.put('/:id',  upload.single('image'), ctrl.updateBanner);
router.delete('/:id', ctrl.deleteBanner);

module.exports = router;
