const pool = require('../config/db');
const QRCode = require('qrcode');
const crypto = require('crypto');

const DEFAULT_APP_USAGE_RULE = {
  minutesPerReward: 40,
  pointsPerReward: 8,
  maxRewardsPerDay: 2,
};

const DEFAULT_ACTIVITY_REWARD_RULES = {
  profileCompletionPoints: 50,
  postActivityPoints: 10,
  postActivityRequiredPosts: 2,
  commentActivityPoints: 2,
  commentActivityDailyLimitCount: 5,
  shareActivityPoints: 10,
};

async function ensureRewardSettingsColumns(conn) {
  const columnsToEnsure = [
    {
      name: 'usage_reward_daily_limit_count',
      ddl: 'ADD COLUMN usage_reward_daily_limit_count INT NOT NULL DEFAULT 2',
    },
    {
      name: 'streak_milestone_days',
      ddl: 'ADD COLUMN streak_milestone_days INT NOT NULL DEFAULT 30',
    },
    {
      name: 'profile_completion_points',
      ddl: 'ADD COLUMN profile_completion_points INT NOT NULL DEFAULT 50',
    },
    {
      name: 'post_activity_points',
      ddl: 'ADD COLUMN post_activity_points INT NOT NULL DEFAULT 10',
    },
    {
      name: 'post_activity_required_posts',
      ddl: 'ADD COLUMN post_activity_required_posts INT NOT NULL DEFAULT 2',
    },
    {
      name: 'comment_activity_points',
      ddl: 'ADD COLUMN comment_activity_points INT NOT NULL DEFAULT 2',
    },
    {
      name: 'comment_activity_daily_limit_count',
      ddl: 'ADD COLUMN comment_activity_daily_limit_count INT NOT NULL DEFAULT 5',
    },
    {
      name: 'share_activity_points',
      ddl: 'ADD COLUMN share_activity_points INT NOT NULL DEFAULT 10',
    },
  ];

  for (const col of columnsToEnsure) {
    const { rows } = await conn.query(
      `SELECT COUNT(*) AS total
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE table_schema = current_schema()
         AND TABLE_NAME = 'reward_settings'
         AND COLUMN_NAME = $1`,
      [col.name]
    );

    if (Number(rows[0]?.total || 0) === 0) {
      await conn.query(`ALTER TABLE reward_settings ${col.ddl}`);
    }
  }
}

async function getAppUsageRule(conn) {
  await ensureRewardSettingsColumns(conn);

  const { rows: settings } = await conn.query(
    `SELECT session_bonus_threshold, session_bonus_points, usage_reward_daily_limit_count
     FROM reward_settings WHERE setting_id = 1 LIMIT 1`
  );

  if (!settings.length) {
    return {
      ...DEFAULT_APP_USAGE_RULE,
      maxDailyPoints:
        DEFAULT_APP_USAGE_RULE.pointsPerReward * DEFAULT_APP_USAGE_RULE.maxRewardsPerDay,
    };
  }

  const row = settings[0];
  const minutesPerReward = Math.max(
    1,
    Number(row.session_bonus_threshold || DEFAULT_APP_USAGE_RULE.minutesPerReward)
  );
  const pointsPerReward = Math.max(
    1,
    Number(row.session_bonus_points || DEFAULT_APP_USAGE_RULE.pointsPerReward)
  );
  const maxRewardsPerDay = Math.max(
    1,
    Number(
      row.usage_reward_daily_limit_count || DEFAULT_APP_USAGE_RULE.maxRewardsPerDay
    )
  );

  return {
    minutesPerReward,
    pointsPerReward,
    maxRewardsPerDay,
    maxDailyPoints: pointsPerReward * maxRewardsPerDay,
  };
}

async function getActivityRewardRules(conn) {
  await ensureRewardSettingsColumns(conn);

  const { rows: settings } = await conn.query(
    `SELECT
      profile_completion_points,
      post_activity_points,
      post_activity_required_posts,
      comment_activity_points,
      comment_activity_daily_limit_count,
      share_activity_points
     FROM reward_settings
     WHERE setting_id = 1
     LIMIT 1`
  );

  if (!settings.length) {
    return { ...DEFAULT_ACTIVITY_REWARD_RULES };
  }

  const row = settings[0];
  return {
    profileCompletionPoints: Math.max(
      0,
      Number(
        row.profile_completion_points ??
          DEFAULT_ACTIVITY_REWARD_RULES.profileCompletionPoints
      )
    ),
    postActivityPoints: Math.max(
      0,
      Number(row.post_activity_points ?? DEFAULT_ACTIVITY_REWARD_RULES.postActivityPoints)
    ),
    postActivityRequiredPosts: Math.max(
      1,
      Number(
        row.post_activity_required_posts ??
          DEFAULT_ACTIVITY_REWARD_RULES.postActivityRequiredPosts
      )
    ),
    commentActivityPoints: Math.max(
      0,
      Number(
        row.comment_activity_points ??
          DEFAULT_ACTIVITY_REWARD_RULES.commentActivityPoints
      )
    ),
    commentActivityDailyLimitCount: Math.max(
      1,
      Number(
        row.comment_activity_daily_limit_count ??
          DEFAULT_ACTIVITY_REWARD_RULES.commentActivityDailyLimitCount
      )
    ),
    shareActivityPoints: Math.max(
      0,
      Number(row.share_activity_points ?? DEFAULT_ACTIVITY_REWARD_RULES.shareActivityPoints)
    ),
  };
}

