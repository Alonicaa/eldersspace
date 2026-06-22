const pool = require('../config/db');
const { uploadToStorage } = require('../config/supabaseStorage');

// Firebase Admin — initialized lazily from FIREBASE_SERVICE_ACCOUNT_JSON env var
let _firebaseAdmin = null;
function getFirebase() {
  if (_firebaseAdmin) return _firebaseAdmin;
  try {
    const fa  = require('firebase-admin');
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (raw && !fa.apps.length) {
      fa.initializeApp({ credential: fa.credential.cert(JSON.parse(raw)) });
    }
    _firebaseAdmin = fa.apps.length ? fa : null;
  } catch (e) {
    console.warn('[FCM] firebase-admin not available:', e.message);
  }
  return _firebaseAdmin;
}

// Helper: build pg numbered placeholders for dynamic UPDATE
function buildUpdateSet(updates) {
  const keys = Object.keys(updates);
  const values = Object.values(updates);
  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  return { setClause, values };
}

// ── Public: get active ads by format ──

exports.getAds = async (req, res) => {
  try {
    const { format } = req.query;
    let query = `
      SELECT pa.*, p.name AS partner_name, p.logo_url AS partner_logo
      FROM partner_ads pa
      LEFT JOIN partners p ON p.id = pa.partner_id
      WHERE pa.is_active = 1
        AND (pa.start_date IS NULL OR pa.start_date <= CURRENT_DATE)
        AND (pa.end_date   IS NULL OR pa.end_date   >= CURRENT_DATE)
    `;
    const params = [];
    if (format) {
      params.push(format);
      query += ` AND pa.ad_format = $${params.length}`;
    }
    query += ' ORDER BY pa.created_at DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Admin: get all ads (no date/active filter) ──

exports.getAdsAdmin = async (req, res) => {
  try {
    const { format, partner_id } = req.query;
    let query = `
      SELECT pa.*, p.name AS partner_name
      FROM partner_ads pa
      LEFT JOIN partners p ON p.id = pa.partner_id
      WHERE 1=1
    `;
    const params = [];
    if (format)     { params.push(format);     query += ` AND pa.ad_format = $${params.length}`; }
    if (partner_id) { params.push(partner_id); query += ` AND pa.partner_id = $${params.length}`; }
    query += ' ORDER BY pa.created_at DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Tracking ──

exports.trackView = async (req, res) => {
  try {
    await pool.query('UPDATE partner_ads SET view_count = view_count + 1 WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.trackClick = async (req, res) => {
  try {
    await pool.query('UPDATE partner_ads SET click_count = click_count + 1 WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.trackDismiss = async (req, res) => {
  try {
    await pool.query('UPDATE partner_ads SET dismiss_count = dismiss_count + 1 WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Admin CRUD ──

exports.createAd = async (req, res) => {
  try {
    const {
      partner_id, ad_format, title, body,
      cta_text, link_url, display_delay_seconds,
      start_date, end_date,
    } = req.body;
    let image_url = null;
    if (req.file) image_url = await uploadToStorage(req.file.buffer, req.file.originalname, req.file.mimetype, 'ads');

    const { rows: result } = await pool.query(
      `INSERT INTO partner_ads
         (partner_id, ad_format, title, body, image_url, cta_text, link_url, display_delay_seconds, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        partner_id, ad_format, title,
        body || null, image_url,
        cta_text || 'ดูเพิ่มเติม',
        link_url || null,
        display_delay_seconds || 0,
        start_date || null, end_date || null,
      ]
    );
    res.status(201).json({ id: result[0].id, message: 'Ad created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateAd = async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = [
      'partner_id','ad_format','title','body','cta_text',
      'link_url','display_delay_seconds','is_active','start_date','end_date',
    ];
    const updates = {};
    for (const f of allowed) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }
    if (req.file) updates.image_url = await uploadToStorage(req.file.buffer, req.file.originalname, req.file.mimetype, 'ads');
    if (Object.keys(updates).length === 0) return res.json({ message: 'No changes' });

    const { setClause, values } = buildUpdateSet(updates);
    await pool.query(`UPDATE partner_ads SET ${setClause} WHERE id = $${values.length + 1}`, [...values, id]);
    res.json({ message: 'Ad updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteAd = async (req, res) => {
  try {
    await pool.query('UPDATE partner_ads SET is_active = 0 WHERE id = $1', [req.params.id]);
    res.json({ message: 'Ad deactivated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── FCM device token registration ──

exports.registerFcmToken = async (req, res) => {
  try {
    const { phone, fcm_token } = req.body;
    if (!phone || !fcm_token) return res.status(400).json({ error: 'phone and fcm_token required' });

    await pool.query('UPDATE users SET fcm_token = $1 WHERE phone_number = $2', [fcm_token, phone]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Admin: send FCM push for a notification-format ad ──

exports.sendPushNotification = async (req, res) => {
  try {
    const { ad_id } = req.body;
    if (!ad_id) return res.status(400).json({ error: 'ad_id required' });

    const { rows: adRows } = await pool.query(
      `SELECT pa.*, p.name AS partner_name
       FROM partner_ads pa
       LEFT JOIN partners p ON p.id = pa.partner_id
       WHERE pa.id = $1 AND pa.is_active = 1 AND pa.ad_format = 'notification'`,
      [ad_id]
    );
    const ad = adRows[0];
    if (!ad) return res.status(404).json({ error: 'Ad not found or not notification format' });

    const fa = getFirebase();
    if (!fa) {
      return res.status(503).json({
        error: 'Firebase not configured. Install firebase-admin and set FIREBASE_SERVICE_ACCOUNT_JSON in .env',
      });
    }

    const { rows: users } = await pool.query(
      "SELECT fcm_token FROM users WHERE fcm_token IS NOT NULL AND fcm_token != ''"
    );
    const tokens = users.map(u => u.fcm_token).filter(Boolean);
    if (tokens.length === 0) return res.json({ sent: 0, message: 'No registered devices' });

    let totalSent = 0;
    const chunkSize = 500;
    for (let i = 0; i < tokens.length; i += chunkSize) {
      const chunk = tokens.slice(i, i + chunkSize);
      const msg = {
        notification: { title: ad.title, body: ad.body || '' },
        data: {
          ad_id:        String(ad.id),
          ad_format:    'notification',
          partner_name: ad.partner_name || '',
          partner_id:   String(ad.partner_id),
        },
        tokens: chunk,
      };
      const response = await fa.messaging().sendEachForMulticast(msg);
      totalSent += response.successCount;
    }

    await pool.query(
      'UPDATE partner_ads SET view_count = view_count + $1 WHERE id = $2',
      [totalSent, ad_id]
    );
    res.json({ sent: totalSent, total_devices: tokens.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
