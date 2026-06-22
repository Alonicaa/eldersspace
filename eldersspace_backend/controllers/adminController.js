const pool = require('../config/db');
const {
  ensureModerationColumns,
  detectViolationHints,
  getUserModerationByPhone
} = require('../services/moderationService');
const {
  ensureSecurityLogsTable,
  logSecurityEvent,
  SECURITY_EVENT_TYPES,
  isLoginEvent,
  isOtpEvent,
  isSecurityEvent,
  formatSecurityEventLabel
} = require('../services/securityLogService');

async function querySingleValue(conn, sql, params = []) {
  const { rows } = await conn.query(sql, params);
  if (!rows || rows.length === 0) return 0;

  const firstRow = rows[0];
  const firstKey = Object.keys(firstRow)[0];
  return Number(firstRow[firstKey] || 0);
}

async function tableHasCreatedAt(conn, tableName) {
  const { rows } = await conn.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = $1
       AND column_name = 'created_at'`,
    [tableName]
  );

  return Number(rows[0].total) > 0;
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

  return Number(rows[0].total) > 0;
}

async function safeQuery(conn, sql, params = []) {
  try {
    const { rows } = await conn.query(sql, params);
    return rows;
  } catch (error) {
    return [];
  }
}

async function ensureRewardColumns(conn) {
  try {
    const { rows: columns } = await conn.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'rewards'`
    );

    const colSet = new Set(columns.map((column) => column.column_name.toLowerCase()));

    if (!colSet.has('required_points') && colSet.has('points_required')) {
      try {
        await conn.query('ALTER TABLE rewards ADD COLUMN required_points INT DEFAULT 0');
        await conn.query('UPDATE rewards SET required_points = points_required WHERE required_points = 0 OR required_points IS NULL');
      } catch (err) {
        if (err.code !== '42701') throw err;
      }
    }

    if (!colSet.has('points_required') && colSet.has('required_points')) {
      try {
        await conn.query('ALTER TABLE rewards ADD COLUMN points_required INT DEFAULT 0');
        await conn.query('UPDATE rewards SET points_required = required_points WHERE points_required = 0 OR points_required IS NULL');
      } catch (err) {
        if (err.code !== '42701') throw err;
      }
    }

    for (const col of ['campaign_start_date', 'campaign_end_date', 'usage_instructions', 'validity_hours', 'partner_id']) {
      if (!colSet.has(col.toLowerCase())) {
        try {
          if (col === 'validity_hours') {
            await conn.query(`ALTER TABLE rewards ADD COLUMN ${col} INT DEFAULT 1`);
          } else if (col === 'usage_instructions') {
            await conn.query(`ALTER TABLE rewards ADD COLUMN ${col} TEXT DEFAULT NULL`);
          } else if (col === 'partner_id') {
            await conn.query(`ALTER TABLE rewards ADD COLUMN ${col} INT DEFAULT NULL`);
          } else {
            await conn.query(`ALTER TABLE rewards ADD COLUMN ${col} TIMESTAMP DEFAULT NULL`);
          }
        } catch (err) {
          if (err.code !== '42701') throw err;
          // Column already exists, ignore
        }
      }
    }
  } catch (error) {
    console.error('Error ensuring reward columns:', error.message);
    // Don't throw, just log - this is a non-critical setup task
  }
}

async function ensureAdminLogsTable(conn) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS admin_logs (
      id BIGSERIAL NOT NULL,
      event VARCHAR(500) NOT NULL,
      "user" VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    )`
  );
}

async function ensurePostModerationLogsTable(conn) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS post_moderation_logs (
      id BIGSERIAL NOT NULL,
      post_id INT NOT NULL,
      admin_actor VARCHAR(255) NOT NULL,
      action VARCHAR(50) NOT NULL,
      reason VARCHAR(255) NULL,
      note TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    )`
  );
}

async function ensurePostReportsTable(conn) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS post_reports (
      report_id SERIAL PRIMARY KEY,
      post_id INT NOT NULL,
      reporter_user_id INT NOT NULL,
      reason VARCHAR(100) NULL,
      detail TEXT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (post_id, reporter_user_id)
    )`
  );
}

async function backfillSecurityLogsIfEmpty(conn) {
  await ensureSecurityLogsTable(conn);

  const existingSecurityLogs = await querySingleValue(conn, 'SELECT COUNT(*) AS total FROM security_logs');
  if (existingSecurityLogs > 0) return;

  const otpHasCreatedAt = await tableHasCreatedAt(conn, 'otp_verification');
  if (!otpHasCreatedAt) return;

  const otpHasVerified = await tableHasColumn(conn, 'otp_verification', 'is_verified');

  const otpRows = await safeQuery(
    conn,
    `SELECT o.created_at, o.expired_at,
            ${otpHasVerified ? 'o.is_verified' : '0 AS is_verified'},
            u.full_name,
            u.phone_number
     FROM otp_verification o
     LEFT JOIN users u ON u.user_id = o.user_id
     ORDER BY o.created_at DESC
     LIMIT 300`
  );

  if (!otpRows.length) return;

  for (const row of otpRows) {
    const actorName = row.full_name || row.phone_number || '-';
    const actorPhone = row.phone_number || null;
    const createdAt = row.created_at || null;

    await logSecurityEvent(conn, {
      eventType: SECURITY_EVENT_TYPES.USER_OTP_REQUEST,
      actorName,
      actorPhone,
      detail: 'Historical OTP request (migrated)',
      createdAt
    });

    if (Number(row.is_verified || 0) === 1) {
      await logSecurityEvent(conn, {
        eventType: SECURITY_EVENT_TYPES.USER_OTP_SUCCESS,
        actorName,
        actorPhone,
        detail: 'Historical OTP verified (migrated)',
        createdAt
      });
    } else if (row.expired_at) {
      const expiredAt = new Date(row.expired_at);
      if (!Number.isNaN(expiredAt.getTime()) && expiredAt.getTime() < Date.now()) {
        await logSecurityEvent(conn, {
          eventType: SECURITY_EVENT_TYPES.USER_OTP_FAILED,
          actorName,
          actorPhone,
          detail: 'Historical OTP expired/failed (migrated)',
          createdAt: row.expired_at
        });
      }
    }
  }
}

function getAdminActorLabel(req) {
  return String(
    req.admin?.full_name ||
    req.admin?.name ||
    req.admin?.username ||
    req.admin?.phone_number ||
    req.admin?.sub ||
    'admin'
  );
}

function normalizePostVisibilityLabel(visibility) {
  const value = String(visibility || 'public').toLowerCase();
  if (value === 'only_me') return 'เฉพาะเจ้าของโพสต์';
  if (value === 'followers') return 'ผู้ติดตาม';
  if (value === 'friends') return 'เพื่อน';
  return 'สาธารณะ';
}

function getPostStatus(post, reportCount) {
  if (Number(post?.is_deleted || 0) === 1) {
    return {
      key: 'deleted',
      label: 'ถูกลบ',
      badgeClass: 'bg-urgent',
      description: 'โพสต์นี้ถูกลบออกจากระบบแล้ว'
    };
  }

  if (String(post?.visibility || '').toLowerCase() === 'only_me') {
    return {
      key: 'hidden',
      label: 'ถูกซ่อน',
      badgeClass: 'bg-pending',
      description: 'โพสต์นี้ถูกซ่อนไว้จากผู้ใช้อื่น'
    };
  }

  if (Number(reportCount || 0) > 0) {
    return {
      key: 'reported',
      label: 'ถูกรายงาน',
      badgeClass: 'bg-pending',
      description: `ถูกรายงาน ${Number(reportCount)} ครั้ง`
    };
  }

  return {
    key: 'normal',
    label: 'ปกติ',
    badgeClass: 'bg-success',
    description: 'โพสต์ยังแสดงต่อสาธารณะ'
  };
}

async function ensureRewardSettingsColumns(conn) {
  const columnsToEnsure = [
    {
      name: 'usage_reward_daily_limit_count',
      ddl: 'ADD COLUMN usage_reward_daily_limit_count INT NOT NULL DEFAULT 2 AFTER session_bonus_points',
    },
    {
      name: 'streak_milestone_days',
      ddl: 'ADD COLUMN streak_milestone_days INT NOT NULL DEFAULT 30 AFTER streak_milestone_bonus',
    },
    {
      name: 'profile_completion_points',
      ddl: 'ADD COLUMN profile_completion_points INT NOT NULL DEFAULT 50 AFTER streak_milestone_days',
    },
    {
      name: 'post_activity_points',
      ddl: 'ADD COLUMN post_activity_points INT NOT NULL DEFAULT 10 AFTER profile_completion_points',
    },
    {
      name: 'post_activity_required_posts',
      ddl: 'ADD COLUMN post_activity_required_posts INT NOT NULL DEFAULT 2 AFTER post_activity_points',
    },
    {
      name: 'comment_activity_points',
      ddl: 'ADD COLUMN comment_activity_points INT NOT NULL DEFAULT 2 AFTER post_activity_required_posts',
    },
    {
      name: 'comment_activity_daily_limit_count',
      ddl: 'ADD COLUMN comment_activity_daily_limit_count INT NOT NULL DEFAULT 5 AFTER comment_activity_points',
    },
    {
      name: 'share_activity_points',
      ddl: 'ADD COLUMN share_activity_points INT NOT NULL DEFAULT 10 AFTER comment_activity_daily_limit_count',
    },
  ];

  for (const col of columnsToEnsure) {
    const { rows } = await conn.query(
      `SELECT COUNT(*) AS total
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'reward_settings'
         AND column_name = $1`,
      [col.name]
    );

    if (Number(rows[0]?.total || 0) === 0) {
      await conn.query(`ALTER TABLE reward_settings ${col.ddl}`);
    }
  }
}

function toYmd(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Returns current date/time shifted to Asia/Bangkok (UTC+7)
function nowThai() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

// Formats a JS Date as YYYY-MM-DD in Thai timezone
function toYmdThai(date) {
  const thai = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const yyyy = thai.getUTCFullYear();
  const mm = String(thai.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(thai.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeYmd(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const date = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return toYmd(date) === trimmed ? trimmed : null;
}

function normalizeYm(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}$/.test(trimmed)) return null;
  const [yearStr, monthStr] = trimmed.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

function buildAbsoluteUploadUrl(req, storedPath) {
  if (!storedPath || typeof storedPath !== 'string') return null;
  const normalized = storedPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) return null;
  if (/^https?:\/\//i.test(normalized)) return normalized;

  const host = req.get('host');
  const protocol = req.protocol || 'http';
  const uploadPath = normalized.startsWith('uploads/') ? normalized : `uploads/${normalized}`;
  return `${protocol}://${host}/${uploadPath}`;
}

