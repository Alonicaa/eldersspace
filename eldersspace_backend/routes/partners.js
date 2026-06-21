const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ctrl = require('../controllers/partnerController');

const partnersDir = path.join(__dirname, '../uploads/partners');
if (!fs.existsSync(partnersDir)) fs.mkdirSync(partnersDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, partnersDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Static paths must come before /:id to avoid conflicts
router.get('/admin/all',      ctrl.getAllPartnersAdmin);
router.get('/jobs',           ctrl.getPartnerJobs);
router.get('/projects/all',   ctrl.getAllProjects);
router.put('/jobs/:jobId',    ctrl.updateJob);
router.delete('/jobs/:jobId', ctrl.deleteJob);
router.put('/services/:serviceId',    upload.single('image'), ctrl.updateService);
router.delete('/services/:serviceId', ctrl.deleteService);
router.put('/projects/:projectId',    upload.single('image'), ctrl.updateProject);
router.delete('/projects/:projectId', ctrl.deleteProject);

// Public
router.get('/',    ctrl.getAllPartners);
router.get('/:id', ctrl.getPartnerById);

// CRUD
router.post(
  '/',
  upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'cover', maxCount: 1 }]),
  ctrl.createPartner
);
router.put(
  '/:id',
  upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'cover', maxCount: 1 }]),
  ctrl.updatePartner
);
router.delete('/:id', ctrl.deletePartner);

// Jobs & Services under a specific partner
router.get('/:partner_id/services',                    ctrl.getPartnerServices);
router.post('/:partner_id/jobs',                       ctrl.createJob);
router.post('/:partner_id/services', upload.single('image'), ctrl.createService);
router.get('/:partner_id/projects',                    ctrl.getPartnerProjects);
router.post('/:partner_id/projects', upload.single('image'), ctrl.createProject);

module.exports = router;
