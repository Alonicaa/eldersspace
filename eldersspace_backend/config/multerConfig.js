const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ─── Image Upload ───────────────────────────────────────────────────────────

const rewardsUploadsDir = path.join(__dirname, '../uploads/rewards');
if (!fs.existsSync(rewardsUploadsDir)) {
  fs.mkdirSync(rewardsUploadsDir, { recursive: true });
}

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, rewardsUploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

const imageFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${allowedMimes.join(', ')}`), false);
  }
};

const upload = multer({
  storage: imageStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// ─── CSV Upload ─────────────────────────────────────────────────────────────

const csvUploadsDir = path.join(__dirname, '../uploads/promo_csv');
if (!fs.existsSync(csvUploadsDir)) {
  fs.mkdirSync(csvUploadsDir, { recursive: true });
}

const csvStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, csvUploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `promo-codes-${uniqueSuffix}.csv`);
  }
});

const csvFilter = (req, file, cb) => {
  const allowedMimes = [
    'text/csv',
    'text/plain',
    'application/csv',
    'application/vnd.ms-excel',
    'text/x-csv',
  ];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedMimes.includes(file.mimetype) || ext === '.csv') {
    cb(null, true);
  } else {
    cb(new Error('กรุณาอัพโหลดเฉพาะไฟล์ .csv เท่านั้น'), false);
  }
};

const uploadCsv = multer({
  storage: csvStorage,
  fileFilter: csvFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

module.exports = upload;
module.exports = Object.assign(upload, { uploadCsv });