async function buildSummaryAndActivity(conn, options = {}) {
  const selectedDauDate = normalizeYmd(options.dauDate) || toYmdThai(new Date());
  const thaiNow = nowThai();
  const selectedMauMonth = normalizeYm(options.mauMonth) || `${thaiNow.getUTCFullYear()}-${String(thaiNow.getUTCMonth() + 1).padStart(2, '0')}`;

  // Resolve week anchor: use provided wauStart (YYYY-MM-DD, Monday) or default to current Thai week's Monday
  let wauStartDate;
  const providedWauStart = normalizeYmd(options.wauStart);
  if (providedWauStart) {
    wauStartDate = providedWauStart;
  } else {
    const thaiDayOfWeek = nowThai().getUTCDay();
    const thaiTodayForWeek = new Date(`${toYmdThai(new Date())}T00:00:00Z`);
    thaiTodayForWeek.setUTCDate(thaiTodayForWeek.getUTCDate() - ((thaiDayOfWeek + 6) % 7));
    wauStartDate = thaiTodayForWeek.toISOString().slice(0, 10);
  }
  const wauEndObj = new Date(`${wauStartDate}T00:00:00Z`);
  wauEndObj.setUTCDate(wauEndObj.getUTCDate() + 6);
  const wauEndDate = wauEndObj.toISOString().slice(0, 10);

  const [usersHasCreatedAt, postsHasCreatedAt, commentsHasCreatedAt] = await Promise.all([
    tableHasCreatedAt(conn, 'users'),
    tableHasCreatedAt(conn, 'posts'),
    tableHasCreatedAt(conn, 'comments')
  ]);

  const activeSources = [
    'SELECT user_id, started_at AS activity_at FROM app_sessions'
  ];
  if (postsHasCreatedAt) {
    activeSources.push("SELECT user_id, created_at AS activity_at FROM posts WHERE is_deleted = 0");
  }
  if (commentsHasCreatedAt) {
    activeSources.push('SELECT user_id, created_at AS activity_at FROM comments');
  }
  const activeUnionSql = activeSources.join(' UNION ALL ');

  const usersTotal = await querySingleValue(conn, 'SELECT COUNT(*) AS total FROM users');
  const postsTotal = await querySingleValue(conn, 'SELECT COUNT(*) AS total FROM posts WHERE is_deleted = 0');
  const likesTotal = await querySingleValue(conn, "SELECT COUNT(*) AS total FROM post_likes WHERE type = 'like'");
  const commentsTotal = await querySingleValue(conn, 'SELECT COUNT(*) AS total FROM comments');

  const weeklyActiveRows = await safeQuery(
    conn,
     `SELECT COUNT(DISTINCT user_id) AS total
      FROM (${activeUnionSql}) active
      WHERE activity_at >= NOW() - INTERVAL '7 days'`
  );
  const weeklyActiveUsers = Number(weeklyActiveRows?.[0]?.total || 0);

  // DAU = unique active users in the last 24 hours
  const usersTodayRows = await safeQuery(
    conn,
     `SELECT COUNT(DISTINCT user_id) AS total
      FROM (${activeUnionSql}) active
      WHERE activity_at >= NOW() - INTERVAL '24 hours'`
  );
  const usersToday = Number(usersTodayRows?.[0]?.total || 0);

  const postsToday = postsHasCreatedAt
    ? await querySingleValue(conn, "SELECT COUNT(*) AS total FROM posts WHERE is_deleted = 0 AND DATE(created_at) = CURRENT_DATE")
    : 0;

  // DAU graph: selected day (hourly 00:00-23:00)
  const dauRows = await safeQuery(
    conn,
    `SELECT EXTRACT(HOUR FROM activity_at) AS hour_slot,
            COUNT(DISTINCT user_id) AS total
     FROM (${activeUnionSql}) active
     WHERE DATE(activity_at) = $1
     GROUP BY EXTRACT(HOUR FROM activity_at)`,
    [selectedDauDate]
  );

  const dauMap = dauRows.reduce((acc, row) => {
    acc[Number(row.hour_slot)] = Number(row.total || 0);
    return acc;
  }, {});

  const labels = [];
  const postsSeries = [];
  const usersSeries = [];

  for (let hour = 0; hour < 24; hour += 1) {
    labels.push(`${String(hour).padStart(2, '0')}:00`);
    postsSeries.push(0);
    usersSeries.push(dauMap[hour] || 0);
  }

  // MAU graph: selected month (daily unique active users)
  const [mauYear, mauMonth] = selectedMauMonth.split('-').map(Number);
  const daysInSelectedMonth = new Date(mauYear, mauMonth, 0).getDate();
  const monthStart = `${selectedMauMonth}-01`;
  const nextMonthDate = new Date(mauYear, mauMonth, 1);
  const nextMonthStart = toYmd(nextMonthDate);

  const mauRows = await safeQuery(
    conn,
    `SELECT EXTRACT(DAY FROM activity_at) AS day_of_month,
            COUNT(DISTINCT user_id) AS total
     FROM (${activeUnionSql}) active
     WHERE DATE(activity_at) >= $1
       AND DATE(activity_at) < $2
     GROUP BY EXTRACT(DAY FROM activity_at)`,
    [monthStart, nextMonthStart]
  );

  const mauMap = mauRows.reduce((acc, row) => {
    acc[Number(row.day_of_month)] = Number(row.total || 0);
    return acc;
  }, {});

  const monthlyLabels = [];
  const monthlyPostsSeries = [];
  const monthlyUsersSeries = [];

  for (let day = 1; day <= daysInSelectedMonth; day += 1) {
    monthlyLabels.push(String(day));
    monthlyPostsSeries.push(0);
    monthlyUsersSeries.push(mauMap[day] || 0);
  }

  // WAU graph: last 7 days (Mon-Sun labels)
  let postsWeeklyMap = {};
  let activeUsersWeeklyMap = {};

  if (postsHasCreatedAt) {
    const { rows: postWeekRows } = await conn.query(
      `SELECT DATE(created_at) AS day_key,
              COUNT(*) AS total
       FROM posts
       WHERE is_deleted = 0
         AND DATE(created_at) >= $1
         AND DATE(created_at) <= $2
       GROUP BY DATE(created_at)`,
      [wauStartDate, wauEndDate]
    );

    postsWeeklyMap = postWeekRows.reduce((acc, row) => {
      acc[String(row.day_key).slice(0, 10)] = Number(row.total || 0);
      return acc;
    }, {});
  }

  const activeWeekRows = await safeQuery(
    conn,
    `SELECT DATE(activity_at) AS day_key,
            COUNT(DISTINCT user_id) AS total
      FROM (${activeUnionSql}) active
      WHERE DATE(activity_at) >= $1
        AND DATE(activity_at) <= $2
      GROUP BY DATE(activity_at)`,
    [wauStartDate, wauEndDate]
  );

  activeUsersWeeklyMap = activeWeekRows.reduce((acc, row) => {
    acc[String(row.day_key).slice(0, 10)] = Number(row.total || 0);
    return acc;
  }, {});

  const weeklyLabels = [];
  const weeklyPostsSeries = [];
  const weeklyUsersSeries = [];

  const weekLabelMap = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];
  const weekStart = new Date(`${wauStartDate}T00:00:00Z`);

  for (let i = 0; i < 7; i += 1) {
    const date = new Date(weekStart);
    date.setUTCDate(weekStart.getUTCDate() + i);
    const dayKey = date.toISOString().slice(0, 10);

    weeklyLabels.push(weekLabelMap[i]);
    weeklyPostsSeries.push(postsWeeklyMap[dayKey] || 0);
    weeklyUsersSeries.push(activeUsersWeeklyMap[dayKey] || 0);
  }

  return {
    summary: {
      usersTotal,
      usersToday,
      postsTotal,
      postsToday,
      likesTotal,
      commentsTotal,
      weeklyActiveUsers
    },
    activity: {
      labels,
      postsSeries,
      usersSeries,
      selectedDate: selectedDauDate
    },
    activityMonthly: {
      labels: monthlyLabels,
      postsSeries: monthlyPostsSeries,
      usersSeries: monthlyUsersSeries,
      selectedMonth: selectedMauMonth
    },
    activityWeekly: {
      labels: weeklyLabels,
      postsSeries: weeklyPostsSeries,
      usersSeries: weeklyUsersSeries
    }
  };
}

exports.getDashboardSummary = async (req, res) => {
  let conn;

  try {
    conn = await pool.connect();
    const payload = await buildSummaryAndActivity(conn, {
      dauDate: req.query.dauDate,
      mauMonth: req.query.mauMonth,
      wauStart: req.query.wauStart
    });
    res.json(payload);
  } catch (error) {
    console.error('Failed to build dashboard summary:', error);
    res.status(500).json({ error: 'Failed to load dashboard summary' });
  } finally {
    if (conn) conn.release();
  }
};

