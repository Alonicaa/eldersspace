require('dotenv').config();
const express = require('express');
const cors = require('cors');

const usersRoute = require('./routes/users.js');

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Lightweight request log to verify mobile/web requests reach backend.
app.use((req, res, next) => {
  if (req.path.includes('/auth/request-otp') || req.path.includes('/auth/admin/request-otp')) {
    console.log(`[OTP REQUEST] ${req.method} ${req.path} body=${JSON.stringify(req.body || {})}`);
  }
  next();
});

app.get('/health', (req, res) => {
  res.json({ ok: true, message: 'backend alive' });
});

app.use('/api/users', usersRoute);
const pool = require('./config/db');

const authRoute = require('./routes/auth');
app.use('/api/auth', authRoute);

const postsRoute = require('./routes/posts');
app.use('/api/posts', postsRoute);

const commentsRoute = require('./routes/comments');
app.use('/api/comments', commentsRoute);

const notificationRoute = require('./routes/notifications');
app.use('/api/notifications', notificationRoute);

const rewardsRoute = require('./routes/rewards');
app.use('/api/rewards', rewardsRoute);

const redemptionRoute = require('./routes/redemptionRoutes');
app.use('/api', redemptionRoute);

const adminRoute = require('./routes/Adminroutes');
app.use('/api/admin', adminRoute);

const promoCodesRoute = require('./routes/promoCodes');
app.use('/api/admin/promo-codes', promoCodesRoute);

const manualOverrideRoute = require('./routes/manualOverride');
app.use('/api/admin', manualOverrideRoute);

const groupsRoute = require('./routes/groups');
app.use('/api/groups', groupsRoute);

const partnersRoute = require('./routes/partners');
app.use('/api/partners', partnersRoute);

const bannersRoute = require('./routes/banners');
app.use('/api/banners', bannersRoute);

const articlesRoute = require('./routes/articles');
app.use('/api/articles', articlesRoute);

const adsRoute = require('./routes/ads');
app.use('/api/ads', adsRoute);

const admin = require('firebase-admin');
const serviceAccount = require('./eldersspace-firebase-adminsdk-fbsvc-59c5738b8d.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

app.use('/uploads/partners', express.static('uploads/partners'));
app.use('/uploads/banners',  express.static('uploads/banners'));
app.use('/uploads/ads',      express.static('uploads/ads'));

app.use('/uploads', express.static('uploads'));

pool.connect()
  .then(conn => {
    console.log("Database connected successfully");
    conn.release();
  })
  .catch(err => {
    console.error("Database connection failed:", err);
  });
app.listen(3000, '0.0.0.0', () => {
  console.log('Server running on http://0.0.0.0:3000 - accessible from any IP');
});