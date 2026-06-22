const multer = require('multer');
const path = require('path');
const fs = require('fs');

const imageStorage = multer.memoryStorage();

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
  limits: { fileSize: 5 * 1024 * 1024 }
});

const csvUploadsDir = path.join(__dirname, '../uploads/promo_csv');
if (!fs.existsSync(csvUploadsDir)) {
  fs.mkdirSync(csvUploadsDir, { recursive: true });
}

const csvStorage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, csvUploadsDir); },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `promo-codes-${uniqueSuffix}.csv`);
  }
});

const csvFilter = (req, file, cb) => {
  const allowedMimes = ['text/csv','text/plain','application/csv','application/vnd.ms-excel','text/x-csv'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedMimes.includes(file.mimetype) || ext === '.csv') { cb(null, true); }
  else { cb(new Error('กรุณาอัพโหลดเฉพาะไฟล์ .csv เท่านั้น'), false); }
};

const uploadCsv = multer({ storage: csvStorage, fileFilter: csvFilter, limits: { fileSize: 10 * 1024 * 1024 } });

module.exports = Object.assign(upload, { uploadCsv });
