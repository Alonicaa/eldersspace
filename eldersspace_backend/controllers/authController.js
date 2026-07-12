const pool = require('../config/db');
const crypto = require('crypto');
const smsService = require('../services/smsService');
const {
  ensureSecurityLogsTable,
  logSecurityEvent,
  SECURITY_EVENT_TYPES
} = require('../services/securityLogService');

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function getAdminAuthSecret() {
  return process.env.ADMIN_AUTH_SECRET || 'eldersspace-admin-secret-change-me';
}

async function tableHasColumn(conn, tableName, columnName) {
  const { rows } = await conn.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = $1
       AND column_name = $2`,
    [tableName, columnName]
  );

  return Number(rows[0]?.total || 0) > 0;
}

function buildAdminToken(payload) {
  console.log('[buildAdminToken] Creating token with payload:', {
    sub: payload.sub,
    role: payload.role,
    phone_number: payload.phone_number,
    exp: payload.exp,
    secret: getAdminAuthSecret()
  });

  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', getAdminAuthSecret())
    .update(payloadEncoded)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const token = `${payloadEncoded}.${signature}`;
  console.log('[buildAdminToken] Token created:', token.substring(0, 50) + '...');
  return token;
}

function verifyAdminToken(token) {
  console.log('[verifyAdminToken] Input token:', token ? token.substring(0, 50) + '...' : 'NO_TOKEN');

  if (!token || typeof token !== 'string' || !token.includes('.')) {
    console.log('[verifyAdminToken] Format check failed', {
      hasToken: !!token,
      isString: typeof token === 'string',
      hasDot: token ? token.includes('.') : false
    });
    return null;
  }

  const [payloadEncoded, providedSignature] = token.split('.');
  const expectedSignature = crypto
    .createHmac('sha256', getAdminAuthSecret())
    .update(payloadEncoded)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  console.log('[verifyAdminToken] Signature check', {
    provided: providedSignature.substring(0, 20) + '...',
    expected: expectedSignature.substring(0, 20) + '...',
    match: providedSignature === expectedSignature
  });

  if (providedSignature !== expectedSignature) {
    console.log('[verifyAdminToken] Signature mismatch!');
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadEncoded));
    console.log('[verifyAdminToken] Payload decoded', {
      hasPayload: !!payload,
      role: payload?.role,
      exp: payload?.exp,
      now: Date.now(),
      isExpired: payload?.exp ? Number(payload.exp) < Date.now() : 'no-exp'
    });

    if (!payload || payload.role !== 'admin') {
      console.log('[verifyAdminToken] Role check failed');
      return null;
    }

    if (!payload.exp || Number(payload.exp) < Date.now()) {
      console.log('[verifyAdminToken] Token expired');
      return null;
    }

    console.log('[verifyAdminToken] ✅ Token valid!');
    return payload;
  } catch (error) {
    console.log('[verifyAdminToken] Decode error:', error.message);
    return null;
  }
}

exports.verifyAdminToken = verifyAdminToken;

async function getAdminByPhone(conn, phoneNumber) {
  const { rows: users } = await conn.query(
    `SELECT user_id, full_name, phone_number, role
     FROM users
     WHERE phone_number = $1
     LIMIT 1`,
    [phoneNumber]
  );

  if (!users.length) {
    console.log(`[DEBUG] Admin not found for phone: ${phoneNumber}`);
    return null;
  }

  const user = users[0];
  const userRole = String(user.role || '').toLowerCase().trim();

  console.log(`[DEBUG] Found user with phone ${phoneNumber}, role: "${userRole}" (raw: "${user.role}")`);

  if (userRole !== 'admin') {
    console.log(`[DEBUG] User role is not admin: "${userRole}"`);
    return null;
  }

  return user;
}

function buildAdminLoginResponse(user) {
  const tokenPayload = {
    sub: Number(user.user_id),
    phone_number: user.phone_number,
    full_name: user.full_name || 'Admin',
    role: 'admin',
    exp: Date.now() + (8 * 60 * 60 * 1000)
  };

  console.log('[buildAdminLoginResponse] Building response for:', {
    user_id: user.user_id,
    phone_number: user.phone_number,
    full_name: user.full_name,
    exp_time: new Date(tokenPayload.exp).toISOString()
  });

  const token = buildAdminToken(tokenPayload);

  return {
    token,
    admin: {
      user_id: Number(user.user_id),
      full_name: user.full_name || 'Admin',
      phone_number: user.phone_number,
      role: 'admin'
    }
  };
}

exports.requestAdminOtp = async (req, res) => {
  const { phone_number } = req.body;
  console.log(`[DEBUG] requestAdminOtp called with phone: ${phone_number}`);

  if (!phone_number) {
    console.log(`[DEBUG] Missing phone_number in request body`);
    return res.status(400).json({ error: 'phone_number is required' });
  }

  const conn = await pool.connect();
  try {
    await ensureSecurityLogsTable(conn);
    const admin = await getAdminByPhone(conn, phone_number);

    if (!admin) {
      console.log(`[DEBUG] Admin lookup failed for phone: ${phone_number}`);
      await logSecurityEvent(conn, {
        eventType: SECURITY_EVENT_TYPES.ADMIN_OTP_FAILED,
        actorName: phone_number,
        actorPhone: phone_number,
        detail: 'Admin account not found or role mismatch',
        req
      });
      conn.release();
      return res.status(403).json({ error: 'Forbidden: admin role required' });
    }

    console.log(`[DEBUG] Admin found, generating OTP for user_id: ${admin.user_id}`);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await conn.query(
      `INSERT INTO otp_verification (user_id, otp_code, expired_at)
       VALUES ($1, $2, NOW() + INTERVAL '5 minutes')`,
      [admin.user_id, otp]
    );

    await logSecurityEvent(conn, {
      eventType: SECURITY_EVENT_TYPES.ADMIN_OTP_REQUEST,
      actorName: admin.full_name || 'Admin',
      actorPhone: admin.phone_number,
      detail: 'Admin OTP requested',
      req
    });

    conn.release();

    // Send OTP via SMS
    const smsResult = await smsService.sendOtp(phone_number, otp);

    if (smsResult.success) {
      const response = {
        message: 'Admin OTP sent via SMS',
        phone_number,
        isDevelopment: smsResult.isDevelopment
      };

      if (smsResult.isDevelopment && process.env.NODE_ENV !== 'production') {
        response.otp = otp;
        console.log(`[DEBUG] OTP sent in development mode: ${otp}`);
      }

      return res.json(response);
    } else {
      console.log(`[DEBUG] SMS sending failed: ${smsResult.error}`);
      return res.status(500).json({
        error: 'Failed to send OTP via SMS',
        details: smsResult.error
      });
    }
  } catch (err) {
    console.error(`[ERROR] requestAdminOtp error:`, err);
    conn.release();
    return res.status(500).json({ error: err.message });
  }
};

exports.verifyAdminOtp = async (req, res) => {
  const { phone_number, otp_code } = req.body;
  if (!phone_number || !otp_code) {
    return res.status(400).json({ error: 'phone_number and otp_code are required' });
  }

  const conn = await pool.connect();
  try {
    await ensureSecurityLogsTable(conn);
    const admin = await getAdminByPhone(conn, phone_number);
    if (!admin) {
      await logSecurityEvent(conn, {
        eventType: SECURITY_EVENT_TYPES.ADMIN_OTP_FAILED,
        actorName: phone_number,
        actorPhone: phone_number,
        detail: 'Admin account not found or role mismatch',
        req
      });
      conn.release();
      return res.status(403).json({ error: 'Forbidden: admin role required' });
    }

    const { rows: otpRows } = await conn.query(
      `SELECT otp_id
       FROM otp_verification
       WHERE user_id = $1
         AND otp_code = $2
         AND expired_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [admin.user_id, otp_code]
    );

    if (!otpRows.length) {
      await logSecurityEvent(conn, {
        eventType: SECURITY_EVENT_TYPES.ADMIN_OTP_FAILED,
        actorName: admin.full_name || 'Admin',
        actorPhone: admin.phone_number,
        detail: 'Invalid or expired admin OTP',
        req
      });
      conn.release();
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    await conn.query('UPDATE users SET last_login_at = NOW() WHERE user_id = $1', [admin.user_id]);

    const hasOtpVerified = await tableHasColumn(conn, 'otp_verification', 'is_verified');
    if (hasOtpVerified) {
      await conn.query('UPDATE otp_verification SET is_verified = 1 WHERE otp_id = $1', [otpRows[0].otp_id]);
    }

    conn.release();

    const auth = buildAdminLoginResponse(admin);
    await logSecurityEvent(conn, {
      eventType: SECURITY_EVENT_TYPES.ADMIN_OTP_SUCCESS,
      actorName: admin.full_name || 'Admin',
      actorPhone: admin.phone_number,
      detail: 'Admin OTP verified successfully',
      req
    });
    return res.json({
      message: 'Admin OTP verified',
      ...auth
    });
  } catch (err) {
    conn.release();
    return res.status(500).json({ error: err.message });
  }
};