exports.getDashboardData = async (req, res) => {
  console.log('🔴 getDashboardData called - starting dashboard data fetch');
  let conn;

  try {
    conn = await pool.connect();
    console.log('✅ Database connection established for dashboard');
    await ensureModerationColumns(conn);
    await ensureAdminLogsTable(conn);
    await backfillSecurityLogsIfEmpty(conn);
    await ensureSecurityLogsTable(conn);

    const payload = await buildSummaryAndActivity(conn, {
      dauDate: req.query.dauDate,
      mauMonth: req.query.mauMonth,
      wauStart: req.query.wauStart
    });

    const trendingRows = await safeQuery(
      conn,
      `SELECT p.post_id, p.content, p.created_at, p.group_id, u.full_name, u.phone_number,
              g.name AS group_name,
              (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.post_id AND pl.type='like') AS likes,
              (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.post_id) AS comments
       FROM posts p
       JOIN users u ON u.user_id = p.user_id
       LEFT JOIN \`groups\` g ON g.group_id = p.group_id
       WHERE p.is_deleted = 0
       ORDER BY (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.post_id AND pl.type='like') DESC,
                (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.post_id) DESC,
                p.created_at DESC
       LIMIT 8`
    );
    console.log('📊 Trending posts query result:', trendingRows.length, 'posts found');
    if (trendingRows.length > 0) {
      console.log('First trending post sample:', trendingRows[0]);
    }

    await ensurePostReportsTable(conn);

    async function ensureCommentReportsTable(conn) {
      await conn.query(
        `CREATE TABLE IF NOT EXISTS comment_reports (
          report_id SERIAL PRIMARY KEY,
          comment_id INT NOT NULL,
          reporter_user_id INT NOT NULL,
          reason VARCHAR(100) NULL,
          detail TEXT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (comment_id, reporter_user_id)
        )`
      );
    }

    await ensureCommentReportsTable(conn);

    const latestPosts = await safeQuery(
      conn,
      `SELECT p.post_id, p.content, p.created_at, p.visibility, p.is_deleted,
              u.full_name, u.phone_number,
              u.is_blocked, u.blocked_reason,
              COALESCE(report_summary.report_count, 0) AS report_count,
              COALESCE(report_summary.pending_count, 0) AS pending_count,
              COALESCE(report_summary.reviewed_count, 0) AS reviewed_count,
              report_summary.latest_report_at,
              (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.post_id AND pl.type='like') AS likes,
              (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.post_id) AS comments
       FROM posts p
       JOIN users u ON u.user_id = p.user_id
       LEFT JOIN (
         SELECT post_id,
                COUNT(*) AS report_count,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
                SUM(CASE WHEN status = 'reviewed' THEN 1 ELSE 0 END) AS reviewed_count,
                MAX(created_at) AS latest_report_at
         FROM post_reports
         GROUP BY post_id
       ) AS report_summary ON report_summary.post_id = p.post_id
       WHERE p.is_deleted = 0
       ORDER BY p.created_at DESC
       LIMIT 20`
    );

    const reportRows = await safeQuery(
      conn,
            `SELECT pr.report_id, pr.reason, pr.detail, pr.status, pr.created_at,
              p.post_id, p.content,
              author.full_name AS author_name,
              author.phone_number AS author_phone,
              reporter.full_name AS reporter_name,
              reporter.phone_number AS reporter_phone
       FROM post_reports pr
       JOIN posts p ON p.post_id = pr.post_id
       JOIN users author ON author.user_id = p.user_id
       JOIN users reporter ON reporter.user_id = pr.reporter_user_id
       ORDER BY pr.created_at DESC
       LIMIT 20`
    );

    const commentReportRows = await safeQuery(
      conn,
      `SELECT cr.report_id, cr.reason, cr.detail, cr.status, cr.created_at,
              c.comment_id, c.content, c.post_id,
              author.full_name AS author_name,
              author.phone_number AS author_phone,
              reporter.full_name AS reporter_name,
              reporter.phone_number AS reporter_phone
       FROM comment_reports cr
       JOIN comments c ON c.comment_id = cr.comment_id
       JOIN users author ON author.user_id = c.user_id
       JOIN users reporter ON reporter.user_id = cr.reporter_user_id
       ORDER BY cr.created_at DESC
       LIMIT 20`
    );

    const usersHasCreatedAt = await tableHasCreatedAt(conn, 'users');
    const companyRows = usersHasCreatedAt
      ? await safeQuery(
        conn,
        `SELECT user_id, full_name, phone_number, profile_picture, about_me, created_at, last_login_at, is_verified, is_blocked, gender, birth_date, current_location
         FROM users
         ORDER BY created_at DESC
         LIMIT 20`
      )
      : await safeQuery(
        conn,
        `SELECT user_id, full_name, phone_number, profile_picture, about_me, last_login_at, is_verified, is_blocked, gender, birth_date, current_location
         FROM users
         LIMIT 20`
      );

    const jobsRows = await safeQuery(
      conn,
      `SELECT p.post_id, p.content, p.created_at, u.full_name
       FROM posts p
       JOIN users u ON u.user_id = p.user_id
       WHERE p.is_deleted = 0
         AND (LOWER(p.content) LIKE '%งาน%' OR LOWER(p.content) LIKE '%job%' OR LOWER(p.content) LIKE '%สมัคร%')
       ORDER BY p.created_at DESC
       LIMIT 20`
    );

    const pointsRows = await safeQuery(
      conn,
      `SELECT user_id, full_name, phone_number, total_points, login_streak, is_blocked
       FROM users
       ORDER BY total_points DESC, login_streak DESC
       LIMIT 20`
    );

    await ensureSecurityLogsTable(conn);

    const otpRequestToday = await querySingleValue(
      conn,
      `SELECT COUNT(*) AS total
       FROM security_logs
       WHERE DATE(created_at) = CURRENT_DATE
         AND event_type IN ('user_otp_request', 'admin_otp_request')`
    );

    const otpSuccessToday = await querySingleValue(
      conn,
      `SELECT COUNT(*) AS total
       FROM security_logs
       WHERE DATE(created_at) = CURRENT_DATE
         AND event_type IN ('user_otp_success', 'admin_otp_success')`
    );

    const otpFailedToday = await querySingleValue(
      conn,
      `SELECT COUNT(*) AS total
       FROM security_logs
       WHERE DATE(created_at) = CURRENT_DATE
         AND event_type IN ('user_otp_failed', 'admin_otp_failed')`
    );

    const loginSuccessToday = await querySingleValue(
      conn,
      `SELECT COUNT(*) AS total
       FROM security_logs
       WHERE DATE(created_at) = CURRENT_DATE
         AND event_type IN ('user_otp_success', 'admin_otp_success', 'admin_login_success')`
    );

    const loginFailedToday = await querySingleValue(
      conn,
      `SELECT COUNT(*) AS total
       FROM security_logs
       WHERE DATE(created_at) = CURRENT_DATE
         AND event_type IN ('user_otp_failed', 'admin_otp_failed', 'admin_login_failed')`
    );

    const otpSuccessRate = otpRequestToday > 0
      ? Math.round((otpSuccessToday / otpRequestToday) * 100)
      : 0;

    const securityRows = await safeQuery(
      conn,
      `SELECT event_type, actor_name, actor_phone, target_name, target_phone, ip_address, device, detail, created_at
       FROM security_logs
       WHERE created_at >= NOW() - INTERVAL '30 days'
         AND (
           event_type IN ('user_otp_request', 'user_otp_success', 'user_otp_failed', 'admin_otp_request', 'admin_otp_success', 'admin_otp_failed', 'admin_login_success', 'admin_login_failed', 'user_blocked', 'user_unblocked')
         )
       ORDER BY created_at DESC
       LIMIT 50`
    );

    const securityLogs = securityRows.map((row) => ({
      eventType: row.event_type || 'security_event',
      eventLabel: formatSecurityEventLabel(row.event_type || ''),
      actor: row.actor_name || row.actor_phone || '-',
      actorPhone: row.actor_phone || '-',
      target: row.target_name || row.target_phone || '-',
      targetPhone: row.target_phone || '-',
      ipAddress: row.ip_address || '-',
      device: row.device || '-',
      detail: row.detail || '',
      createdAt: row.created_at || null
    }));

    const securityAlerts = [];
    if (otpFailedToday >= 5) {
      securityAlerts.push({
        severity: 'critical',
        title: 'OTP fail มากผิดปกติ',
        message: `วันนี้มี OTP fail ${otpFailedToday} ครั้ง`
      });
    }
    if (loginFailedToday >= 5) {
      securityAlerts.push({
        severity: 'critical',
        title: 'login fail เกิน 5 ครั้ง',
        message: `วันนี้มี login fail ${loginFailedToday} ครั้ง`
      });
    }
    if (otpRequestToday >= 5 && otpSuccessRate < 70) {
      securityAlerts.push({
        severity: 'warning',
        title: 'OTP success rate ต่ำ',
        message: `Success rate วันนี้อยู่ที่ ${otpSuccessRate}%`
      });
    }
    if (securityLogs.some((row) => row.eventType === 'user_blocked')) {
      securityAlerts.push({
        severity: 'info',
        title: 'มีการบล็อกผู้ใช้',
        message: 'พบเหตุการณ์ user_blocked ในช่วง 30 วันที่ผ่านมา'
      });
    }

    const notificationTotal = await querySingleValue(conn, 'SELECT COUNT(*) AS total FROM notifications');

    console.log('📤 Final payload sections.trendingPosts count:', trendingRows.length);
    
    payload.sections = {
      trendingPosts: trendingRows.map((row) => {
        const mapped = {
          postId: Number(row.post_id),
          author: row.full_name || '-',
          authorPhone: row.phone_number || '-',
          content: row.content || '',
          groupId: row.group_id ? Number(row.group_id) : null,
          groupName: row.group_name || 'ทั่วไป',
          likes: Number(row.likes || 0),
          comments: Number(row.comments || 0),
          createdAt: row.created_at || null
        };
        return mapped;
      }),
      contentMonitor: latestPosts.map((row) => ({
        ...(function buildStatus() {
          const status = getPostStatus(row, Number(row.report_count || 0));
          return {
            status: status.key,
            statusLabel: status.label,
            statusBadgeClass: status.badgeClass,
            statusDescription: status.description
          };
        }()),
        postId: Number(row.post_id),
        author: row.full_name || '-',
        authorPhone: row.phone_number || '-',
        content: row.content || '',
        likes: Number(row.likes || 0),
        comments: Number(row.comments || 0),
        visibility: row.visibility || 'public',
        isBlocked: Number(row.is_blocked || 0) === 1,
        blockedReason: row.blocked_reason || '',
        reportCount: Number(row.report_count || 0),
        pendingReportCount: Number(row.pending_count || 0),
        reviewedReportCount: Number(row.reviewed_count || 0),
        latestReportAt: row.latest_report_at || null,
        violationHints: detectViolationHints(row.content || ''),
        createdAt: row.created_at || null
      })),
      reports: reportRows.map((row) => ({
        reportId: Number(row.report_id || 0),
        postId: Number(row.post_id),
        author: row.author_name || '-',
        authorPhone: row.author_phone || '-',
        reporter: row.reporter_name || '-',
        reporterPhone: row.reporter_phone || '-',
        content: row.content || '',
        reason: row.reason || '',
        detail: row.detail || '',
        status: row.status || 'pending',
        createdAt: row.created_at || null
      })),
      commentReports: commentReportRows.map((row) => ({
        reportId: Number(row.report_id || 0),
        commentId: Number(row.comment_id),
        postId: Number(row.post_id),
        author: row.author_name || '-',
        authorPhone: row.author_phone || '-',
        reporter: row.reporter_name || '-',
        reporterPhone: row.reporter_phone || '-',
        content: row.content || '',
        reason: row.reason || '',
        detail: row.detail || '',
        status: row.status || 'pending',
        createdAt: row.created_at || null
      })),
      companies: companyRows.map((row) => ({
        user_id: Number(row.user_id || 0) || null,
        name: row.full_name || 'ไม่ระบุชื่อ',
        regNo: row.phone_number || '-',
        phone_number: row.phone_number || '-',
        profile_picture: row.profile_picture || null,
        profile_picture_url: buildAbsoluteUploadUrl(req, row.profile_picture),
        about_me: row.about_me || '',
        documentName: row.phone_number ? `profile_${row.phone_number}.pdf` : '-',
        status: Number(row.is_verified || 0) === 1 ? 'approved' : 'pending',
        createdAt: row.created_at || null,
        created_at: row.created_at || null,
        last_login_at: row.last_login_at || null,
        is_blocked: Number(row.is_blocked || 0) === 1,
        gender: row.gender || null,
        birth_date: row.birth_date || null,
        current_location: row.current_location || null
      })),
      jobs: jobsRows.map((row) => ({
        postId: Number(row.post_id),
        author: row.full_name || '-',
        content: row.content || '',
        status: 'pending',
        createdAt: row.created_at || null
      })),
      points: pointsRows.map((row) => ({
        userId: Number(row.user_id || 0),
        name: row.full_name || 'ไม่ระบุชื่อ',
        phone: row.phone_number || '-',
        totalPoints: Math.floor(Number(row.total_points || 0)),
        streak: Number(row.login_streak || 0),
        isBlocked: Number(row.is_blocked || 0) === 1
      })),
      security: {
        otpRequestToday,
        otpFailedToday,
        loginSuccessToday,
        loginFailedToday,
        otpSuccessRate,
        notificationTotal,
        alerts: securityAlerts,
        logs: securityLogs
      }
    };

    res.json(payload);
  } catch (error) {
    console.error('Failed to build dashboard data:', error);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  } finally {
    if (conn) conn.release();
  }
};