async function ensureShareActivityRewardsTable(conn) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS share_activity_rewards (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      phone_number VARCHAR(20),
      reward_date DATE NOT NULL,
      shared_post_id INT NOT NULL,
      points_awarded INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, shared_post_id),
      CONSTRAINT fk_share_activity_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
      CONSTRAINT fk_share_activity_post FOREIGN KEY (shared_post_id) REFERENCES posts(post_id) ON DELETE CASCADE
    )`
  );
}

async function getRewardsSchema(conn) {
  const { rows: columns } = await conn.query(
    `SELECT column_name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE table_schema = current_schema() AND TABLE_NAME = 'rewards'`
  );

  const colSet = new Set(columns.map((c) => c.column_name));
  const pointsColumn = colSet.has('reward_point')
    ? 'reward_point'
    : colSet.has('required_points')
        ? 'required_points'
        : colSet.has('points_required')
            ? 'points_required'
            : null;

  return {
    pointsColumn,
    hasDescription: colSet.has('description'),
    hasImageUrl: colSet.has('image_url'),
    hasCategory: colSet.has('category'),
    hasQuantity: colSet.has('quantity'),
    hasExpiryDate: colSet.has('expiry_date'),
    hasUsageInstructions: colSet.has('usage_instructions'),
  };
}

async function getUserRewardsSchema(conn) {
  const { rows: columns } = await conn.query(
    `SELECT column_name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE table_schema = current_schema() AND TABLE_NAME = 'user_rewards'`
  );

  const colSet = new Set(columns.map((c) => c.column_name));
  return {
    hasQuantity: colSet.has('quantity'),
    hasRedeemedAt: colSet.has('redeemed_at'),
  };
}

function toBangkokDateString(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  }
  return String(value).slice(0, 10);
}

// helper — ดึงวันที่ปัจจุบันและเมื่อวานตาม timezone Bangkok (+07:00)
async function getBangkokDates(conn) {
  const { rows } = await conn.query(`
    SELECT
      CURRENT_DATE                              AS today,
      (CURRENT_DATE - INTERVAL '1 day')         AS yesterday
  `);
  return {
    today: toBangkokDateString(rows[0].today),
    yesterday: toBangkokDateString(rows[0].yesterday),
  };
}

async function getTodayAppUsageAwardedPoints(conn, userId, today) {
  const { rows } = await conn.query(
    `SELECT COALESCE(SUM(points), 0) AS total
     FROM points_transactions
     WHERE user_id = $1
       AND source_type = 'app_time'
       AND DATE(created_at) = $2`,
    [userId, today]
  );

  return Number(rows[0]?.total || 0);
}

// รวมนาทีทั้งหมดที่ใช้งานแอพในวันนี้ (ทุก session รวมกัน)
async function getTodayTotalElapsedMinutes(conn, userId, today) {
  const { rows } = await conn.query(
    `SELECT COALESCE(SUM(
       CASE
         WHEN ended_at IS NOT NULL THEN COALESCE(duration_minutes, 0)
         ELSE EXTRACT(EPOCH FROM (NOW() - started_at)) / 60
       END
     ), 0) AS today_total
     FROM app_sessions
     WHERE user_id = $1
       AND DATE(started_at) = $2`,
    [userId, today]
  );
  return Number(rows[0]?.today_total || 0);
}

// Points accrue against total time used *today* (summed across every
// session), not just the currently-open session — otherwise opening and
// closing the app resets progress and a user can rack up hours without
// ever crossing a single reward threshold.
function computeUsageRewardState({
  todayTotalElapsedMinutes,
  todayUsageAwardedPoints,
  usageRule,
}) {
  const totalEligibleRewards = Math.floor(todayTotalElapsedMinutes / usageRule.minutesPerReward);
  const targetDailyPoints = Math.min(
    totalEligibleRewards * usageRule.pointsPerReward,
    usageRule.maxDailyPoints
  );
  const newPointsToAward = Math.max(0, targetDailyPoints - todayUsageAwardedPoints);

  const totalAwardedTodayAfter = todayUsageAwardedPoints + newPointsToAward;
  const dailyLimitReached = totalAwardedTodayAfter >= usageRule.maxDailyPoints;

  const minutesIntoCycle = todayTotalElapsedMinutes % usageRule.minutesPerReward;
  const minutesToNextReward = dailyLimitReached
    ? 0
    : minutesIntoCycle == 0
      ? usageRule.minutesPerReward
      : usageRule.minutesPerReward - minutesIntoCycle;

  return {
    newPointsToAward,
    minutesToNextReward,
    dailyLimitReached,
    totalAwardedTodayAfter,
    totalEligibleRewards,
    targetDailyPoints,
  };
}

// ============================================================
// POST /api/rewards/checkin
// ล็อคอินรายวัน — ได้ daily_login_bonus แต้ม (ตั้งค่าจาก admin)
// streak >= threshold = คูณ multiplier จาก admin
// ติดต่อกัน 10 วัน = โบนัส +2 แต้ม  |  รีเซ็ตเที่ยงคืนไทย
// ============================================================
exports.dailyCheckin = async (req, res) => {
  const { phone_number } = req.body;
  if (!phone_number) return res.status(400).json({ error: 'phone_number required' });

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');

    const { today, yesterday } = await getBangkokDates(conn);

    // Fetch reward settings for daily_login_bonus
    const { rows: rewardSettings } = await conn.query(
      'SELECT daily_login_bonus, daily_login_bonus_3x_threshold, daily_login_bonus_3x_multiplier, streak_milestone_days, streak_milestone_bonus FROM reward_settings WHERE setting_id = 1'
    );
    const dailyLoginBonus = rewardSettings.length ? Number(rewardSettings[0].daily_login_bonus || 5) : 5;
    const streakThreshold = rewardSettings.length ? Number(rewardSettings[0].daily_login_bonus_3x_threshold || 30) : 30;
    const streakMultiplier = rewardSettings.length ? Number(rewardSettings[0].daily_login_bonus_3x_multiplier || 1.2) : 1.2;
    const streakMilestoneDay = rewardSettings.length ? Number(rewardSettings[0].streak_milestone_days || 30) : 30;
    const streakMilestoneBonus = rewardSettings.length ? Number(rewardSettings[0].streak_milestone_bonus || 2) : 2;

    // FOR UPDATE — lock row กันกด race condition พร้อมกัน
    const { rows: users } = await conn.query(
      'SELECT user_id, login_streak, last_checkin_date, total_points FROM users WHERE phone_number = $1 FOR UPDATE',
      [phone_number]
    );
    if (!users.length) {
      await conn.query('ROLLBACK'); conn.release();
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];
    const userId = user.user_id;
    const lastDate = toBangkokDateString(user.last_checkin_date);

    // ตรวจซ้ำหลัง lock — กันกรณี request พร้อมกัน 2 ตัว
    if (lastDate === today) {
      await conn.query('ROLLBACK'); conn.release();
      return res.json({
        already_checked: true,
        message: 'เช็คอินวันนี้แล้ว',
        login_streak: Number(user.login_streak),
        total_points: Number(user.total_points),
      });
    }

    // คำนวณ streak
    const isConsecutive = lastDate === yesterday;
    const newStreak = isConsecutive ? Number(user.login_streak) + 1 : 1;

    // คำนวณแต้ม — ใช้ daily_login_bonus จาก settings
    let basePoints = dailyLoginBonus;
    if (newStreak >= streakThreshold) {
      basePoints = dailyLoginBonus * streakMultiplier;
    }
    const bonusAwarded = newStreak % streakMilestoneDay === 0 ? streakMilestoneBonus : 0;
    const totalAwarded = basePoints + bonusAwarded;

    // อัปเดต user
    await conn.query(
      `UPDATE users
       SET login_streak = $1, last_checkin_date = $2, total_points = total_points + $3, last_login_at = NOW()
       WHERE user_id = $4`,
      [newStreak, today, totalAwarded, userId]
    );

    // บันทึก transaction แต้มล็อคอิน
    await conn.query(
      `INSERT INTO points_transactions (user_id, source_type, points, type) VALUES ($1, 'daily_checkin', $2, 'earn')`,
      [userId, basePoints]
    );

    // บันทึก bonus (ถ้ามี)
    if (bonusAwarded > 0) {
      await conn.query(
        `INSERT INTO points_transactions (user_id, source_type, points, type) VALUES ($1, $2, $3, 'earn')`,
        [userId, `streak_bonus_${newStreak}`, bonusAwarded]
      );
    }

    await conn.query('COMMIT');

    // Apply bonus events (ทำหลังจาก commit เพื่อหลีกเลี่ยง lock table)
    const loginBonusAwarded = await applyActiveBonusEvents(userId, 'login_bonus');

    conn.release();

    // ดึง updated user points
    const updatedConn = await pool.connect();
    const { rows: updatedUser } = await updatedConn.query(
      'SELECT total_points FROM users WHERE user_id = $1',
      [userId]
    );
    updatedConn.release();

    const finalPoints = updatedUser.length ? Number(updatedUser[0].total_points) : (Number(user.total_points) + totalAwarded + loginBonusAwarded);

    return res.json({
      success: true,
      login_streak: newStreak,
      base_points: basePoints,
      bonus_points: bonusAwarded,
      event_bonus_points: loginBonusAwarded,
      total_awarded: totalAwarded + loginBonusAwarded,
      total_points: finalPoints,
      message: (bonusAwarded > 0 || loginBonusAwarded > 0)
        ? `🎉 เช็คอินสำเร็จ! Streak ${newStreak} วัน รับ +${totalAwarded + loginBonusAwarded} แต้ม!`
        : `✅ เช็คอินสำเร็จ! +${basePoints} แต้ม (Streak: ${newStreak} วัน)`,
    });
  } catch (err) {
    await conn.query('ROLLBACK');
    conn.release();
    console.error('dailyCheckin error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
// POST /api/rewards/session/start
// ============================================================
exports.startSession = async (req, res) => {
  const { phone_number } = req.body;
  if (!phone_number) return res.status(400).json({ error: 'phone_number required' });

  const conn = await pool.connect();
  try {
    const { rows: users } = await conn.query(
      'SELECT user_id FROM users WHERE phone_number = $1', [phone_number]
    );
    if (!users.length) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    const userId = users[0].user_id;

    const { today } = await getBangkokDates(conn);

    // ปิด session ที่ค้างอยู่ก่อน — cap ที่ 4 ชั่วโมงเพื่อป้องกัน session ค้างจาก app crash
    await conn.query(
      `UPDATE app_sessions SET ended_at = NOW(),
         duration_minutes = LEAST(EXTRACT(EPOCH FROM (NOW() - started_at)) / 60, 240)
       WHERE user_id = $1 AND ended_at IS NULL`,
      [userId]
    );

    const result = await conn.query(
      'INSERT INTO app_sessions (user_id) VALUES ($1) RETURNING session_id', [userId]
    );

    // รวมนาทีที่ใช้งานทั้งวันนี้ (sessions ก่อนหน้า) ส่งกลับให้ Flutter ใช้ init timer
    const todayElapsedMinutes = await getTodayTotalElapsedMinutes(conn, userId, today);

    conn.release();
    res.json({
      session_id: Number(result.rows[0].session_id),
      started: true,
      today_elapsed_minutes: todayElapsedMinutes,
    });
  } catch (err) {
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
// POST /api/rewards/session/end
// คำนวณแต้มตามเวลาใช้งาน และแต้มต่อนาทีจากการตั้งค่าแอดมิน
// ============================================================
exports.endSession = async (req, res) => {
  const { phone_number, session_id } = req.body;
  if (!phone_number || !session_id) {
    return res.status(400).json({ error: 'phone_number and session_id required' });
  }

  const conn = await pool.connect();
  try {
    const usageRule = await getAppUsageRule(conn);

    const { rows: users } = await conn.query(
      'SELECT user_id, total_points FROM users WHERE phone_number = $1', [phone_number]
    );
    if (!users.length) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    const userId = users[0].user_id;

    await conn.query(
      `UPDATE app_sessions
       SET ended_at = NOW(), duration_minutes = EXTRACT(EPOCH FROM (NOW() - started_at)) / 60
       WHERE session_id = $1 AND user_id = $2 AND ended_at IS NULL`,
      [session_id, userId]
    );

    const { rows: sessions } = await conn.query(
      'SELECT duration_minutes, points_awarded FROM app_sessions WHERE session_id = $1',
      [session_id]
    );
    if (!sessions.length) { conn.release(); return res.json({ points_awarded: 0 }); }

    const minutes = Number(sessions[0].duration_minutes || 0);
    const alreadyAwarded = Number(sessions[0].points_awarded || 0);

    const { today } = await getBangkokDates(conn);
    const [todayUsageAwardedPoints, todayTotalElapsed] = await Promise.all([
      getTodayAppUsageAwardedPoints(conn, userId, today),
      getTodayTotalElapsedMinutes(conn, userId, today),
    ]);
    const rewardState = computeUsageRewardState({
      todayTotalElapsedMinutes: todayTotalElapsed,
      todayUsageAwardedPoints,
      usageRule,
    });

    const newPoints = rewardState.newPointsToAward;
    const newSessionTotal = alreadyAwarded + newPoints;

    if (newPoints > 0) {
      await conn.query(
        'UPDATE app_sessions SET points_awarded = $1 WHERE session_id = $2',
        [newSessionTotal, session_id]
      );
      await conn.query(
        `UPDATE users SET total_points = total_points + $1 WHERE user_id = $2`,
        [newPoints, userId]
      );
      await conn.query(
        `INSERT INTO points_transactions (user_id, source_type, points, type) VALUES ($1, 'app_time', $2, 'earn')`,
        [userId, newPoints]
      );
    }

    conn.release();
    res.json({
      duration_minutes: minutes,
      points_awarded: newPoints,
      total_session_points: newSessionTotal,
      minutes_to_next_point: rewardState.minutesToNextReward,
      daily_limit_reached: rewardState.dailyLimitReached,
      usage_rule: {
        minutes_per_reward: usageRule.minutesPerReward,
        points_per_reward: usageRule.pointsPerReward,
        max_rewards_per_day: usageRule.maxRewardsPerDay,
        max_points_per_day: usageRule.maxDailyPoints,
      },
      message: newPoints > 0
        ? `⏱️ ใช้งานครบตามเงื่อนไข ได้รับ +${newPoints} แต้ม!`
        : null,
    });
  } catch (err) {
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
// POST /api/rewards/session/heartbeat
// ส่งทุก 5 นาที ให้แต้มทันทีตามอัตราแต้มต่อนาทีจากการตั้งค่า
// ============================================================
exports.sessionHeartbeat = async (req, res) => {
  const { phone_number, session_id } = req.body;
  if (!phone_number || !session_id) {
    return res.status(400).json({ error: 'phone_number and session_id required' });
  }

  const conn = await pool.connect();
  try {
    const usageRule = await getAppUsageRule(conn);

    const { rows: users } = await conn.query(
      'SELECT user_id, total_points FROM users WHERE phone_number = $1', [phone_number]
    );
    if (!users.length) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    const userId = users[0].user_id;

    const { rows: sessions } = await conn.query(
      `SELECT EXTRACT(EPOCH FROM (NOW() - started_at)) / 60 as elapsed, points_awarded
       FROM app_sessions WHERE session_id = $1 AND user_id = $2 AND ended_at IS NULL`,
      [session_id, userId]
    );
    if (!sessions.length) { conn.release(); return res.json({ active: false }); }

    const elapsed = Number(sessions[0].elapsed || 0);
    const alreadyAwarded = Number(sessions[0].points_awarded || 0);

    const { today } = await getBangkokDates(conn);
    const [todayUsageAwardedPoints, todayTotalElapsed] = await Promise.all([
      getTodayAppUsageAwardedPoints(conn, userId, today),
      getTodayTotalElapsedMinutes(conn, userId, today),
    ]);
    const rewardState = computeUsageRewardState({
      todayTotalElapsedMinutes: todayTotalElapsed,
      todayUsageAwardedPoints,
      usageRule,
    });

    const newPoints = rewardState.newPointsToAward;
    const newSessionTotal = alreadyAwarded + newPoints;

    if (newPoints > 0) {
      await conn.query(
        'UPDATE app_sessions SET points_awarded = $1 WHERE session_id = $2',
        [newSessionTotal, session_id]
      );
      await conn.query(
        `UPDATE users SET total_points = total_points + $1 WHERE user_id = $2`,
        [newPoints, userId]
      );
      await conn.query(
        `INSERT INTO points_transactions (user_id, source_type, points, type) VALUES ($1, 'app_time', $2, 'earn')`,
        [userId, newPoints]
      );
    }

    const { rows: updatedUser } = await conn.query(
      'SELECT total_points FROM users WHERE user_id = $1', [userId]
    );
    conn.release();

    res.json({
      elapsed_minutes: elapsed,
      today_total_elapsed_minutes: todayTotalElapsed,
      points_just_awarded: newPoints,
      minutes_to_next_point: rewardState.minutesToNextReward,
      daily_limit_reached: rewardState.dailyLimitReached,
      today_app_usage_points: rewardState.totalAwardedTodayAfter,
      usage_rule: {
        minutes_per_reward: usageRule.minutesPerReward,
        points_per_reward: usageRule.pointsPerReward,
        max_rewards_per_day: usageRule.maxRewardsPerDay,
        max_points_per_day: usageRule.maxDailyPoints,
      },
      total_points: Number(updatedUser[0].total_points),
    });
  } catch (err) {
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
// GET /api/rewards/summary/:phone
// ============================================================
exports.getRewardSummary = async (req, res) => {
  const { phone } = req.params;
  let conn;
  try {
    conn = await pool.connect();
    const usageRule = await getAppUsageRule(conn);
    const { today } = await getBangkokDates(conn);

    // Fetch reward settings for daily_login_bonus
    const { rows: rewardSettings } = await conn.query(
      'SELECT daily_login_bonus, daily_login_bonus_3x_threshold, daily_login_bonus_3x_multiplier, streak_milestone_days, streak_milestone_bonus FROM reward_settings WHERE setting_id = 1'
    );
    const dailyLoginBonus = rewardSettings.length ? Number(rewardSettings[0].daily_login_bonus || 5) : 5;
    const streakThreshold = rewardSettings.length ? Number(rewardSettings[0].daily_login_bonus_3x_threshold || 30) : 30;
    const streakMultiplier = rewardSettings.length ? Number(rewardSettings[0].daily_login_bonus_3x_multiplier || 1.2) : 1.2;
    const streakMilestoneDay = rewardSettings.length ? Number(rewardSettings[0].streak_milestone_days || 30) : 30;
    const streakMilestoneBonus = rewardSettings.length ? Number(rewardSettings[0].streak_milestone_bonus || 2) : 2;

    const { rows: users } = await conn.query(
      `SELECT user_id, login_streak, last_checkin_date, total_points FROM users WHERE phone_number = $1`,
      [phone]
    );
    if (!users.length) { return res.status(404).json({ error: 'User not found' }); }
    const user = users[0];
    const userId = user.user_id;

    const { rows: history } = await conn.query(
      `SELECT source_type, points, type, created_at FROM points_transactions
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [userId]
    );

    const { rows: activeSession } = await conn.query(
      `SELECT session_id, EXTRACT(EPOCH FROM (NOW() - started_at)) / 60 as elapsed, points_awarded
       FROM app_sessions WHERE user_id = $1 AND ended_at IS NULL LIMIT 1`,
      [userId]
    );
    const todayUsageAwardedPoints = await getTodayAppUsageAwardedPoints(
      conn,
      userId,
      today
    );

    const lastDate = toBangkokDateString(user.last_checkin_date);
    const checkedInToday = lastDate === today;

    const streak = Number(user.login_streak);
    const nextMilestone = Math.ceil((streak + 1) / streakMilestoneDay) * streakMilestoneDay;

    // Calculate daily_points with multiplier for display
    let dailyPointsDisplay = dailyLoginBonus;
    if (streak >= streakThreshold) {
      dailyPointsDisplay = dailyLoginBonus * streakMultiplier;
    }

    return res.json({
      total_points: Number(user.total_points),
      login_streak: streak,
      checked_in_today: checkedInToday,
      daily_points: dailyPointsDisplay,
      streak_milestone_day: streakMilestoneDay,
      streak_milestone_bonus: streakMilestoneBonus,
      next_streak_bonus: {
        at_day: nextMilestone,
        days_left: nextMilestone - streak,
      },
      today_app_usage_points: todayUsageAwardedPoints,
      usage_reward_daily_limit_count: usageRule.maxRewardsPerDay,
      usage_reward_daily_max_points: usageRule.maxDailyPoints,
      usage_rule: {
        minutes_per_reward: usageRule.minutesPerReward,
        points_per_reward: usageRule.pointsPerReward,
      },
      active_session: activeSession.length ? {
        session_id: Number(activeSession[0].session_id),
        elapsed_minutes: Number(activeSession[0].elapsed),
        points_awarded: Number(activeSession[0].points_awarded),
        minutes_to_next_point: todayUsageAwardedPoints >= usageRule.maxDailyPoints
          ? 0
          : (usageRule.minutesPerReward - (Number(activeSession[0].elapsed) % usageRule.minutesPerReward)) % usageRule.minutesPerReward || usageRule.minutesPerReward,
      } : null,
      recent_transactions: history.map(h => ({
        source_type: h.source_type,
        points: Number(h.points),
        type: h.type,
        created_at: h.created_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
};

// ============================================================
// GET /api/rewards/available/:phone
// ดึงรายชื่อรางวัลทั้งหมด + แสดงว่าผู้ใช้ปลดล็อกแล้วหรือยัง
// ============================================================
exports.getAvailableRewards = async (req, res) => {
  const { phone } = req.params;
  const conn = await pool.connect();
  try {
    const rewardSchema = await getRewardsSchema(conn);
    const userRewardSchema = await getUserRewardsSchema(conn);
    if (!rewardSchema.pointsColumn) {
      conn.release();
      return res.status(500).json({ error: 'Rewards points column not found in DB schema' });
    }

    // ดึง user_id และ total_points
    const { rows: users } = await conn.query(
      `SELECT user_id, total_points FROM users WHERE phone_number = $1`,
      [phone]
    );
    if (!users.length) {
      conn.release();
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = users[0].user_id;
    const userPoints = Number(users[0].total_points);

    // ดึงรางวัลทั้งหมด
    const optionalFields = [
      rewardSchema.hasDescription ? 'description' : 'NULL AS description',
      rewardSchema.hasImageUrl ? 'image_url' : 'NULL AS image_url',
      rewardSchema.hasCategory ? 'category' : 'NULL AS category',
      rewardSchema.hasQuantity ? 'quantity' : 'NULL AS quantity',
      rewardSchema.hasUsageInstructions ? 'usage_instructions' : 'NULL AS usage_instructions',
    ];
    const expiryFilter = rewardSchema.hasExpiryDate
      ? 'AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)'
      : '';
    const { rows: rewards } = await conn.query(
      `SELECT reward_id, reward_name,
              ${rewardSchema.pointsColumn} AS points_required,
              ${optionalFields.join(', ')}
       FROM rewards
       WHERE is_deleted = 0
       ${expiryFilter}
       ORDER BY ${rewardSchema.pointsColumn} ASC`
    );

    // ดึงรางวัลที่ผู้ใช้ปลดล็อกแล้ว
    const redeemedSelect = [
      'reward_id',
      userRewardSchema.hasRedeemedAt ? 'redeemed_at' : 'NULL AS redeemed_at',
      userRewardSchema.hasQuantity ? 'quantity' : '1 AS quantity',
    ].join(', ');
    const { rows: redeemed } = await conn.query(
      `SELECT ${redeemedSelect}
       FROM user_rewards
       WHERE user_id = $1`,
      [userId]
    );

    const redeemedMap = {};
    redeemed.forEach(r => {
      redeemedMap[r.reward_id] = {
        redeemed_at: r.redeemed_at,
        quantity: Number(r.quantity)
      };
    });

    // จัดรูป response
    const availableRewards = rewards.map(reward => ({
      reward_id: reward.reward_id,
      name: reward.reward_name,
      points_required: Number(reward.points_required || 0),
      description: reward.description,
      usage_instructions: reward.usage_instructions,
      image_url: reward.image_url,
      category: reward.category,
      quantity: reward.quantity || null,
      can_redeem: userPoints >= Number(reward.points_required || 0),
      already_redeemed: !!redeemedMap[reward.reward_id],
      redeemed_info: redeemedMap[reward.reward_id] || null
    }));

    conn.release();
    res.json({
      user_total_points: userPoints,
      rewards: availableRewards,
      count: availableRewards.length
    });
  } catch (err) {
    conn.release();
    console.error('getAvailableRewards error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
// POST /api/rewards/redeem
// Helper: Generate unique QR code
// ============================================================
async function generateQRCode(conn, userId, rewardId, phoneNumber, pointsRedeemed) {
  // Generate unique code: timestamp + random
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex').toUpperCase();
  const qrCode = `QR${timestamp}${random}`;

  // Set expiry to 60 minutes from now
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  // Insert into database
  const result = await conn.query(
    `INSERT INTO qr_codes (code, user_id, reward_id, phone_number, points_redeemed, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING qr_id`,
    [qrCode, userId, rewardId, phoneNumber, pointsRedeemed, expiresAt]
  );

  return {
    qr_id: result.rows[0].qr_id,
    qr_code: qrCode,
    expires_at: expiresAt,
    expires_in_minutes: 60
  };
}

// ============================================================
// Helper: Log QR Code Actions
// ============================================================
async function logQRAction(conn, qrId, qrCode, userId, phoneNumber, action, status, errorMsg = null, ipAddr = null, userAgent = null) {
  try {
    await conn.query(
      `INSERT INTO qr_code_logs (qr_id, qr_code, user_id, phone_number, action, status, error_message, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [qrId, qrCode, userId, phoneNumber, action, status, errorMsg, ipAddr, userAgent]
    );
  } catch (err) {
    console.warn('Failed to log QR action:', err.message);
    // Don't throw - logging should not block main flow
  }
}

// ============================================================
// Helper: Update Redemption History
// ============================================================
async function updateRedemptionHistory(conn, userId, phoneNumber, rewardId, rewardName, pointsRedeemed, qrCode, status, timestamp = null, overrideExpiresAt = null) {
  try {
    const { rows: qrCodes } = await conn.query(
      `SELECT expires_at FROM qr_codes WHERE code = $1 LIMIT 1`,
      [qrCode]
    );

    // ใช้ overrideExpiresAt (promo code expiry) ก่อน, แล้ว qr_codes.expires_at, สุดท้าย fallback 1 ชั่วโมง
    const expiresAt = overrideExpiresAt ?? (qrCodes.length ? qrCodes[0].expires_at : new Date(Date.now() + 60 * 60 * 1000));

    // Check if this QR code already exists in redemption history
    const { rows: existing } = await conn.query(
      `SELECT redemption_id FROM reward_redemption_history WHERE qr_code = $1 LIMIT 1`,
      [qrCode]
    );

    if (existing.length) {
      // Update existing record
      const updateQuery = `UPDATE reward_redemption_history SET redemption_status = $1, updated_at = NOW() ${timestamp ? ', scanned_at = $3' : ''} WHERE qr_code = $2`;
      const params = timestamp ? [status, qrCode, timestamp] : [status, qrCode];
      await conn.query(updateQuery, params);
      console.log(`✓ Updated redemption history for QR: ${qrCode}`);
    } else {
      // Insert new record
      await conn.query(
        `INSERT INTO reward_redemption_history (user_id, phone_number, reward_id, reward_name, points_redeemed, qr_code, redemption_status, redeemed_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)`,
        [userId, phoneNumber, rewardId, rewardName, pointsRedeemed, qrCode, status, expiresAt]
      );
      console.log(`✓ Created redemption history for QR: ${qrCode}`);
    }
  } catch (err) {
    console.error('Failed to update redemption history:', err.message);
    throw err;
  }
}

// ============================================================
// POST /api/rewards/redeem
// แลกรางวัล (หักแต้ม, บันทึก transaction)
// ============================================================
exports.redeemReward = async (req, res) => {
  const { phone_number, reward_id } = req.body;
  if (!phone_number || !reward_id) {
    return res.status(400).json({ error: 'phone_number and reward_id required' });
  }

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');

    const rewardSchema = await getRewardsSchema(conn);
    const userRewardSchema = await getUserRewardsSchema(conn);
    if (!rewardSchema.pointsColumn) {
      await conn.query('ROLLBACK');
      conn.release();
      return res.status(500).json({ error: 'Rewards points column not found in DB schema' });
    }

    // ดึง user + lock row
    const { rows: users } = await conn.query(
      `SELECT user_id, total_points FROM users WHERE phone_number = $1 FOR UPDATE`,
      [phone_number]
    );
    if (!users.length) {
      await conn.query('ROLLBACK');
      conn.release();
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = users[0].user_id;
    const userPoints = Number(users[0].total_points);

    // ดึงข้อมูลรางวัล + lock row
    const { rows: rewards } = await conn.query(
      `SELECT reward_id, reward_name, ${rewardSchema.pointsColumn} AS points_required
       FROM rewards WHERE reward_id = $1 AND is_deleted = 0 FOR UPDATE`,
      [reward_id]
    );
    if (!rewards.length) {
      await conn.query('ROLLBACK');
      conn.release();
      return res.status(404).json({ error: 'Reward not found' });
    }

    const reward = rewards[0];
    const pointsRequired = Number(reward.points_required || 0);

    // ตรวจสอบแต้มพอหรือไม่
    if (userPoints < pointsRequired) {
      await conn.query('ROLLBACK');
      conn.release();
      return res.status(400).json({
        error: 'Insufficient points',
        user_points: userPoints,
        points_required: pointsRequired,
        points_short: pointsRequired - userPoints
      });
    }

    // ตรวจสอบว่าแลกแล้วหรือยัง (บาง reward ตั้งใจให้แลกได้แค่ครั้งเดียว)
    const { rows: existing } = await conn.query(
      `SELECT user_reward_id FROM user_rewards WHERE user_id = $1 AND reward_id = $2`,
      [userId, reward_id]
    );

    // กำหนดนโยบาย: ให้แลกได้หลายครั้ง แต่บันทึกครั้งนี้
    // ถ้าต้องการแลกครั้งเดียว ให้เปลี่ยนเป็น return error

    // หัก แต้ม
    await conn.query(
      `UPDATE users SET total_points = total_points - $1 WHERE user_id = $2`,
      [pointsRequired, userId]
    );

    // บันทึก transaction
    await conn.query(
      `INSERT INTO points_transactions (user_id, source_type, points, type)
       VALUES ($1, $2, $3, 'redeem')`,
      [userId, `reward_${reward_id}`, pointsRequired]
    );

    // บันทึก user_rewards
    if (existing.length) {
      if (userRewardSchema.hasQuantity) {
        // อัพเดต quantity ถ้าแลกมาก่อน
        await conn.query(
          `UPDATE user_rewards SET quantity = quantity + 1, redeemed_at = NOW()
           WHERE user_id = $1 AND reward_id = $2`,
          [userId, reward_id]
        );
      } else if (userRewardSchema.hasRedeemedAt) {
        // schema เดิมที่ไม่มี quantity ให้แค่อัปเดตเวลาล่าสุด
        await conn.query(
          `UPDATE user_rewards SET redeemed_at = NOW()
           WHERE user_id = $1 AND reward_id = $2`,
          [userId, reward_id]
        );
      }
    } else {
      // เพิ่มรางวัลใหม่ (รองรับทั้ง schema มี/ไม่มี quantity)
      if (userRewardSchema.hasQuantity) {
        await conn.query(
          `INSERT INTO user_rewards (user_id, reward_id, quantity, redeemed_at)
           VALUES ($1, $2, 1, NOW())`,
          [userId, reward_id]
        );
      } else if (userRewardSchema.hasRedeemedAt) {
        await conn.query(
          `INSERT INTO user_rewards (user_id, reward_id, redeemed_at)
           VALUES ($1, $2, NOW())`,
          [userId, reward_id]
        );
      } else {
        await conn.query(
          `INSERT INTO user_rewards (user_id, reward_id)
           VALUES ($1, $2)`,
          [userId, reward_id]
        );
      }
    }

    // Get available promo code from uploaded CSV codes (instead of generating new code)
    const { rows: promoCodeResult } = await conn.query(
      `SELECT promo_code_id, code, description, expiry_date
       FROM promo_codes
       WHERE reward_id = $1 AND is_used = FALSE
       ORDER BY created_at ASC LIMIT 1`,
      [reward_id]
    );

    if (!promoCodeResult.length) {
      await conn.query('ROLLBACK');
      conn.release();
      return res.status(400).json({
        error: 'ไม่มีโค้ดส่วนลดที่พร้อมใช้สำหรับรางวัลนี้ กรุณาติดต่อแอดมิน',
        reward_name: reward.reward_name
      });
    }

    const promoCode = promoCodeResult[0];

    // Mark promo code as used
    await conn.query(
      `UPDATE promo_codes SET is_used = TRUE, used_by_user_id = $1, used_by_phone = $2, used_at = NOW()
       WHERE promo_code_id = $3`,
      [userId, phone_number, promoCode.promo_code_id]
    );

    // Use promo code as the main redemption code (don't generate long code)
    const redemptionCode = promoCode.code;
    const promoCodeExpiry = promoCode.expiry_date || new Date(Date.now() + 60 * 60 * 1000);

    // Update redemption history with promo code (ส่ง promoCodeExpiry เพื่อให้ expires_at ถูกต้อง)
    await updateRedemptionHistory(conn, userId, phone_number, reward_id, reward.reward_name, pointsRequired, redemptionCode, 'pending', null, promoCodeExpiry);

    await conn.query('COMMIT');
    conn.release();

    // บันทึก notification โดยอ้าง redemption_id จาก reward_redemption_history
    try {
      const notifConn = await pool.connect();
      const { rows: redemptions } = await notifConn.query(
        `SELECT redemption_id FROM reward_redemption_history
         WHERE qr_code = $1 AND user_id = $2 LIMIT 1`,
        [redemptionCode, userId]
      );
      const redemptionId = redemptions.length ? redemptions[0].redemption_id : null;

      await notifConn.query(
        `INSERT INTO notifications (user_id, actor_id, type, content, redemption_id, created_at)
         VALUES ($1, $2, 'reward_redemption', $3, $4, NOW())`,
        [
          userId,
          userId,
          JSON.stringify({ type: 'reward_redemption' }),
          redemptionId
        ]
      );
      notifConn.release();
      console.log(`✓ Reward notification created for user ${userId}, redemption_id: ${redemptionId}`);
    } catch (notifErr) {
      console.error('Warning: notification insert failed:', notifErr.message);
    }

    const newPoints = userPoints - pointsRequired;
    const responseData = {
      success: true,
      reward_name: reward.reward_name,
      points_deducted: pointsRequired,
      new_total_points: newPoints,
      promo_code: redemptionCode,
      qr_code: redemptionCode,  // Use promo code for QR generation on frontend
      qr_expires_at: promoCodeExpiry,
      qr_expires_in_minutes: Math.ceil((promoCodeExpiry - Date.now()) / (60 * 1000)),
      promo_code_description: promoCode.description || null,
      message: `✅ แลกรางวัลสำเร็จ! ${reward.reward_name} ได้แล้ว! (-${pointsRequired} แต้ม, เหลือ ${newPoints} แต้ม) โค้ด: ${redemptionCode}`
    };

    res.json(responseData);
  } catch (err) {
    await conn.query('ROLLBACK');
    conn.release();
    console.error('redeemReward error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
// GET /api/rewards/redemption-history/:phone/:qrCode
// ดึงข้อมูลการแลกรางวัลล่าสุด จาก reward_redemption_history
// ============================================================
exports.getRedemptionRecord = async (req, res) => {
  const { phone, qrCode } = req.params;
  if (!phone || !qrCode) {
    return res.status(400).json({ error: 'phone_number and qr_code required' });
  }

  const conn = await pool.connect();
  try {
    // ดึง redemption record ล่าสุดที่ตรงกับ phone + QR code
    const { rows: records } = await conn.query(
      `SELECT
        redemption_id,
        user_id,
        phone_number,
        reward_id,
        reward_name,
        points_redeemed,
        qr_code,
        redemption_status,
        redeemed_at,
        scanned_at,
        used_at,
        expires_at,
        created_at,
        updated_at
       FROM reward_redemption_history
       WHERE phone_number = $1 AND qr_code = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [phone, qrCode]
    );

    conn.release();

    if (records.length) {
      const record = records[0];
      // Fetch usage_instructions from rewards table
      const rewardsConn = await pool.connect();
      try {
        const { rows: rewardData } = await rewardsConn.query(
          `SELECT usage_instructions FROM rewards WHERE reward_id = $1 LIMIT 1`,
          [record.reward_id]
        );
        record.usage_instructions = rewardData.length ? rewardData[0].usage_instructions : null;
      } catch (e) {
        console.error('Warning: Could not fetch usage_instructions:', e.message);
        record.usage_instructions = null;
      } finally {
        rewardsConn.release();
      }
      return res.json({ success: true, data: record });
    } else {
      return res.status(404).json({
        error: 'Redemption record not found',
        success: false
      });
    }
  } catch (err) {
    conn.release();
    console.error('getRedemptionRecord error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
// POST /api/rewards/verify-qr
// ตรวจสอบ QR code ที่ร้านค้า
// ============================================================
exports.verifyQRCode = async (req, res) => {
  const { qr_code } = req.body;
  if (!qr_code) {
    return res.status(400).json({ error: 'qr_code required' });
  }

  const conn = await pool.connect();
  try {
    // ดึงข้อมูล QR code
    const { rows: qrRecords } = await conn.query(
      `SELECT * FROM qr_codes WHERE code = $1 LIMIT 1`,
      [qr_code]
    );

    if (!qrRecords.length) {
      await logQRAction(conn, null, qr_code, null, null, 'verify', 'invalid', 'QR code not found');
      conn.release();
      return res.status(404).json({ error: 'QR code not found' });
    }

    const qr = qrRecords[0];

    // ตรวจสอบว่าหมดอายุหรือไม่
    const now = new Date();
    const expiresAt = new Date(qr.expires_at);

    if (now > expiresAt) {
      await logQRAction(conn, qr.qr_id, qr_code, qr.user_id, qr.phone_number, 'verify', 'expired', 'QR code has expired');
      conn.release();
      return res.status(400).json({
        error: 'QR code expired',
        status: 'expired'
      });
    }

    // ตรวจสอบว่าใช้แล้วหรือไม่
    if (qr.is_used) {
      await logQRAction(conn, qr.qr_id, qr_code, qr.user_id, qr.phone_number, 'verify', 'already_used', 'QR code already used');
      conn.release();
      return res.status(400).json({
        error: 'QR code already used',
        status: 'already_used',
        used_at: qr.used_at
      });
    }

    // ดึงข้อมูลรางวัล
    const { rows: rewards } = await conn.query(
      `SELECT reward_id, reward_name FROM rewards WHERE reward_id = $1`,
      [qr.reward_id]
    );

    if (!rewards.length) {
      await logQRAction(conn, qr.qr_id, qr_code, qr.user_id, qr.phone_number, 'verify', 'invalid', 'Reward not found');
      conn.release();
      return res.status(404).json({ error: 'Reward not found' });
    }

    // Log successful verification
    await logQRAction(conn, qr.qr_id, qr_code, qr.user_id, qr.phone_number, 'verify', 'success');
    await updateRedemptionHistory(conn, qr.user_id, qr.phone_number, qr.reward_id, rewards[0].reward_name, qr.points_redeemed, qr_code, 'scanned', now);

    conn.release();

    // ส่งข้อมูล QR code (ไม่มี marks แต่ให้ verify ได้)
    res.json({
      success: true,
      status: 'valid',
      qr_code: qr_code,
      phone_number: qr.phone_number,
      reward_name: rewards[0].reward_name,
      points_redeemed: qr.points_redeemed,
      created_at: qr.created_at,
      expires_at: qr.expires_at,
      expires_in_seconds: Math.floor((expiresAt - now) / 1000),
      message: `✅ QR code ถูกต้อง - ${rewards[0].reward_name} (${qr.points_redeemed} แต้ม)`
    });
  } catch (err) {
    conn.release();
    console.error('verifyQRCode error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
// POST /api/rewards/use-qr
// ใช้ QR code เมื่อลูกค้า scan ที่ร้าน
// ============================================================
exports.useQRCode = async (req, res) => {
  const { qr_code } = req.body;
  if (!qr_code) {
    return res.status(400).json({ error: 'qr_code required' });
  }

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');

    // ดึงข้อมูล QR code + lock row
    const { rows: qrRecords } = await conn.query(
      `SELECT * FROM qr_codes WHERE code = $1 FOR UPDATE`,
      [qr_code]
    );

    if (!qrRecords.length) {
      await conn.query('ROLLBACK');
      await logQRAction(conn, null, qr_code, null, null, 'use', 'invalid', 'QR code not found');
      conn.release();
      return res.status(404).json({ error: 'QR code not found' });
    }

    const qr = qrRecords[0];

    // ตรวจสอบว่าหมดอายุหรือไม่
    const now = new Date();
    const expiresAt = new Date(qr.expires_at);

    if (now > expiresAt) {
      await conn.query('ROLLBACK');
      await logQRAction(conn, qr.qr_id, qr_code, qr.user_id, qr.phone_number, 'use', 'expired', 'QR code has expired');
      conn.release();
      return res.status(400).json({ error: 'QR code expired' });
    }

    // ตรวจสอบว่าใช้แล้วหรือไม่
    if (qr.is_used) {
      await conn.query('ROLLBACK');
      await logQRAction(conn, qr.qr_id, qr_code, qr.user_id, qr.phone_number, 'use', 'already_used', 'QR code already used');
      conn.release();
      return res.status(400).json({ error: 'QR code already used' });
    }

    // Mark as used
    await conn.query(
      `UPDATE qr_codes SET is_used = TRUE, used_at = NOW() WHERE qr_id = $1`,
      [qr.qr_id]
    );

    // บันทึก transaction
    await conn.query(
      `INSERT INTO points_transactions (user_id, source_type, points, type)
       VALUES ($1, $2, $3, 'redemption_used')`,
      [qr.user_id, `qr_${qr.qr_id}`, -qr.points_redeemed]
    );

    // Log successful use
    await logQRAction(conn, qr.qr_id, qr_code, qr.user_id, qr.phone_number, 'use', 'success');

    // Get reward name and update redemption history
    const { rows: rewards } = await conn.query(
      `SELECT reward_name FROM rewards WHERE reward_id = $1`,
      [qr.reward_id]
    );
    const rewardName = rewards.length ? rewards[0].reward_name : 'Unknown Reward';
    await updateRedemptionHistory(conn, qr.user_id, qr.phone_number, qr.reward_id, rewardName, qr.points_redeemed, qr_code, 'used', now);

    await conn.query('COMMIT');
    conn.release();

    res.json({
      success: true,
      message: `✅ ใช้ QR code สำเร็จ - ${qr.points_redeemed} แต้มได้มาแล้ว`,
      qr_code: qr_code,
      used_at: new Date()
    });
  } catch (err) {
    await conn.query('ROLLBACK');
    conn.release();
    console.error('useQRCode error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
// BONUS EVENTS - Apply bonus from active events
// Helper function ปรับใช้ bonus จากอีเว้นที่ active
// ============================================================
async function applyActiveBonusEvents(userId, bonusType = 'login_bonus') {
  let conn;
  try {
    conn = await pool.connect();
    const { today } = await getBangkokDates(conn);

    // Find all active events matching the type
    const { rows: events } = await conn.query(
      `SELECT event_id, points_awarded, bonus_type, max_points_per_user
       FROM bonus_events
       WHERE is_active = 1
         AND event_type = $1
         AND start_date <= $2
         AND end_date >= $3`,
      [bonusType, today, today]
    );

    let totalBonusAwarded = 0;

    for (const event of events) {
      const eventId = Number(event.event_id);
      const pointsAwarded = Number(event.points_awarded);
      const maxPointsPerUser = event.max_points_per_user ? Number(event.max_points_per_user) : null;

      // Check if user already got this bonus (for one_time events)
      if (event.bonus_type === 'one_time') {
        const { rows: existing } = await conn.query(
          'SELECT record_id FROM user_event_bonus WHERE user_id = $1 AND event_id = $2',
          [userId, eventId]
        );
        if (existing.length > 0) continue; // Skip, already awarded
      } else if (event.bonus_type === 'recurring_daily') {
        // Check if user got bonus today (for daily events)
        const { rows: existing } = await conn.query(
          `SELECT record_id FROM user_event_bonus
           WHERE user_id = $1 AND event_id = $2 AND DATE(awarded_at) = $3`,
          [userId, eventId, today]
        );
        if (existing.length > 0) continue; // Skip, already awarded today
      }

      // Check max_points_per_user limit
      if (maxPointsPerUser) {
        const { rows: totalAwarded } = await conn.query(
          `SELECT COALESCE(SUM(points_awarded), 0) as total
           FROM user_event_bonus
           WHERE user_id = $1 AND event_id = $2`,
          [userId, eventId]
        );
        if (Number(totalAwarded[0].total) >= maxPointsPerUser) {
          continue; // Skip, max limit reached
        }
      }

      // Award points
      await conn.query(
        'UPDATE users SET total_points = total_points + $1 WHERE user_id = $2',
        [pointsAwarded, userId]
      );

      // Record the award
      await conn.query(
        `INSERT INTO user_event_bonus (user_id, event_id, points_awarded)
         VALUES ($1, $2, $3)`,
        [userId, eventId, pointsAwarded]
      );

      // Log transaction
      await conn.query(
        `INSERT INTO points_transactions (user_id, source_type, points, type)
         VALUES ($1, $2, $3, 'earn')`,
        [userId, `bonus_event_${eventId}`, pointsAwarded]
      );

      totalBonusAwarded += pointsAwarded;
    }

    return totalBonusAwarded;
  } catch (err) {
    console.error('Error applying bonus events:', err);
    return 0;
  } finally {
    if (conn) conn.release();
  }
}

/**
 * GET /api/rewards/check-bonus/:phone
 * ตรวจสอบและปรับใช้ bonus events สำหรับผู้ใช้
 */
exports.checkAndApplyBonusEvents = async (req, res) => {
  const { phone } = req.params;
  const conn = await pool.connect();

  try {
    const { rows: users } = await conn.query(
      'SELECT user_id FROM users WHERE phone_number = $1',
      [phone]
    );

    if (!users.length) {
      conn.release();
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = users[0].user_id;

    conn.release();

    // ตรวจสอบ login_bonus
    const loginBonusAwarded = await applyActiveBonusEvents(userId, 'login_bonus');

    // ตรวจสอบ usage_bonus
    const usageBonusAwarded = await applyActiveBonusEvents(userId, 'usage_bonus');

    // ตรวจสอบ special_event
    const specialBonusAwarded = await applyActiveBonusEvents(userId, 'special_event');

    const totalBonusAwarded = loginBonusAwarded + usageBonusAwarded + specialBonusAwarded;

    const updatedConn = await pool.connect();
    const { rows: updatedUser } = await updatedConn.query(
      'SELECT total_points FROM users WHERE user_id = $1',
      [userId]
    );
    updatedConn.release();

    return res.json({
      success: true,
      total_bonus_awarded: totalBonusAwarded,
      login_bonus: loginBonusAwarded,
      usage_bonus: usageBonusAwarded,
      special_bonus: specialBonusAwarded,
      total_points: updatedUser.length ? Number(updatedUser[0].total_points) : 0,
      message: totalBonusAwarded > 0
        ? `🎁 ได้รับโบนัส +${totalBonusAwarded} แต้มจากอีเว้น!`
        : 'ไม่มีโบนัสที่รอคอยในขณะนี้'
    });
  } catch (err) {
    console.error('checkAndApplyBonusEvents error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
// GET /api/rewards/settings
// ดึงการตั้งค่าแต้ม (Public - สำหรับ Flutter app)
// ============================================================
exports.getRewardSettings = async (req, res) => {
  let conn;
  try {
    conn = await pool.connect();
    const usageRule = await getAppUsageRule(conn);
    const activityRules = await getActivityRewardRules(conn);
    const { rows: settings } = await conn.query(
      'SELECT * FROM reward_settings WHERE setting_id = 1'
    );

    if (!settings.length) {
      conn.release();
      return res.status(404).json({ error: 'Settings not found' });
    }

    return res.json({
      success: true,
      data: {
        points_per_minute: Number(settings[0].points_per_minute),
        session_bonus_threshold: usageRule.minutesPerReward,
        session_bonus_points: usageRule.pointsPerReward,
        usage_reward_daily_limit_count: usageRule.maxRewardsPerDay,
        usage_reward_daily_max_points: usageRule.maxDailyPoints,
        daily_login_bonus: Number(settings[0].daily_login_bonus),
        daily_login_bonus_3x_threshold: Number(settings[0].daily_login_bonus_3x_threshold),
        daily_login_bonus_3x_multiplier: Number(settings[0].daily_login_bonus_3x_multiplier),
        streak_milestone_bonus: Number(settings[0].streak_milestone_bonus),
        streak_milestone_days: Number(settings[0].streak_milestone_days || 30),
        profile_completion_points: Number(activityRules.profileCompletionPoints),
        post_activity_points: Number(activityRules.postActivityPoints),
        post_activity_required_posts: Number(activityRules.postActivityRequiredPosts),
        comment_activity_points: Number(activityRules.commentActivityPoints),
        comment_activity_daily_limit_count: Number(activityRules.commentActivityDailyLimitCount),
        share_activity_points: Number(activityRules.shareActivityPoints),
      }
    });
  } catch (error) {
    console.error('Failed to get reward settings:', error);
    return res.status(500).json({ error: 'Failed to get settings' });
  } finally {
    if (conn) conn.release();
  }
};

// ============================================================
// GET /api/rewards/bonus-events
// ดึงรายการอีเว้นแจกแต้มทั้งหมด (Public - สำหรับ Flutter app)
// ============================================================
exports.getBonusEvents = async (req, res) => {
  let conn;
  try {
    conn = await pool.connect();
    const { rows: events } = await conn.query(
      `SELECT * FROM bonus_events ORDER BY created_at DESC`
    );

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

// ============================================================
// ACTIVITY-BASED REWARDS
// ============================================================

/**
 * POST /api/rewards/check-profile-completion/:phone
 * ตรวจสอบและให้รางวัล +50 แต้มหากกรอกโปรไฟล์เสร็จสิ้น (one-time)
 */
exports.checkProfileCompletion = async (req, res) => {
  const { phone } = req.params;
  const conn = await pool.connect();

  try {
    const activityRules = await getActivityRewardRules(conn);

    const { rows: users } = await conn.query(
      `SELECT user_id, profile_completion_rewarded, full_name, about_me, phone_number
       FROM users WHERE phone_number = $1`,
      [phone]
    );

    if (!users.length) {
      conn.release();
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];

    if (user.profile_completion_rewarded) {
      conn.release();
      return res.json({
        success: false,
        message: `โปรไฟล์เสร็จสิ้นแล้ว และได้รับรางวัล +${activityRules.profileCompletionPoints} แต้มเรียบร้อย`,
        points_awarded: 0
      });
    }

    const profileComplete = user.full_name && user.about_me;

    if (!profileComplete) {
      conn.release();
      return res.json({
        success: false,
        message: 'กรุณากรอกข้อมูลโปรไฟล์ให้เสร็จสิ้น',
        points_awarded: 0
      });
    }

    await conn.query(
      `UPDATE users SET total_points = total_points + $1, profile_completion_rewarded = TRUE
       WHERE user_id = $2`,
      [activityRules.profileCompletionPoints, user.user_id]
    );

    await conn.query(
      `INSERT INTO points_transactions (user_id, source_type, points, type)
       VALUES ($1, 'profile_completion', $2, 'earn')`,
      [user.user_id, activityRules.profileCompletionPoints]
    );

    conn.release();

    return res.json({
      success: true,
      message: `ได้รับรางวัล +${activityRules.profileCompletionPoints} แต้มจากการกรอกโปรไฟล์`,
      points_awarded: activityRules.profileCompletionPoints
    });
  } catch (error) {
    conn.release();
    console.error('checkProfileCompletion error:', error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/rewards/check-post-activity/:phone
 * ตรวจสอบและให้รางวัลโพสต์ต่อวันเมื่อมีโพสต์พร้อมรูปถึงเกณฑ์
 */
exports.checkPostActivity = async (req, res) => {
  const { phone } = req.params;
  const conn = await pool.connect();

  try {
    const { today } = await getBangkokDates(conn);
    const activityRules = await getActivityRewardRules(conn);

    const { rows: users } = await conn.query(
      'SELECT user_id FROM users WHERE phone_number = $1',
      [phone]
    );

    if (!users.length) {
      conn.release();
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = users[0].user_id;

    const { rows: posts } = await conn.query(
      `SELECT COUNT(DISTINCT p.post_id) as post_count
       FROM posts p
       INNER JOIN post_images pi ON pi.post_id = p.post_id
       WHERE p.user_id = $1
         AND p.is_deleted = 0
         AND DATE(p.created_at) = $2`,
      [userId, today]
    );

    const postCount = Number(posts[0]?.post_count || 0);

    if (postCount < activityRules.postActivityRequiredPosts) {
      conn.release();
      return res.json({
        success: false,
        message: `มีโพสต์พร้อมรูป ${postCount}/${activityRules.postActivityRequiredPosts} เท่านั้น`,
        points_awarded: 0
      });
    }

    const { rows: reward } = await conn.query(
      `SELECT id FROM post_activity_rewards
       WHERE user_id = $1 AND reward_date = $2 LIMIT 1`,
      [userId, today]
    );

    if (reward.length > 0) {
      conn.release();
      return res.json({
        success: false,
        message: 'ได้รับรางวัลโพสต์วันนี้แล้ว',
        points_awarded: 0
      });
    }

    await conn.query(
      `UPDATE users SET total_points = total_points + $1 WHERE user_id = $2`,
      [activityRules.postActivityPoints, userId]
    );

    await conn.query(
      `INSERT INTO post_activity_rewards (user_id, phone_number, reward_date, post_count, points_awarded)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, phone, today, postCount, activityRules.postActivityPoints]
    );

    await conn.query(
      `INSERT INTO points_transactions (user_id, source_type, points, type)
       VALUES ($1, 'post_activity', $2, 'earn')`,
      [userId, activityRules.postActivityPoints]
    );

    conn.release();

    return res.json({
      success: true,
      message: `ได้รับรางวัล +${activityRules.postActivityPoints} แต้มจากการโพสต์พร้อมรูป (${postCount} โพสต์)`,
      points_awarded: activityRules.postActivityPoints
    });
  } catch (error) {
    conn.release();
    console.error('checkPostActivity error:', error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/rewards/check-comment-activity/:phone
 * ตรวจสอบและให้รางวัลคอมเมนต์ต่อวัน ตามเพดานที่ตั้งค่า
 */
exports.checkCommentActivity = async (req, res) => {
  const { phone } = req.params;
  const conn = await pool.connect();

  try {
    const { today } = await getBangkokDates(conn);
    const activityRules = await getActivityRewardRules(conn);

    const { rows: users } = await conn.query(
      'SELECT user_id FROM users WHERE phone_number = $1',
      [phone]
    );

    if (!users.length) {
      conn.release();
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = users[0].user_id;

    const { rows: reward } = await conn.query(
      `SELECT comment_count, points_awarded FROM comment_activity_rewards
       WHERE user_id = $1 AND reward_date = $2 LIMIT 1`,
      [userId, today]
    );

    let commentAwarded = 0;

    if (reward.length > 0) {
      commentAwarded = Number(reward[0].comment_count);

      if (commentAwarded >= activityRules.commentActivityDailyLimitCount) {
        conn.release();
        return res.json({
          success: false,
          message: `ครบจำนวน comment สูงสุดแล้ว (${commentAwarded}/${activityRules.commentActivityDailyLimitCount})`,
          points_awarded: 0
        });
      }
    }

    const { rows: comments } = await conn.query(
      `SELECT COUNT(*) as new_count FROM comments
       WHERE user_id = $1 AND is_deleted = 0 AND DATE(created_at) = $2`,
      [userId, today]
    );

    const totalComments = Number(comments[0]?.new_count || 0);
    const newCommentsSinceReward = Math.max(0, totalComments - commentAwarded);

    if (newCommentsSinceReward === 0) {
      conn.release();
      return res.json({
        success: false,
        message: 'ไม่มี comment ใหม่',
        points_awarded: 0
      });
    }

    const remainingSlots = activityRules.commentActivityDailyLimitCount - commentAwarded;
    const commentsToReward = Math.min(newCommentsSinceReward, remainingSlots);
    const pointsToAdd = commentsToReward * activityRules.commentActivityPoints;

    await conn.query(
      `UPDATE users SET total_points = total_points + $1 WHERE user_id = $2`,
      [pointsToAdd, userId]
    );

    if (reward.length > 0) {
      await conn.query(
        `UPDATE comment_activity_rewards
         SET comment_count = $1, points_awarded = points_awarded + $2
         WHERE user_id = $3 AND reward_date = $4`,
        [commentAwarded + commentsToReward, pointsToAdd, userId, today]
      );
    } else {
      await conn.query(
        `INSERT INTO comment_activity_rewards (user_id, phone_number, reward_date, comment_count, points_awarded)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, phone, today, commentsToReward, pointsToAdd]
      );
    }

    await conn.query(
      `INSERT INTO points_transactions (user_id, source_type, points, type)
       VALUES ($1, 'comment_activity', $2, 'earn')`,
      [userId, pointsToAdd]
    );

    conn.release();

    const finalCommentCount = commentAwarded + commentsToReward;
    return res.json({
      success: true,
      message: `ได้รับรางวัล +${pointsToAdd} แต้มจาก ${commentsToReward} comment (${finalCommentCount}/${activityRules.commentActivityDailyLimitCount})`,
      points_awarded: pointsToAdd,
      comment_count: finalCommentCount,
      comments_remaining: Math.max(0, activityRules.commentActivityDailyLimitCount - finalCommentCount)
    });
  } catch (error) {
    conn.release();
    console.error('checkCommentActivity error:', error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/rewards/check-share-activity/:phone
 * ให้รางวัลแชร์กิจกรรม/โพสต์ต้นฉบับ 1 ครั้งต่อโพสต์
 */
exports.checkShareActivity = async (req, res) => {
  const { phone } = req.params;
  const sharedPostId = Number(req.body?.shared_post_id || 0);
  const conn = await pool.connect();

  try {
    if (!Number.isFinite(sharedPostId) || sharedPostId <= 0) {
      conn.release();
      return res.status(400).json({ error: 'shared_post_id required' });
    }

    const { today } = await getBangkokDates(conn);
    const activityRules = await getActivityRewardRules(conn);
    await ensureShareActivityRewardsTable(conn);

    const { rows: users } = await conn.query(
      'SELECT user_id FROM users WHERE phone_number = $1',
      [phone]
    );

    if (!users.length) {
      conn.release();
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = Number(users[0].user_id);

    const { rows: posts } = await conn.query(
      'SELECT user_id FROM posts WHERE post_id = $1 AND is_deleted = 0 LIMIT 1',
      [sharedPostId]
    );
    if (!posts.length) {
      conn.release();
      return res.status(404).json({ error: 'Post not found' });
    }

    if (Number(posts[0].user_id) === userId) {
      conn.release();
      return res.json({
        success: false,
        message: 'ไม่ให้แต้มเมื่อแชร์โพสต์ของตัวเอง',
        points_awarded: 0
      });
    }

    const { rows: hasShared } = await conn.query(
      `SELECT post_id
       FROM posts
       WHERE user_id = $1 AND shared_post_id = $2 AND is_deleted = 0
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, sharedPostId]
    );
    if (!hasShared.length) {
      conn.release();
      return res.json({
        success: false,
        message: 'ยังไม่พบการแชร์กิจกรรมนี้',
        points_awarded: 0
      });
    }

    const { rows: alreadyRewarded } = await conn.query(
      'SELECT id FROM share_activity_rewards WHERE user_id = $1 AND shared_post_id = $2 LIMIT 1',
      [userId, sharedPostId]
    );

    if (alreadyRewarded.length > 0) {
      conn.release();
      return res.json({
        success: false,
        message: 'กิจกรรมนี้ได้รับแต้มแชร์ไปแล้ว',
        points_awarded: 0
      });
    }

    await conn.query(
      'UPDATE users SET total_points = total_points + $1 WHERE user_id = $2',
      [activityRules.shareActivityPoints, userId]
    );

    await conn.query(
      `INSERT INTO share_activity_rewards (user_id, phone_number, reward_date, shared_post_id, points_awarded)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, phone, today, sharedPostId, activityRules.shareActivityPoints]
    );

    await conn.query(
      `INSERT INTO points_transactions (user_id, source_type, points, type)
       VALUES ($1, 'share_activity', $2, 'earn')`,
      [userId, activityRules.shareActivityPoints]
    );

    conn.release();
    return res.json({
      success: true,
      message: `ได้รับรางวัลแชร์ +${activityRules.shareActivityPoints} แต้ม`,
      points_awarded: activityRules.shareActivityPoints
    });
  } catch (error) {
    conn.release();
    console.error('checkShareActivity error:', error);
    return res.status(500).json({ error: error.message });
  }
};