// ขอ OTP
exports.requestOtp = async (req, res) => {
  const { phone_number } = req.body;

  if (!phone_number) {
    return res.status(400).json({ error: "phone_number is required" });
  }

  console.log("Request OTP for:", phone_number);

  try {
    const conn = await pool.connect();
    await ensureSecurityLogsTable(conn);

    const { rows: user } = await conn.query(
      "SELECT * FROM users WHERE phone_number = $1",
      [phone_number]
    );

    if (user.length === 0) {
      await conn.query(
        "INSERT INTO users (phone_number, role, is_verified) VALUES ($1, $2, $3)",
        [phone_number, 'elder', 0]
      );
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await conn.query(
      `INSERT INTO otp_verification (user_id, otp_code, expired_at)
       VALUES ((SELECT user_id FROM users WHERE phone_number = $1), $2, NOW() + INTERVAL '5 minutes')`,
      [phone_number, otp]
    );

    const { rows: userRows } = await conn.query(
      'SELECT user_id, full_name, phone_number FROM users WHERE phone_number = $1 LIMIT 1',
      [phone_number]
    );

    await logSecurityEvent(conn, {
      eventType: SECURITY_EVENT_TYPES.USER_OTP_REQUEST,
      actorName: userRows[0]?.full_name || phone_number,
      actorPhone: phone_number,
      detail: 'User OTP requested',
      req
    });

    conn.release();

    // Send OTP via SMS instead of returning in response
    const smsResult = await smsService.sendOtp(phone_number, otp);

    if (smsResult.success) {
      const response = {
        message: "OTP sent via SMS",
        isDevelopment: smsResult.isDevelopment
      };

      if (smsResult.isDevelopment && process.env.NODE_ENV !== 'production') {
        response.otp = otp;
      }

      res.json(response);
      console.log("OTP sent successfully for:", phone_number);
    } else {
      res.status(500).json({
        error: 'Failed to send OTP via SMS',
        details: smsResult.error
      });
      console.error("Failed to send OTP:", smsResult.error);
    }
  } catch (err) {
    console.error("Error in requestOtp:", err);
    res.status(500).json({ error: err.message });
  }
};
exports.getUserByPhone = async (req, res) => {
  const { phone } = req.params;

  try {
    const conn = await pool.connect();

    const { rows: user } = await conn.query(
      "SELECT full_name FROM users WHERE phone_number = $1",
      [phone]
    );

    conn.release();

    if (user.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ full_name: user[0].full_name });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
exports.getUserProfile = async (req, res) => {
  const { phone } = req.params;

  try {
    const conn = await pool.connect();

    const { rows: user } = await conn.query(
      `SELECT u.user_id, u.full_name, u.profile_picture, u.about_me, p.address, p.interests,
        (SELECT COUNT(*) FROM followers WHERE following_id = u.user_id) as followers,
        (SELECT COUNT(*) FROM followers WHERE follower_id  = u.user_id) as following
       FROM users u
       LEFT JOIN profiles p ON u.user_id = p.user_id
       WHERE u.phone_number = $1`,
      [phone]
    );

    conn.release();

    if (user.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const u = user[0];
    res.json({
      ...u,
      followers: Number(u.followers),
      following:  Number(u.following),
      profile_picture_url: (() => {
        if (!u.profile_picture) return null;
        if (/^https?:\/\//i.test(u.profile_picture)) return u.profile_picture;
        const clean = u.profile_picture.replace(/\\/g, '/').replace(/^\/?(uploads\/)?/, '');
        const supabaseBase = process.env.SUPABASE_URL
          ? `${process.env.SUPABASE_URL}/storage/v1/object/public/uploads`
          : null;
        if (supabaseBase) return `${supabaseBase}/${clean}`;
        return `${process.env.BACKEND_URL || 'http://10.0.2.2:3000'}/uploads/${clean}`;
      })(),
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ตรวจ OTP
exports.verifyOtp = async (req, res) => {
  const { phone_number, otp_code } = req.body;

  if (!phone_number || !otp_code) {
    return res.status(400).json({ error: "phone_number and otp_code are required" });
  }

  try {
    const conn = await pool.connect();
    await ensureSecurityLogsTable(conn);

    const { rows: user } = await conn.query(
      "SELECT * FROM users WHERE phone_number = $1",
      [phone_number]
    );

    if (user.length === 0) {
      await logSecurityEvent(conn, {
        eventType: SECURITY_EVENT_TYPES.USER_OTP_FAILED,
        actorName: phone_number,
        actorPhone: phone_number,
        detail: 'User not found while verifying OTP',
        req
      });
      conn.release();
      return res.status(400).json({ error: "User not found" });
    }

    const { rows: otp } = await conn.query(
      `SELECT * FROM otp_verification
       WHERE user_id = $1
       AND otp_code = $2
       AND expired_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [user[0].user_id, otp_code]
    );

    if (otp.length === 0) {
      await logSecurityEvent(conn, {
        eventType: SECURITY_EVENT_TYPES.USER_OTP_FAILED,
        actorName: user[0].full_name || phone_number,
        actorPhone: phone_number,
        detail: 'Invalid or expired OTP',
        req
      });
      conn.release();
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    // ✅ อัปเดต user เป็น verified
    await conn.query(
      "UPDATE users SET is_verified = 1, last_login_at = NOW() WHERE user_id = $1",
      [user[0].user_id]
    );

    // ✅ mark otp ว่าใช้แล้ว
    await conn.query(
      "UPDATE otp_verification SET is_verified = 1 WHERE otp_id = $1",
      [otp[0].otp_id]
    );

    const needsName = !user[0].full_name;

    await logSecurityEvent(conn, {
      eventType: SECURITY_EVENT_TYPES.USER_OTP_SUCCESS,
      actorName: user[0].full_name || phone_number,
      actorPhone: phone_number,
      detail: 'OTP verified successfully',
      req
    });

    conn.release();

    res.json({
      message: "OTP verified",
      needs_name: needsName,
      phone_number: phone_number
    });

  } catch (err) {
    console.error("Error in verifyOtp:", err);
    res.status(500).json({ error: err.message });
  }
};


// ตั้งชื่อ
exports.setName = async (req, res) => {
  const { phone_number, full_name } = req.body;

  try {
    const conn = await pool.connect();

    await conn.query(
      "UPDATE users SET full_name = $1 WHERE phone_number = $2",
      [full_name, phone_number]
    );

    conn.release();

    res.json({ message: "Name set successfully" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Admin login (phone + password) and role verification
exports.adminLogin = async (req, res) => {
  const { phone_number, password } = req.body;

  if (!phone_number || !password) {
    return res.status(400).json({ error: 'phone_number and password are required' });
  }

  try {
    const conn = await pool.connect();
    await ensureSecurityLogsTable(conn);
    const hasPasswordColumn = await tableHasColumn(conn, 'users', 'password');

    const { rows: users } = hasPasswordColumn
      ? await conn.query(
        `SELECT user_id, full_name, phone_number, role, password
         FROM users
         WHERE phone_number = $1
         LIMIT 1`,
        [phone_number]
      )
      : await conn.query(
        `SELECT user_id, full_name, phone_number, role
         FROM users
         WHERE phone_number = $1
         LIMIT 1`,
        [phone_number]
      );

    if (!users.length) {
      await logSecurityEvent(conn, {
        eventType: SECURITY_EVENT_TYPES.ADMIN_LOGIN_FAILED,
        actorName: phone_number,
        actorPhone: phone_number,
        detail: 'Admin credentials not found',
        req
      });
      conn.release();
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    if (hasPasswordColumn) {
      if (String(user.password || '') !== String(password)) {
        await logSecurityEvent(conn, {
          eventType: SECURITY_EVENT_TYPES.ADMIN_LOGIN_FAILED,
          actorName: user.full_name || phone_number,
          actorPhone: phone_number,
          detail: 'Invalid admin password',
          req
        });
        conn.release();
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    } else {
      const adminPin = process.env.ADMIN_LOGIN_PIN || 'admin123';
      if (String(password || '') !== String(adminPin)) {
        await logSecurityEvent(conn, {
          eventType: SECURITY_EVENT_TYPES.ADMIN_LOGIN_FAILED,
          actorName: user.full_name || phone_number,
          actorPhone: phone_number,
          detail: 'Invalid admin PIN',
          req
        });
        conn.release();
        return res.status(401).json({ error: 'Invalid admin PIN' });
      }
    }

    if (String(user.role || '').toLowerCase() !== 'admin') {
      await logSecurityEvent(conn, {
        eventType: SECURITY_EVENT_TYPES.ADMIN_LOGIN_FAILED,
        actorName: user.full_name || phone_number,
        actorPhone: phone_number,
        detail: 'Role is not admin',
        req
      });
      conn.release();
      return res.status(403).json({ error: 'Forbidden: admin role required' });
    }

    await conn.query('UPDATE users SET last_login_at = NOW() WHERE user_id = $1', [user.user_id]);
    await logSecurityEvent(conn, {
      eventType: SECURITY_EVENT_TYPES.ADMIN_LOGIN_SUCCESS,
      actorName: user.full_name || 'Admin',
      actorPhone: user.phone_number,
      detail: 'Admin login success',
      req
    });
    conn.release();

    const auth = buildAdminLoginResponse(user);

    return res.json({
      message: 'Admin login success',
      ...auth
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