exports.getPostDetail = async (req, res) => {
  let conn;

  try {
    const postId = Number(req.params.id);
    if (!Number.isFinite(postId) || postId <= 0) {
      return res.status(400).json({ error: 'Invalid post id' });
    }

    conn = await pool.connect();
    await ensureModerationColumns(conn);
    await ensureAdminLogsTable(conn);

    const { rows: postRows } = await conn.query(
      `SELECT p.post_id, p.content, p.created_at, p.visibility, p.user_id, p.group_id,
              u.full_name, u.phone_number, u.profile_picture,
              u.is_blocked, u.blocked_reason, u.warning_note, u.blocked_at,
              (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.post_id AND pl.type='like') AS likes,
              (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.post_id) AS comments,
              (SELECT COUNT(*) FROM posts sp WHERE sp.shared_post_id=p.post_id AND sp.is_deleted=0) AS shares
       FROM posts p
       JOIN users u ON u.user_id = p.user_id
       WHERE p.post_id = $1
       LIMIT 1`,
      [postId]
    );

    if (!postRows.length) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const post = postRows[0];

    const { rows: imageRows } = await conn.query(
      'SELECT image_url FROM post_images WHERE post_id = $1 ORDER BY image_id ASC',
      [postId]
    );

    await ensurePostReportsTable(conn);

    const reportSummaryRows = await safeQuery(
      conn,
      `SELECT COUNT(*) AS report_count,
              SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
              SUM(CASE WHEN status = 'reviewed' THEN 1 ELSE 0 END) AS reviewed_count,
              STRING_AGG(DISTINCT NULLIF(TRIM(reason), ''), ' | ' ORDER BY NULLIF(TRIM(reason), '')) AS reasons,
              MAX(created_at) AS latest_report_at
       FROM post_reports
       WHERE post_id = $1`,
      [postId]
    );

    const reportRows = await safeQuery(
      conn,
      `SELECT pr.report_id, pr.reason, pr.detail, pr.status, pr.created_at,
              reporter.full_name AS reporter_name,
              reporter.phone_number AS reporter_phone
       FROM post_reports pr
       JOIN users reporter ON reporter.user_id = pr.reporter_user_id
       WHERE pr.post_id = $1
       ORDER BY pr.created_at DESC
       LIMIT 6`,
      [postId]
    );

    await ensurePostModerationLogsTable(conn);

    const auditRows = await safeQuery(
      conn,
      `SELECT action, admin_actor, reason, note, created_at
       FROM post_moderation_logs
       WHERE post_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [postId]
    );

    const { rows: commentRows } = await conn.query(
      `SELECT c.comment_id, c.content, c.created_at,
              u.full_name, u.phone_number, u.profile_picture
       FROM comments c
       JOIN users u ON u.user_id = c.user_id
       WHERE c.post_id = $1
       ORDER BY c.created_at ASC`,
      [postId]
    );

    const moderation = {
      isBlocked: Number(post.is_blocked || 0) === 1,
      blockedReason: post.blocked_reason || '',
      warningNote: post.warning_note || '',
      blockedAt: post.blocked_at || null,
      status: getPostStatus(post, Number(reportSummaryRows[0]?.report_count || 0)).key,
      statusLabel: getPostStatus(post, Number(reportSummaryRows[0]?.report_count || 0)).label,
      statusBadgeClass: getPostStatus(post, Number(reportSummaryRows[0]?.report_count || 0)).badgeClass,
      statusDescription: getPostStatus(post, Number(reportSummaryRows[0]?.report_count || 0)).description,
      visibilityLabel: normalizePostVisibilityLabel(post.visibility),
      reportCount: Number(reportSummaryRows[0]?.report_count || 0),
      pendingReportCount: Number(reportSummaryRows[0]?.pending_count || 0),
      reviewedReportCount: Number(reportSummaryRows[0]?.reviewed_count || 0)
    };

    const reportCount = Number(reportSummaryRows[0]?.report_count || 0);
    const reportReasons = Array.from(
      new Set(
        reportRows
          .map((row) => String(row.reason || row.detail || '').trim())
          .filter(Boolean)
      )
    );

    return res.json({
      post: {
        postId: Number(post.post_id),
        userId: Number(post.user_id),
        groupId: post.group_id != null ? Number(post.group_id) : null,
        author: post.full_name || '-',
        authorPhone: post.phone_number || '-',
        authorAvatarUrl: post.profile_picture
          ? (/^https?:\/\//i.test(post.profile_picture) ? post.profile_picture : `${process.env.BACKEND_URL || 'http://10.0.2.2:3000'}/uploads/${post.profile_picture}`)
          : null,
        content: post.content || '',
        visibility: post.visibility || 'public',
        createdAt: post.created_at || null,
        likes: Number(post.likes || 0),
        comments: Number(post.comments || 0),
        shares: Number(post.shares || 0),
        images: imageRows.map((row) => /^https?:\/\//i.test(row.image_url) ? row.image_url : `${process.env.BACKEND_URL || 'http://10.0.2.2:3000'}/uploads/${row.image_url}`),
        moderation,
        violationHints: detectViolationHints(post.content || '')
      },
      comments: commentRows.map((row) => ({
        commentId: Number(row.comment_id),
        author: row.full_name || '-',
        authorPhone: row.phone_number || '-',
        authorAvatarUrl: row.profile_picture
          ? (/^https?:\/\//i.test(row.profile_picture) ? row.profile_picture : `${process.env.BACKEND_URL || 'http://10.0.2.2:3000'}/uploads/${row.profile_picture}`)
          : null,
        content: row.content || '',
        createdAt: row.created_at || null,
        violationHints: detectViolationHints(row.content || '')
      })),
      reportContext: {
        count: reportCount,
        pendingCount: Number(reportSummaryRows[0]?.pending_count || 0),
        reviewedCount: Number(reportSummaryRows[0]?.reviewed_count || 0),
        latestReportAt: reportSummaryRows[0]?.latest_report_at || null,
        reasons: reportReasons,
        reports: reportRows.map((row) => ({
          reportId: Number(row.report_id),
          reason: row.reason || '',
          detail: row.detail || '',
          status: row.status || 'pending',
          reporterName: row.reporter_name || '-',
          reporterPhone: row.reporter_phone || '-',
          createdAt: row.created_at || null
        }))
      },
      auditLogs: auditRows.map((row) => ({
        action: row.action || '-',
        actor: row.admin_actor || '-',
        reason: row.reason || '',
        note: row.note || '',
        createdAt: row.created_at || null
      }))
    });
  } catch (error) {
    console.error('Failed to load admin post detail:', error);
    return res.status(500).json({ error: 'Failed to load post detail' });
  } finally {
    if (conn) conn.release();
  }
};

exports.moderatePost = async (req, res) => {
  let conn;

  try {
    const postId = Number(req.params.id);
    const { action, reason, warning_note } = req.body || {};
    const normalizedAction = String(action || '').trim().toLowerCase();

    if (!Number.isFinite(postId) || postId <= 0) {
      return res.status(400).json({ error: 'Invalid post id' });
    }

    if (!['delete', 'hide', 'warn', 'dismiss'].includes(normalizedAction)) {
      return res.status(400).json({ error: 'Invalid moderation action' });
    }

    conn = await pool.connect();
    await ensureModerationColumns(conn);
    await ensureAdminLogsTable(conn);
    await ensurePostModerationLogsTable(conn);
    await ensureSecurityLogsTable(conn);
    await ensurePostReportsTable(conn);

    const { rows: postRows } = await conn.query(
      `SELECT p.post_id, p.visibility, p.is_deleted, p.user_id,
              u.full_name, u.phone_number
       FROM posts p
       JOIN users u ON u.user_id = p.user_id
       WHERE p.post_id = $1
       LIMIT 1`,
      [postId]
    );

    if (!postRows.length) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const post = postRows[0];
    if (Number(post.is_deleted || 0) === 1 && normalizedAction !== 'warn' && normalizedAction !== 'dismiss') {
      return res.status(400).json({ error: 'Post is already deleted' });
    }

    const normalizedReason = String(reason || 'คำหยาบ/สแปม/เนื้อหาไม่เหมาะสม').slice(0, 255);
    const normalizedWarning = String(
      warning_note || 'พบเนื้อหาที่เข้าข่ายไม่เหมาะสม กรุณาปรับปรุงเนื้อหาและพฤติกรรม'
    ).slice(0, 2000);
    const adminActor = getAdminActorLabel(req);

    if (normalizedAction === 'delete') {
      await conn.query(
        'UPDATE posts SET is_deleted = 1, deleted_at = NOW() WHERE post_id = $1',
        [postId]
      );
    } else if (normalizedAction === 'hide') {
      await conn.query(
        "UPDATE posts SET visibility = 'only_me' WHERE post_id = $1",
        [postId]
      );
    } else if (normalizedAction === 'warn') {
      await conn.query(
        'UPDATE users SET warning_note = $1 WHERE user_id = $2',
        [normalizedWarning, Number(post.user_id)]
      );
    } else if (normalizedAction === 'dismiss') {
      // No content mutation; this path only closes pending reports as dismissed.
    }

    if (normalizedAction === 'dismiss') {
      await conn.query(
        `UPDATE post_reports
         SET status = 'dismissed'
         WHERE post_id = $1 AND status = 'pending'`,
        [postId]
      );
    } else {
      await conn.query(
        `UPDATE post_reports
         SET status = 'reviewed'
         WHERE post_id = $1 AND status = 'pending'`,
        [postId]
      );
    }

    await conn.query(
      `INSERT INTO post_moderation_logs (post_id, admin_actor, action, reason, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [postId, adminActor, normalizedAction, normalizedReason, normalizedWarning]
    );

    try {
      await conn.query(
        'INSERT INTO admin_logs (event, "user") VALUES ($1, $2)',
        [
          `POST_${normalizedAction.toUpperCase()}: ${postId} | reason: ${normalizedReason}`,
          `${post.phone_number || '-'} | by ${adminActor}`
        ]
      );
    } catch (logError) {
      // Keep moderation flow successful even if the generic audit table cannot be written.
    }

    return res.json({
      message: 'Post moderation saved',
      postId,
      action: normalizedAction,
      moderationState: normalizedAction === 'delete'
        ? 'deleted'
        : normalizedAction === 'hide'
          ? 'hidden'
          : normalizedAction === 'dismiss'
            ? 'dismissed'
            : 'warned'
    });
  } catch (error) {
    console.error('Failed to moderate post:', error);
    return res.status(500).json({ error: 'Failed to moderate post' });
  } finally {
    if (conn) conn.release();
  }
};

exports.movePostGroup = async (req, res) => {
  let conn;
  try {
    const postId = Number(req.params.id);
    if (!Number.isFinite(postId) || postId <= 0) {
      return res.status(400).json({ error: 'Invalid post id' });
    }

    const rawGroupId = req.body?.group_id;
    const targetGroupId =
      rawGroupId === null || rawGroupId === undefined || rawGroupId === ''
        ? null
        : Number(rawGroupId);

    if (targetGroupId !== null && (!Number.isFinite(targetGroupId) || targetGroupId <= 0)) {
      return res.status(400).json({ error: 'Invalid group_id' });
    }

    conn = await pool.connect();
    await ensureAdminLogsTable(conn);
    await ensurePostModerationLogsTable(conn);

    const { rows: postRows } = await conn.query(
      'SELECT post_id, group_id, is_deleted FROM posts WHERE post_id = $1 LIMIT 1',
      [postId]
    );
    if (!postRows.length) return res.status(404).json({ error: 'Post not found' });
    if (Number(postRows[0].is_deleted || 0) === 1) {
      return res.status(400).json({ error: 'Cannot move a deleted post' });
    }

    if (targetGroupId !== null) {
      const { rows: grpRows } = await conn.query(
        'SELECT group_id FROM groups WHERE group_id = $1',
        [targetGroupId]
      );
      if (!grpRows.length) return res.status(404).json({ error: 'Target group not found' });
    }

    const oldGroupId = postRows[0].group_id;
    await conn.query('UPDATE posts SET group_id = $1 WHERE post_id = $2', [targetGroupId, postId]);

    const adminActor = getAdminActorLabel(req);
    await conn.query(
      `INSERT INTO post_moderation_logs(post_id, action, admin_actor, reason, note)
       VALUES($1, 'move_group', $2, $3, NULL)`,
      [
        postId,
        adminActor,
        `ย้ายกลุ่มจาก group_id=${oldGroupId ?? 'null'} → group_id=${targetGroupId ?? 'null'}`
      ]
    );

    try {
      await conn.query('INSERT INTO admin_logs (event, "user") VALUES ($1, $2)', [
        `POST_MOVE_GROUP: ${postId} | from=${oldGroupId ?? 'null'} to=${targetGroupId ?? 'null'}`,
        `by ${adminActor}`
      ]);
    } catch (_) {}

    return res.json({ message: 'Post moved successfully', post_id: postId, group_id: targetGroupId });
  } catch (err) {
    console.error('Failed to move post group:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
};

exports.blockUser = async (req, res) => {
  let conn;

  try {
    const { phone_number, reason, warning_note } = req.body || {};

    if (!phone_number) {
      return res.status(400).json({ error: 'phone_number is required' });
    }

    conn = await pool.connect();
    await ensureModerationColumns(conn);
    await ensureAdminLogsTable(conn);

    const user = await getUserModerationByPhone(conn, phone_number);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const normalizedReason = String(reason || 'พฤติกรรมไม่เหมาะสม/บูลลี่').slice(0, 255);
    const normalizedWarning = String(warning_note || 'ถูกแจ้งเตือนจากทีม Content Monitor').slice(0, 2000);

    await conn.query(
      `UPDATE users
       SET is_blocked = 1,
           blocked_reason = $1,
           warning_note = $2,
           blocked_at = NOW(),
           blocked_by = $3
       WHERE user_id = $4`,
      [
        normalizedReason,
        normalizedWarning,
        Number(req.admin?.sub || 0) || null,
        user.userId
      ]
    );

    // Best effort logging for block history in admin dashboard.
    try {
      const actor = String(req.admin?.phone_number || req.admin?.username || req.admin?.sub || 'admin');
      await conn.query(
        'INSERT INTO admin_logs (event, "user") VALUES ($1, $2)',
        [`BLOCK_USER: ${phone_number} | reason: ${normalizedReason}`, `${phone_number} | by ${actor}`]
      );
      await logSecurityEvent(conn, {
        eventType: SECURITY_EVENT_TYPES.USER_BLOCKED,
        actorName: actor,
        actorPhone: actor,
        targetName: user.fullName || phone_number,
        targetPhone: phone_number,
        detail: `Blocked user: ${normalizedReason}`,
        req
      });
    } catch (logError) {
      // Keep blocking flow successful even if log table schema differs.
    }

    return res.json({
      message: 'User blocked successfully',
      moderation: {
        phone_number,
        is_blocked: true,
        reason: String(reason || 'พฤติกรรมไม่เหมาะสม/บูลลี่'),
        warning_note: String(warning_note || 'ถูกแจ้งเตือนจากทีม Content Monitor')
      }
    });
  } catch (error) {
    console.error('Failed to block user:', error);
    return res.status(500).json({ error: 'Failed to block user' });
  } finally {
    if (conn) conn.release();
  }
};

exports.unblockUser = async (req, res) => {
  let conn;

  try {
    const { phone_number } = req.body || {};

    if (!phone_number) {
      return res.status(400).json({ error: 'phone_number is required' });
    }

    conn = await pool.connect();
    await ensureModerationColumns(conn);
    await ensureSecurityLogsTable(conn);

    const user = await getUserModerationByPhone(conn, phone_number);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await conn.query(
      `UPDATE users
       SET is_blocked = 0,
           blocked_reason = NULL,
           warning_note = NULL,
           blocked_by = NULL
       WHERE user_id = $1`,
      [user.userId]
    );

    // Best effort logging for admin audit/history.
    try {
      const actor = String(req.admin?.phone_number || req.admin?.username || req.admin?.sub || 'admin');
      await conn.query(
        'INSERT INTO admin_logs (event, "user") VALUES ($1, $2)',
        [`UNBLOCK_USER: ${phone_number}`, `${phone_number} | by ${actor}`]
      );
      await logSecurityEvent(conn, {
        eventType: SECURITY_EVENT_TYPES.USER_UNBLOCKED,
        actorName: actor,
        actorPhone: actor,
        targetName: user.fullName || phone_number,
        targetPhone: phone_number,
        detail: 'Unblocked user',
        req
      });
    } catch (logError) {
      // Keep unblocking flow successful even if log table schema differs.
    }

    return res.json({
      message: 'User unblocked successfully',
      moderation: {
        phone_number,
        is_blocked: false
      }
    });
  } catch (error) {
    console.error('Failed to unblock user:', error);
    return res.status(500).json({ error: 'Failed to unblock user' });
  } finally {
    if (conn) conn.release();
  }
};

/**
 * GET /api/admin/users/:phone/detail
 * ดึงข้อมูล user detail พร้อมเบอร์โทรจากฐานข้อมูล สำหรับแสดงใน admin dashboard
 */
exports.getUserDetailByPhone = async (req, res) => {
  let conn;

  try {
    const { phone } = req.params;

    if (!phone) {
      return res.status(400).json({ error: 'phone is required' });
    }

    conn = await pool.connect();
    await ensureModerationColumns(conn);

    // ดึงข้อมูล user พื้นฐาน
    const { rows: userRows } = await conn.query(
      `SELECT
        u.user_id,
        u.phone_number,
        u.full_name,
        u.profile_picture,
        u.role,
        u.is_verified,
        u.about_me,
        u.created_at,
        u.last_login_at,
        u.gender,
        u.birth_date,
        u.hometown,
        u.current_location,
        u.pronouns,
        u.family_info,
        u.is_blocked,
        u.blocked_reason,
        u.warning_note,
        u.blocked_at
       FROM users u
       WHERE u.phone_number = $1`,
      [phone]
    );

    if (!userRows || userRows.length === 0) {
      conn.release();
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userRows[0];

    // ดึงคะแนนและ streak ของผู้ใช้ (ถ้ามี user_points table)
    let points = { total_points: 0, streak: 0 };
    try {
      const { rows: pointRows } = await conn.query(
        `SELECT total_points, login_streak FROM user_points WHERE user_id = $1`,
        [user.user_id]
      );
      if (pointRows && pointRows.length > 0) {
        points = {
          total_points: pointRows[0].total_points || 0,
          streak: pointRows[0].login_streak || 0
        };
      }
    } catch (e) {
      // Points table might not exist, ignore
    }

    // ดึง recent posts ของผู้ใช้
    const { rows: recentPosts } = await conn.query(
      `SELECT
        p.post_id,
        p.content,
        p.created_at,
        (SELECT COUNT(*) FROM post_likes WHERE post_id = p.post_id AND type = 'like') as likes,
        (SELECT COUNT(*) FROM post_likes WHERE post_id = p.post_id AND type = 'dislike') as dislikes,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.post_id) as comments,
        (SELECT COUNT(*) FROM posts sp WHERE sp.shared_post_id = p.post_id AND sp.is_deleted = 0) as shares
       FROM posts p
       WHERE p.user_id = $1 AND p.is_deleted = 0
       ORDER BY p.created_at DESC
       LIMIT 6`,
      [user.user_id]
    );

    // ดึง block history logs
    let { rows: blockHistory } = await conn.query(
      `SELECT event, created_at, "user" FROM admin_logs
       WHERE (event LIKE '%block%' OR event LIKE '%บล็อค%' OR event LIKE '%ระงับ%')
       AND (event LIKE $1 OR "user" LIKE $2)
       ORDER BY created_at DESC
       LIMIT 8`,
      [`%${phone}%`, `%${phone}%`]
    );

    // Backward compatibility: for historical rows blocked before we wrote admin_logs.
    if ((!blockHistory || blockHistory.length === 0) && user.blocked_at) {
      const fallbackEvent = user.blocked_reason
        ? `BLOCK_USER: ${user.phone_number} | reason: ${user.blocked_reason}`
        : `BLOCK_USER: ${user.phone_number}`;
      blockHistory = [
        {
          event: fallbackEvent,
          created_at: user.blocked_at,
          user: user.phone_number || '-'
        }
      ];
    }

    conn.release();

    return res.json({
      profile: {
        user_id: user.user_id,
        phone_number: user.phone_number,
        full_name: user.full_name || 'ผู้ใช้งาน',
        profile_picture: user.profile_picture || null,
        profile_picture_url: buildAbsoluteUploadUrl(req, user.profile_picture),
        role: user.role || 'elder',
        is_verified: Boolean(user.is_verified),
        created_at: user.created_at || null,
        last_login_at: user.last_login_at || null,
        // ข้อมูลส่วนตัว
        gender: user.gender || null,
        birth_date: user.birth_date || null,
        hometown: user.hometown || null,
        current_location: user.current_location || null,
        pronouns: user.pronouns || null,
        // เกี่ยวกับผู้ใช้
        about_me: user.about_me || '-',
        // ข้อมูลครอบครัว
        family_info: user.family_info || null,
        // สถานะบัญชี
        is_blocked: Boolean(user.is_blocked),
        blocked_reason: user.blocked_reason || null,
        warning_note: user.warning_note || null,
        blocked_at: user.blocked_at || null,
        // Activity
        total_points: points.total_points,
        streak: points.streak
      },
      recentPosts: recentPosts.map((post) => ({
        post_id: post.post_id,
        content: post.content,
        created_at: post.created_at,
        likes: post.likes || 0,
        comments: Number(post.comments) || 0,
        shares: post.shares || 0
      })),
      blockHistory: blockHistory.map((log) => ({
        event: log.event,
        created_at: log.created_at,
        user: log.user
      }))
    });
  } catch (error) {
    console.error('Failed to get user detail:', error);
    return res.status(500).json({ error: 'Failed to get user detail' });
  } finally {
    if (conn) conn.release();
  }
};

// ============================================================
// REWARD SETTINGS MANAGEMENT
// ============================================================

/**
 * GET /api/admin/reward-settings
 * ดึงการตั้งค่าแต้มปัจจุบัน
 */
exports.getRewardSettings = async (req, res) => {
  let conn;
  try {
    conn = await pool.connect();
    await ensureRewardSettingsColumns(conn);
    const { rows: settings } = await conn.query(
      'SELECT * FROM reward_settings WHERE setting_id = 1'
    );

    if (!settings.length) {
      return res.status(404).json({ error: 'Settings not found' });
    }

    conn.release();
    return res.json({
      success: true,
      data: {
        points_per_minute: Number(settings[0].points_per_minute),
        session_bonus_threshold: Number(settings[0].session_bonus_threshold),
        session_bonus_points: Number(settings[0].session_bonus_points),
        usage_reward_daily_limit_count: Number(settings[0].usage_reward_daily_limit_count || 2),
        usage_reward_daily_max_points:
          Number(settings[0].session_bonus_points) * Number(settings[0].usage_reward_daily_limit_count || 2),
        usage_reward_reset_time: '00:00',
        daily_login_bonus: Number(settings[0].daily_login_bonus),
        daily_login_bonus_3x_threshold: Number(settings[0].daily_login_bonus_3x_threshold),
        daily_login_bonus_3x_multiplier: Number(settings[0].daily_login_bonus_3x_multiplier),
        streak_milestone_bonus: Number(settings[0].streak_milestone_bonus),
        streak_milestone_days: Number(settings[0].streak_milestone_days || 30),
        profile_completion_points: Number(settings[0].profile_completion_points || 50),
        post_activity_points: Number(settings[0].post_activity_points || 10),
        post_activity_required_posts: Number(settings[0].post_activity_required_posts || 2),
        comment_activity_points: Number(settings[0].comment_activity_points || 2),
        comment_activity_daily_limit_count: Number(settings[0].comment_activity_daily_limit_count || 5),
        share_activity_points: Number(settings[0].share_activity_points || 10),
      }
    });
  } catch (error) {
    console.error('Failed to get reward settings:', error);
    return res.status(500).json({ error: 'Failed to get settings' });
  } finally {
    if (conn) conn.release();
  }
};

/**
 * PUT /api/admin/reward-settings
 * อัปเดตการตั้งค่าแต้ม
 */
exports.updateRewardSettings = async (req, res) => {
  let conn;
  try {
    const {
      points_per_minute,
      session_bonus_threshold,
      session_bonus_points,
      usage_reward_daily_limit_count,
      daily_login_bonus,
      daily_login_bonus_3x_threshold,
      daily_login_bonus_3x_multiplier,
      streak_milestone_bonus,
      streak_milestone_days,
      profile_completion_points,
      post_activity_points,
      post_activity_required_posts,
      comment_activity_points,
      comment_activity_daily_limit_count,
      share_activity_points
    } = req.body;

    conn = await pool.connect();
    await ensureRewardSettingsColumns(conn);

    // Validate inputs
    if (typeof points_per_minute !== 'undefined' && points_per_minute < 0) {
      conn.release();
      return res.status(400).json({ error: 'points_per_minute must be >= 0' });
    }
    if (typeof session_bonus_threshold !== 'undefined' && Number(session_bonus_threshold) <= 0) {
      conn.release();
      return res.status(400).json({ error: 'session_bonus_threshold must be > 0' });
    }
    if (typeof session_bonus_points !== 'undefined' && Number(session_bonus_points) <= 0) {
      conn.release();
      return res.status(400).json({ error: 'session_bonus_points must be > 0' });
    }
    if (typeof usage_reward_daily_limit_count !== 'undefined' && Number(usage_reward_daily_limit_count) <= 0) {
      conn.release();
      return res.status(400).json({ error: 'usage_reward_daily_limit_count must be > 0' });
    }
    if (typeof post_activity_required_posts !== 'undefined' && Number(post_activity_required_posts) <= 0) {
      conn.release();
      return res.status(400).json({ error: 'post_activity_required_posts must be > 0' });
    }
    if (typeof comment_activity_daily_limit_count !== 'undefined' && Number(comment_activity_daily_limit_count) <= 0) {
      conn.release();
      return res.status(400).json({ error: 'comment_activity_daily_limit_count must be > 0' });
    }
    if (typeof profile_completion_points !== 'undefined' && Number(profile_completion_points) < 0) {
      conn.release();
      return res.status(400).json({ error: 'profile_completion_points must be >= 0' });
    }
    if (typeof post_activity_points !== 'undefined' && Number(post_activity_points) < 0) {
      conn.release();
      return res.status(400).json({ error: 'post_activity_points must be >= 0' });
    }
    if (typeof comment_activity_points !== 'undefined' && Number(comment_activity_points) < 0) {
      conn.release();
      return res.status(400).json({ error: 'comment_activity_points must be >= 0' });
    }
    if (typeof share_activity_points !== 'undefined' && Number(share_activity_points) < 0) {
      conn.release();
      return res.status(400).json({ error: 'share_activity_points must be >= 0' });
    }

    // Build update query
    let paramIdx = 1;
    const updates = [];
    const values = [];

    if (typeof points_per_minute !== 'undefined') {
      updates.push(`points_per_minute = $${paramIdx++}`);
      values.push(points_per_minute);
    }
    if (typeof session_bonus_threshold !== 'undefined') {
      updates.push(`session_bonus_threshold = $${paramIdx++}`);
      values.push(session_bonus_threshold);
    }
    if (typeof session_bonus_points !== 'undefined') {
      updates.push(`session_bonus_points = $${paramIdx++}`);
      values.push(session_bonus_points);
    }
    if (typeof usage_reward_daily_limit_count !== 'undefined') {
      updates.push(`usage_reward_daily_limit_count = $${paramIdx++}`);
      values.push(usage_reward_daily_limit_count);
    }
    if (typeof daily_login_bonus !== 'undefined') {
      updates.push(`daily_login_bonus = $${paramIdx++}`);
      values.push(daily_login_bonus);
    }
    if (typeof daily_login_bonus_3x_threshold !== 'undefined') {
      updates.push(`daily_login_bonus_3x_threshold = $${paramIdx++}`);
      values.push(daily_login_bonus_3x_threshold);
    }
    if (typeof daily_login_bonus_3x_multiplier !== 'undefined') {
      updates.push(`daily_login_bonus_3x_multiplier = $${paramIdx++}`);
      values.push(daily_login_bonus_3x_multiplier);
    }
    if (typeof streak_milestone_bonus !== 'undefined') {
      updates.push(`streak_milestone_bonus = $${paramIdx++}`);
      values.push(streak_milestone_bonus);
    }
    if (typeof streak_milestone_days !== 'undefined') {
      if (Number(streak_milestone_days) <= 0) {
        conn.release();
        return res.status(400).json({ error: 'streak_milestone_days must be > 0' });
      }
      updates.push(`streak_milestone_days = $${paramIdx++}`);
      values.push(streak_milestone_days);
    }
    if (typeof profile_completion_points !== 'undefined') {
      updates.push(`profile_completion_points = $${paramIdx++}`);
      values.push(profile_completion_points);
    }
    if (typeof post_activity_points !== 'undefined') {
      updates.push(`post_activity_points = $${paramIdx++}`);
      values.push(post_activity_points);
    }
    if (typeof post_activity_required_posts !== 'undefined') {
      updates.push(`post_activity_required_posts = $${paramIdx++}`);
      values.push(post_activity_required_posts);
    }
    if (typeof comment_activity_points !== 'undefined') {
      updates.push(`comment_activity_points = $${paramIdx++}`);
      values.push(comment_activity_points);
    }
    if (typeof comment_activity_daily_limit_count !== 'undefined') {
      updates.push(`comment_activity_daily_limit_count = $${paramIdx++}`);
      values.push(comment_activity_daily_limit_count);
    }
    if (typeof share_activity_points !== 'undefined') {
      updates.push(`share_activity_points = $${paramIdx++}`);
      values.push(share_activity_points);
    }

    if (updates.length === 0) {
      conn.release();
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(1); // setting_id = 1

    const query = `UPDATE reward_settings SET ${updates.join(', ')} WHERE setting_id = $${paramIdx}`;
    await conn.query(query, values);

    // Return updated settings
    const { rows: updated } = await conn.query(
      'SELECT * FROM reward_settings WHERE setting_id = 1'
    );

    conn.release();
    return res.json({
      success: true,
      message: 'Settings updated successfully',
      data: {
        points_per_minute: Number(updated[0].points_per_minute),
        session_bonus_threshold: Number(updated[0].session_bonus_threshold),
        session_bonus_points: Number(updated[0].session_bonus_points),
        usage_reward_daily_limit_count: Number(updated[0].usage_reward_daily_limit_count || 2),
        usage_reward_daily_max_points:
          Number(updated[0].session_bonus_points) * Number(updated[0].usage_reward_daily_limit_count || 2),
        usage_reward_reset_time: '00:00',
        daily_login_bonus: Number(updated[0].daily_login_bonus),
        daily_login_bonus_3x_threshold: Number(updated[0].daily_login_bonus_3x_threshold),
        daily_login_bonus_3x_multiplier: Number(updated[0].daily_login_bonus_3x_multiplier),
        streak_milestone_bonus: Number(updated[0].streak_milestone_bonus),
        streak_milestone_days: Number(updated[0].streak_milestone_days || 30),
        profile_completion_points: Number(updated[0].profile_completion_points || 50),
        post_activity_points: Number(updated[0].post_activity_points || 10),
        post_activity_required_posts: Number(updated[0].post_activity_required_posts || 2),
        comment_activity_points: Number(updated[0].comment_activity_points || 2),
        comment_activity_daily_limit_count: Number(updated[0].comment_activity_daily_limit_count || 5),
        share_activity_points: Number(updated[0].share_activity_points || 10),
      }
    });
  } catch (error) {
    console.error('Failed to update reward settings:', error);
    return res.status(500).json({ error: 'Failed to update settings' });
  } finally {
    if (conn) conn.release();
  }
};

// ============================================================
// BONUS EVENTS MANAGEMENT
// ============================================================

/**
 * GET /api/admin/bonus-events
 * ดึงรายการอีเว้นแจกแต้มทั้งหมด
 */
exports.getBonusEvents = async (req, res) => {
  let conn;
  try {
    conn = await pool.connect();
    const { rows: events } = await conn.query(
      `SELECT * FROM bonus_events WHERE is_deleted = 0 ORDER BY created_at DESC`
    );

    conn.release();
    return res.json({
      success: true,
      data: events.map(e => ({
        event_id: Number(e.event_id),
        event_name: e.event_name,
        event_type: e.event_type,
        points_awarded: Number(e.points_awarded),
        description: e.description,
        start_date: e.start_date,
        end_date: e.end_date,
        is_active: Boolean(e.is_active),
        max_points_per_user: e.max_points_per_user ? Number(e.max_points_per_user) : null,
        bonus_type: e.bonus_type,
        created_at: e.created_at,
      }))
    });
  } catch (error) {
    console.error('Failed to get bonus events:', error);
    return res.status(500).json({ error: 'Failed to get events' });
  } finally {
    if (conn) conn.release();
  }
};

/**
 * POST /api/admin/update-user-points
 * Update user's total points
 */
exports.updateUserPoints = async (req, res) => {
  let conn;
  try {
    const { userId, totalPoints } = req.body;
    
    if (!userId || totalPoints === undefined) {
      return res.status(400).json({ error: 'Missing userId or totalPoints' });
    }

    conn = await pool.connect();

    // Verify user exists and get current points
    const { rows: userRows } = await conn.query(
      'SELECT user_id, total_points, full_name, phone_number FROM users WHERE user_id = $1 LIMIT 1',
      [userId]
    );

    if (!userRows || userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const oldPoints = Number(userRows[0].total_points || 0);
    const newPoints = Math.floor(Number(totalPoints));
    const pointsDifference = newPoints - oldPoints;

    // Update user points
    await conn.query(
      'UPDATE users SET total_points = $1 WHERE user_id = $2',
      [newPoints, userId]
    );

    // Create points_transactions table if not exists
    await conn.query(
      `CREATE TABLE IF NOT EXISTS points_transactions (
        transaction_id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        source_type VARCHAR(50) DEFAULT 'admin',
        points DECIMAL(10,2) NOT NULL,
        type VARCHAR(10) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    );

    // Log to points_transactions
    await conn.query(
      `INSERT INTO points_transactions (user_id, source_type, points, type) VALUES ($1, $2, $3, $4)`,
      [userId, 'admin', pointsDifference, pointsDifference > 0 ? 'add' : 'deduct']
    );

    // Log security event
    await logSecurityEvent(conn, {
      eventType: 'admin_update_points',
      actorName: req.admin?.name || 'Unknown Admin',
      actorPhone: req.admin?.phone || '-',
      targetName: userRows[0].full_name || '-',
      targetPhone: userRows[0].phone_number || '-',
      detail: `Updated points from ${oldPoints} to ${newPoints} (${pointsDifference > 0 ? '+' : ''}${pointsDifference})`
    });

    conn.release();
    return res.json({
      success: true,
      message: 'Points updated successfully',
      data: {
        userId,
        oldPoints,
        newPoints,
        difference: pointsDifference
      }
    });
  } catch (error) {
    console.error('Failed to update user points:', error);
    return res.status(500).json({ error: 'Failed to update points' });
  } finally {
    if (conn) conn.release();
  }
};

/**
 * GET /api/admin/point-history - Fetch all point transactions
 * Query params: limit, offset
 */
exports.getPointTransactionHistory = async (req, res) => {
  let conn;
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;

    conn = await pool.connect();

    // Ensure transactions table exists
    await conn.query(
      `CREATE TABLE IF NOT EXISTS points_transactions (
        transaction_id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        source_type VARCHAR(50) DEFAULT 'admin',
        points DECIMAL(10,2) NOT NULL,
        type VARCHAR(10) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    );

    // Get transactions with user info
    const { rows: transactions } = await conn.query(
      `SELECT
        pt.transaction_id,
        pt.user_id,
        pt.source_type,
        pt.points,
        pt.type,
        pt.created_at,
        u.phone_number,
        u.full_name
       FROM points_transactions pt
       LEFT JOIN users u ON pt.user_id = u.user_id
       ORDER BY pt.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    // Get total count
    const countResult = await conn.query(
      'SELECT COUNT(*) as total FROM points_transactions'
    );
    const total = countResult.rows[0]?.total || 0;

    conn.release();

    return res.json({
      success: true,
      data: transactions.map(t => ({
        transaction_id: t.transaction_id,
        user_id: t.user_id,
        phone_number: t.phone_number || '-',
        full_name: t.full_name || 'ผู้ใช้งาน',
        source_type: t.source_type,
        points: Number(t.points),
        type: t.type, // 'add' or 'deduct'
        created_at: t.created_at,
        badge: t.type === 'add' ? '✅ ได้รับแต้ม' : '❌ ใช้แต้ม/หักแต้ม'
      })),
      pagination: {
        limit,
        offset,
        total,
        pages: Math.ceil(total / limit),
        hasMore: offset + limit < total
      }
    });
  } catch (error) {
    console.error('Failed to get point transaction history:', error);
    return res.status(500).json({ error: 'Failed to get transaction history' });
  } finally {
    if (conn) conn.release();
  }
};

/**
 * GET /api/admin/user/:userId/points-history
 * Get user's points history
 */
exports.getUserPointsHistory = async (req, res) => {
  let conn;
  try {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    conn = await pool.connect();

    // Check if points_transactions table exists
    const { rows: tables } = await conn.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema()
       AND table_name = 'points_transactions'`
    );

    if (!tables || tables.length === 0) {
      // Create table if not exists
      await conn.query(
        `CREATE TABLE IF NOT EXISTS points_transactions (
          transaction_id SERIAL PRIMARY KEY,
          user_id INT NOT NULL,
          source_type VARCHAR(50) DEFAULT 'admin',
          points DECIMAL(10,2) NOT NULL,
          type VARCHAR(10) NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`
      );
    }

    // Get points history
    const { rows: history } = await conn.query(
      `SELECT transaction_id, user_id, source_type, points, type, created_at
       FROM points_transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId]
    );

    conn.release();
    return res.json({
      success: true,
      data: history.map(h => ({
        transactionId: Number(h.transaction_id),
        userId: Number(h.user_id),
        sourceType: h.source_type || 'admin',
        points: Number(h.points),
        type: h.type || 'add',
        created_at: h.created_at
      }))
    });
  } catch (error) {
    console.error('Failed to get points history:', error);
    return res.status(500).json({ error: 'Failed to get history' });
  } finally {
    if (conn) conn.release();
  }
};

/**
 * GET /api/admin/points-transactions-history
 * Get all points transactions for admin dashboard with user details
 */
exports.getPointsTransactionsHistory = async (req, res) => {
  let conn;
  try {
    conn = await pool.connect();

    // Check if points_transactions table exists
    const { rows: tables } = await conn.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema()
       AND table_name = 'points_transactions'`
    );

    if (!tables || tables.length === 0) {
      // Create table if not exists
      await conn.query(
        `CREATE TABLE IF NOT EXISTS points_transactions (
          transaction_id SERIAL PRIMARY KEY,
          user_id INT NOT NULL,
          source_type VARCHAR(50) DEFAULT 'admin',
          points DECIMAL(10,2) NOT NULL,
          type VARCHAR(10) NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`
      );
      conn.release();
      return res.json({ success: true, data: [] });
    }

    // Get points transactions with user details
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const { rows: transactions } = await conn.query(
      `SELECT
        pt.transaction_id,
        pt.user_id,
        pt.source_type,
        pt.points,
        pt.type,
        pt.created_at,
        u.phone_number,
        u.full_name
       FROM points_transactions pt
       JOIN users u ON u.user_id = pt.user_id
       ORDER BY pt.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    conn.release();
    return res.json({
      success: true,
      data: transactions.map(t => ({
        transactionId: Number(t.transaction_id),
        userId: Number(t.user_id),
        phone_number: t.phone_number || '-',
        full_name: t.full_name || 'ผู้ใช้งาน',
        source_type: t.source_type || 'admin',
        points: Number(t.points),
        type: t.type || 'add',
        created_at: t.created_at
      }))
    });
  } catch (error) {
    console.error('Failed to get points transactions history:', error);
    return res.status(500).json({ error: 'Failed to get transaction history' });
  } finally {
    if (conn) conn.release();
  }
};

/**
 * สร้างอีเว้นแจกแต้มใหม่
 */
exports.createBonusEvent = async (req, res) => {
  let conn;
  try {
    const {
      event_name,
      event_type, // login_bonus, usage_bonus, special_event
      points_awarded,
      description,
      start_date,
      end_date,
      is_active = true,
      max_points_per_user,
      bonus_type = 'one_time' // one_time, recurring_daily
    } = req.body;

    // Validate required fields
    if (!event_name || !event_type || typeof points_awarded !== 'number' || !start_date || !end_date) {
      return res.status(400).json({
        error: 'Missing required fields: event_name, event_type, points_awarded, start_date, end_date'
      });
    }

    conn = await pool.connect();

    const result = await conn.query(
      `INSERT INTO bonus_events (
        event_name, event_type, points_awarded, description,
        start_date, end_date, is_active, max_points_per_user, bonus_type, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING event_id`,
      [
        event_name,
        event_type,
        points_awarded,
        description || null,
        start_date,
        end_date,
        is_active ? 1 : 0,
        max_points_per_user || null,
        bonus_type,
        req.admin?.sub || null
      ]
    );

    conn.release();
    return res.json({
      success: true,
      message: 'Event created successfully',
      event_id: Number(result.rows[0].event_id)
    });
  } catch (error) {
    console.error('Failed to create bonus event:', error);
    return res.status(500).json({ error: 'Failed to create event' });
  } finally {
    if (conn) conn.release();
  }
};

/**
 * PUT /api/admin/bonus-events/:id
 * อัปเดตอีเว้นแจกแต้ม
 */
exports.updateBonusEvent = async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    const updates = req.body;

    conn = await pool.connect();

    // Check if event exists
    const { rows: event } = await conn.query(
      'SELECT event_id FROM bonus_events WHERE event_id = $1 AND is_deleted = 0',
      [id]
    );

    if (!event.length) {
      conn.release();
      return res.status(404).json({ error: 'Event not found' });
    }

    // Build dynamic update query
    let paramIdx = 1;
    const updateFields = [];
    const values = [];

    if (updates.event_name) {
      updateFields.push(`event_name = $${paramIdx++}`);
      values.push(updates.event_name);
    }
    if (updates.event_type) {
      updateFields.push(`event_type = $${paramIdx++}`);
      values.push(updates.event_type);
    }
    if (typeof updates.points_awarded !== 'undefined') {
      updateFields.push(`points_awarded = $${paramIdx++}`);
      values.push(updates.points_awarded);
    }
    if (updates.description !== undefined) {
      updateFields.push(`description = $${paramIdx++}`);
      values.push(updates.description || null);
    }
    if (updates.start_date) {
      updateFields.push(`start_date = $${paramIdx++}`);
      values.push(updates.start_date);
    }
    if (updates.end_date) {
      updateFields.push(`end_date = $${paramIdx++}`);
      values.push(updates.end_date);
    }
    if (typeof updates.is_active !== 'undefined') {
      updateFields.push(`is_active = $${paramIdx++}`);
      values.push(updates.is_active ? 1 : 0);
    }
    if (updates.max_points_per_user !== undefined) {
      updateFields.push(`max_points_per_user = $${paramIdx++}`);
      values.push(updates.max_points_per_user || null);
    }
    if (updates.bonus_type) {
      updateFields.push(`bonus_type = $${paramIdx++}`);
      values.push(updates.bonus_type);
    }

    if (updateFields.length === 0) {
      conn.release();
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);

    await conn.query(
      `UPDATE bonus_events SET ${updateFields.join(', ')} WHERE event_id = $${paramIdx}`,
      values
    );

    conn.release();
    return res.json({
      success: true,
      message: 'Event updated successfully'
    });
  } catch (error) {
    console.error('Failed to update bonus event:', error);
    return res.status(500).json({ error: 'Failed to update event' });
  } finally {
    if (conn) conn.release();
  }
};

/**
 * DELETE /api/admin/bonus-events/:id
 * ลบอีเว้นแจกแต้ม
 */
exports.deleteBonusEvent = async (req, res) => {
  let conn;
  try {
    const { id } = req.params;

    conn = await pool.connect();

    // Check if event exists
    const { rows: event } = await conn.query(
      'SELECT event_id FROM bonus_events WHERE event_id = $1 AND is_deleted = 0',
      [id]
    );

    if (!event.length) {
      conn.release();
      return res.status(404).json({ error: 'Event not found' });
    }

    await conn.query('UPDATE bonus_events SET is_deleted = 1 WHERE event_id = $1', [id]);

    conn.release();
    return res.json({
      success: true,
      message: 'Event deleted successfully'
    });
  } catch (error) {
    console.error('Failed to delete bonus event:', error);
    return res.status(500).json({ error: 'Failed to delete event' });
  } finally {
    if (conn) conn.release();
  }
};

/**
 * GET /api/admin/rewards
 * ดึงรายชื่อรางวัลทั้งหมด พร้อม pagination
 */
exports.getAllRewards = async (req, res) => {
  let conn;
  try {
    const { page = 1, limit = 20, partner_id } = req.query;
    const offset = (page - 1) * limit;

    conn = await pool.connect();
    await ensureRewardColumns(conn);

    // Get total count
    const countResult = await conn.query(
      `SELECT COUNT(*) as total FROM rewards WHERE is_deleted = 0${partner_id ? ' AND partner_id = $1' : ''}`,
      partner_id ? [parseInt(partner_id)] : []
    );
    const total = Number(countResult.rows[0]?.total || 0);

    // Get rewards with pagination.
    // Use a derived table for redemption counts so the query works correctly.
    let rewardsQuery, rewardsParams;
    if (partner_id) {
      rewardsQuery = `SELECT r.reward_id, r.reward_name, r.required_points,
            r.description, r.image_url, r.category,
              r.expiry_date, r.is_active, r.stock, r.user_limit, r.campaign_start_date, r.campaign_end_date,
              r.created_at, r.updated_at, r.partner_id,
              COALESCE(rc.redemption_count, 0) AS redemption_count
       FROM rewards r
       LEFT JOIN (
         SELECT reward_id, COUNT(*) AS redemption_count
         FROM reward_redemption_history
         GROUP BY reward_id
       ) rc ON r.reward_id = rc.reward_id
       WHERE r.is_deleted = 0 AND r.partner_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`;
      rewardsParams = [parseInt(partner_id), parseInt(limit), parseInt(offset)];
    } else {
      rewardsQuery = `SELECT r.reward_id, r.reward_name, r.required_points,
            r.description, r.image_url, r.category,
              r.expiry_date, r.is_active, r.stock, r.user_limit, r.campaign_start_date, r.campaign_end_date,
              r.created_at, r.updated_at, r.partner_id,
              COALESCE(rc.redemption_count, 0) AS redemption_count
       FROM rewards r
       LEFT JOIN (
         SELECT reward_id, COUNT(*) AS redemption_count
         FROM reward_redemption_history
         GROUP BY reward_id
       ) rc ON r.reward_id = rc.reward_id
       WHERE r.is_deleted = 0
       ORDER BY r.created_at DESC
       LIMIT $1 OFFSET $2`;
      rewardsParams = [parseInt(limit), parseInt(offset)];
    }
    const { rows: rewards } = await conn.query(rewardsQuery, rewardsParams);

    // Convert BigInt values to Number for JSON serialization
    const rewardsWithConvertedTypes = rewards.map(reward => ({
      ...reward,
      reward_id: Number(reward.reward_id),
      required_points: Number(reward.required_points),
      is_active: Number(reward.is_active),
      stock: Number(reward.stock),
      user_limit: Number(reward.user_limit),
      campaign_start_date: reward.campaign_start_date,
      campaign_end_date: reward.campaign_end_date,
      redemption_count: Number(reward.redemption_count)
    }));

    conn.release();

    return res.json({
      success: true,
      data: rewardsWithConvertedTypes,
      pagination: {
        total: Number(total),
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(Number(total) / limit)
      }
    });
  } catch (error) {
    console.error('Failed to get rewards:', error);
    return res.status(500).json({ error: 'Failed to get rewards' });
  } finally {
    if (conn) conn.release();
  }
};

/**
 * GET /api/admin/rewards/:id
 * ดึงข้อมูลรางวัลแต่ละรายการ
 */
exports.getRewardDetail = async (req, res) => {
  let conn;
  try {
    const { id } = req.params;

    conn = await pool.connect();
    await ensureRewardColumns(conn);

    const { rows: reward } = await conn.query(
      `SELECT r.reward_id, r.reward_name, r.required_points, r.description, r.image_url, r.category,
              r.expiry_date, r.is_active, r.stock, r.user_limit, r.created_at, r.updated_at,
              r.campaign_start_date, r.campaign_end_date, r.usage_instructions, r.validity_hours,
              COALESCE(rc.redemption_count, 0) AS redemption_count
       FROM rewards r
       LEFT JOIN (
         SELECT reward_id, COUNT(*) AS redemption_count
         FROM reward_redemption_history
         GROUP BY reward_id
       ) rc ON r.reward_id = rc.reward_id
       WHERE r.reward_id = $1 AND r.is_deleted = 0`,
      [id]
    );

    conn.release();

    if (!reward.length) {
      return res.status(404).json({ error: 'Reward not found' });
    }

    // Convert BigInt values to Number for JSON serialization
    const rewardData = reward[0];
    const convertedReward = {
      ...rewardData,
      reward_id: Number(rewardData.reward_id),
      required_points: Number(rewardData.required_points),
      is_active: Number(rewardData.is_active),
      stock: Number(rewardData.stock),
      user_limit: Number(rewardData.user_limit),
      redemption_count: Number(rewardData.redemption_count)
    };

    return res.json({
      success: true,
      data: convertedReward
    });
  } catch (error) {
    console.error('Failed to get reward:', error);
    return res.status(500).json({ error: 'Failed to get reward' });
  } finally {
    if (conn) conn.release();
  }
};

/**
 * POST /api/admin/rewards
 * สร้างรางวัลใหม่
 */
exports.createReward = async (req, res) => {
  let conn;
  try {
    let {
      reward_name,
      required_points,
      description,
      category,
      expiry_date,
      is_active = true,
      stock = 0,
      user_limit = -1,
      campaign_start_date,
      campaign_end_date,
      usage_instructions,
      validity_hours,
      partner_id: partner_id_raw
    } = req.body;
    const partner_id = partner_id_raw ? parseInt(partner_id_raw, 10) || null : null;

    // Parse FormData fields (they arrive as strings)
    required_points = parseInt(required_points, 10);
    stock = parseInt(stock, 10) || 0;
    user_limit = parseInt(user_limit, 10) || -1;
    validity_hours = parseInt(validity_hours, 10) || 1;
    is_active = is_active === '1' || is_active === true;

    // Validate required fields
    if (!reward_name || isNaN(required_points) || required_points < 1) {
      // Delete uploaded file if validation fails
      if (req.file) {
        const fs = require('fs');
        const path = require('path');
        fs.unlink(path.join(__dirname, '../uploads/rewards/', req.file.filename), (err) => {
          if (err) console.error('Error deleting file:', err);
        });
      }
      return res.status(400).json({
        error: 'Missing required fields: reward_name, required_points'
      });
    }

    conn = await pool.connect();
    await ensureRewardColumns(conn);

    // Handle image file
    let imagePath = null;
    if (req.file) {
      imagePath = `/uploads/rewards/${req.file.filename}`;
    }

    const result = await conn.query(
      `INSERT INTO rewards (reward_name, required_points, description, image_url, category, expiry_date, is_active, stock, user_limit, campaign_start_date, campaign_end_date, usage_instructions, validity_hours, partner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING reward_id`,
      [
        reward_name,
        required_points,
        description || null,
        imagePath,
        category || null,
        expiry_date || null,
        is_active ? 1 : 0,
        stock || 0,
        user_limit !== undefined ? user_limit : -1,
        campaign_start_date || null,
        campaign_end_date || null,
        usage_instructions || null,
        validity_hours || 1,
        partner_id || null
      ]
    );

    conn.release();

    return res.json({
      success: true,
      message: 'Reward created successfully',
      reward_id: Number(result.rows[0].reward_id),
      image_url: imagePath
    });
  } catch (error) {
    console.error('Failed to create reward:', error);
    
    // Delete uploaded file on error
    if (req.file) {
      const fs = require('fs');
      const path = require('path');
      fs.unlink(path.join(__dirname, '../uploads/rewards/', req.file.filename), (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    
    return res.status(500).json({ error: 'Failed to create reward: ' + error.message });
  } finally {
    if (conn) conn.release();
  }
};

/**
 * PUT /api/admin/rewards/:id
 * แก้ไขรางวัล
 */
exports.updateReward = async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    const updates = req.body;

    conn = await pool.connect();

    // Check if reward exists
    const { rows: reward } = await conn.query(
      'SELECT reward_id, image_url FROM rewards WHERE reward_id = $1 AND is_deleted = 0',
      [id]
    );

    if (!reward.length) {
      conn.release();
      // Delete uploaded file if reward not found
      if (req.file) {
        const fs = require('fs');
        const path = require('path');
        fs.unlink(path.join(__dirname, '../uploads/rewards/', req.file.filename), (err) => {
          if (err) console.error('Error deleting file:', err);
        });
      }
      return res.status(404).json({ error: 'Reward not found' });
    }

    // Build dynamic update query
    let paramIdx = 1;
    const updateFields = [];
    const values = [];

    // Handle FormData fields (sent from frontend as form data)
    if (updates.reward_name !== undefined && updates.reward_name !== '') {
      updateFields.push(`reward_name = $${paramIdx++}`);
      values.push(updates.reward_name);
    }
    if (updates.required_points !== undefined && updates.required_points !== '') {
      const points = parseInt(updates.required_points);
      if (!isNaN(points)) {
        updateFields.push(`required_points = $${paramIdx++}`);
        values.push(points);
      }
    }
    if (updates.description !== undefined) {
      updateFields.push(`description = $${paramIdx++}`);
      values.push(updates.description && updates.description !== '' ? updates.description : null);
    }

    // Handle image file upload
    if (req.file) {
      // Delete old image file if it exists
      if (reward[0].image_url) {
        const fs = require('fs');
        const path = require('path');
        const oldFilePath = path.join(__dirname, '../', reward[0].image_url);
        fs.unlink(oldFilePath, (err) => {
          if (err) console.error('Error deleting old file:', err);
        });
      }
      // Update with new image path
      updateFields.push(`image_url = $${paramIdx++}`);
      values.push(`/uploads/rewards/${req.file.filename}`);
    }

    if (updates.category !== undefined) {
      updateFields.push(`category = $${paramIdx++}`);
      values.push(updates.category && updates.category !== '' ? updates.category : null);
    }
    if (updates.expiry_date !== undefined) {
      updateFields.push(`expiry_date = $${paramIdx++}`);
      values.push(updates.expiry_date && updates.expiry_date !== '' ? updates.expiry_date : null);
    }
    if (updates.is_active !== undefined && updates.is_active !== '') {
      // Handle both boolean and string '0'/'1' from FormData
      const isActive = typeof updates.is_active === 'boolean' ? updates.is_active : (updates.is_active === '1' || updates.is_active === 1);
      updateFields.push(`is_active = $${paramIdx++}`);
      values.push(isActive ? 1 : 0);
    }
    if (updates.stock !== undefined && updates.stock !== '' && updates.stock !== null) {
      const stock = parseInt(updates.stock);
      if (!isNaN(stock) && stock >= 0) {
        updateFields.push(`stock = $${paramIdx++}`);
        values.push(stock);
      }
    }
    if (updates.user_limit !== undefined && updates.user_limit !== '') {
      const userLimit = parseInt(updates.user_limit);
      if (!isNaN(userLimit)) {
        updateFields.push(`user_limit = $${paramIdx++}`);
        values.push(userLimit);
      }
    }
    if (updates.campaign_start_date !== undefined) {
      updateFields.push(`campaign_start_date = $${paramIdx++}`);
      values.push(updates.campaign_start_date && updates.campaign_start_date !== '' ? updates.campaign_start_date : null);
    }
    if (updates.campaign_end_date !== undefined) {
      updateFields.push(`campaign_end_date = $${paramIdx++}`);
      values.push(updates.campaign_end_date && updates.campaign_end_date !== '' ? updates.campaign_end_date : null);
    }
    if (updates.usage_instructions !== undefined) {
      updateFields.push(`usage_instructions = $${paramIdx++}`);
      values.push(updates.usage_instructions && updates.usage_instructions !== '' ? updates.usage_instructions : null);
    }
    if (updates.validity_hours !== undefined && updates.validity_hours !== '') {
      const validityHours = parseInt(updates.validity_hours);
      if (!isNaN(validityHours) && validityHours >= 1) {
        updateFields.push(`validity_hours = $${paramIdx++}`);
        values.push(validityHours);
      }
    }

    if (updateFields.length === 0) {
      conn.release();
      // Delete uploaded file if no updates
      if (req.file) {
        const fs = require('fs');
        const path = require('path');
        fs.unlink(path.join(__dirname, '../uploads/rewards/', req.file.filename), (err) => {
          if (err) console.error('Error deleting file:', err);
        });
      }
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateFields.push(`updated_at = NOW()`);
    values.push(id);

    await conn.query(
      `UPDATE rewards SET ${updateFields.join(', ')} WHERE reward_id = $${paramIdx}`,
      values
    );

    conn.release();

    return res.json({
      success: true,
      message: 'Reward updated successfully',
      image_url: req.file ? `/uploads/rewards/${req.file.filename}` : (reward[0].image_url || null)
    });
  } catch (error) {
    console.error('Failed to update reward:', error);
    
    // Delete uploaded file on error
    if (req.file) {
      const fs = require('fs');
      const path = require('path');
      fs.unlink(path.join(__dirname, '../uploads/rewards/', req.file.filename), (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    
    return res.status(500).json({ error: 'Failed to update reward: ' + error.message });
  } finally {
    if (conn) conn.release();
  }
};

/**
 * DELETE /api/admin/rewards/:id
 * ลบรางวัล
 */
exports.deleteReward = async (req, res) => {
  let conn;
  try {
    const { id } = req.params;

    conn = await pool.connect();

    // Check if reward exists
    const { rows: reward } = await conn.query(
      'SELECT reward_id FROM rewards WHERE reward_id = $1 AND is_deleted = 0',
      [id]
    );

    if (!reward.length) {
      conn.release();
      return res.status(404).json({ error: 'Reward not found' });
    }

    // Soft delete the reward
    await conn.query('UPDATE rewards SET is_deleted = 1 WHERE reward_id = $1', [id]);

    conn.release();

    return res.json({
      success: true,
      message: 'Reward deleted successfully'
    });
  } catch (error) {
    console.error('Failed to delete reward:', error);
    return res.status(500).json({ error: 'Failed to delete reward' });
  } finally {
    if (conn) conn.release();
  }
};

/**
 * GET /api/admin/rewards-categories
 * ดึงรายชื่อหมวดหมู่รางวัลทั้งหมด
 */
exports.getRewardCategories = async (req, res) => {
  let conn;
  try {
    conn = await pool.connect();

    const { rows: categories } = await conn.query(
      `SELECT DISTINCT category FROM rewards WHERE category IS NOT NULL AND category != '' AND is_deleted = 0 ORDER BY category`
    );

    conn.release();

    return res.json({
      success: true,
      categories: categories.map(c => c.category)
    });
  } catch (error) {
    console.error('Failed to get categories:', error);
    return res.status(500).json({ error: 'Failed to get categories' });
  } finally {
    if (conn) conn.release();
  }
};

// ========== New: Get All Users (ดึงข้อมูลผู้ใช้ทั้งหมด) ==========
exports.getAllUsers = async (req, res) => {
  let conn;
  try {
    conn = await pool.connect();

    // ดึงข้อมูลผู้ใช้ทั้งหมด (ไม่รวม password)
    const { rows: users } = await conn.query(
      `SELECT
        user_id,
        full_name,
        phone_number,
        role,
        is_verified,
        created_at,
        is_blocked,
        blocked_reason,
        blocked_at,
        profile_picture
      FROM users
      ORDER BY created_at DESC
      LIMIT 1000`
    );

    conn.release();

    return res.json({
      success: true,
      total: users.length,
      users: users
    });
  } catch (error) {
    console.error('Failed to get all users:', error);
    return res.status(500).json({ error: 'Failed to get all users' });
  } finally {
    if (conn) conn.release();
  }
};

// ========== Search Users by Name or Phone ==========
exports.searchUsers = async (req, res) => {
  let conn;
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    conn = await pool.connect();

    const { rows: users } = await conn.query(
      `SELECT
        user_id,
        full_name,
        phone_number,
        role,
        is_verified,
        created_at,
        is_blocked,
        blocked_reason,
        blocked_at,
        profile_picture
      FROM users
      WHERE full_name LIKE $1 OR phone_number LIKE $2
      ORDER BY created_at DESC
      LIMIT 100`,
      [`%${query}%`, `%${query}%`]
    );

    conn.release();

    return res.json({
      success: true,
      total: users.length,
      users: users
    });
  } catch (error) {
    console.error('Failed to search users:', error);
    return res.status(500).json({ error: 'Failed to search users' });
  } finally {
    if (conn) conn.release();
  }
};
