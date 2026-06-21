const BLOCKED_ACTION_MESSAGE = 'บัญชีนี้ถูกจำกัดการมีส่วนร่วมชั่วคราว คุณยังดูฟีดได้ แต่ไม่สามารถกดไลก์ แชร์ หรือคอมเมนต์ได้';

const KEYWORD_RULES = [
  'ด่า',
  'โง่',
  'ควาย',
  'เหยียด',
  'บูลลี่',
  'สถุน',
  'idiot',
  'stupid',
  'hate',
  'bully'
];

let moderationColumnsReady = false;
let moderationColumnsPromise = null;

async function ensureColumn(conn, tableName, columnName, ddl) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?`,
    [tableName, columnName]
  );

  if (Number(rows[0]?.total || 0) === 0) {
    await conn.query(ddl);
  }
}

async function ensureModerationColumns(conn) {
  if (moderationColumnsReady) return;
  if (moderationColumnsPromise) {
    await moderationColumnsPromise;
    return;
  }

  moderationColumnsPromise = (async () => {
    await ensureColumn(
      conn,
      'users',
      'is_blocked',
      "ALTER TABLE users ADD COLUMN is_blocked TINYINT(1) NOT NULL DEFAULT 0"
    );
    await ensureColumn(
      conn,
      'users',
      'blocked_reason',
      'ALTER TABLE users ADD COLUMN blocked_reason VARCHAR(255) NULL'
    );
    await ensureColumn(
      conn,
      'users',
      'warning_note',
      'ALTER TABLE users ADD COLUMN warning_note TEXT NULL'
    );
    await ensureColumn(
      conn,
      'users',
      'blocked_at',
      'ALTER TABLE users ADD COLUMN blocked_at DATETIME NULL'
    );
    await ensureColumn(
      conn,
      'users',
      'blocked_by',
      'ALTER TABLE users ADD COLUMN blocked_by INT NULL'
    );
  })();

  try {
    await moderationColumnsPromise;
    moderationColumnsReady = true;
  } finally {
    moderationColumnsPromise = null;
  }
}

async function getUserModerationByPhone(conn, phone) {
  await ensureModerationColumns(conn);

  const [rows] = await conn.query(
    `SELECT user_id, phone_number, full_name, is_blocked, blocked_reason, warning_note, blocked_at
     FROM users
     WHERE phone_number = ?
     LIMIT 1`,
    [phone]
  );

  if (!rows.length) return null;
  const row = rows[0];

  return {
    userId: Number(row.user_id),
    phoneNumber: row.phone_number,
    fullName: row.full_name || '-',
    isBlocked: Number(row.is_blocked || 0) === 1,
    blockedReason: row.blocked_reason || '',
    warningNote: row.warning_note || '',
    blockedAt: row.blocked_at || null
  };
}

function detectViolationHints(content) {
  const safeContent = String(content || '').toLowerCase();
  const matches = KEYWORD_RULES.filter((word) => safeContent.includes(word));
  return Array.from(new Set(matches));
}

async function assertUserCanInteract(conn, phone) {
  const userModeration = await getUserModerationByPhone(conn, phone);

  if (!userModeration) {
    return {
      allowed: false,
      statusCode: 404,
      payload: { error: 'User not found' }
    };
  }

  if (userModeration.isBlocked) {
    return {
      allowed: false,
      statusCode: 403,
      payload: {
        error: BLOCKED_ACTION_MESSAGE,
        moderation: {
          is_blocked: true,
          reason: userModeration.blockedReason,
          warning_note: userModeration.warningNote,
          blocked_at: userModeration.blockedAt
        }
      }
    };
  }

  return {
    allowed: true,
    userId: userModeration.userId,
    moderation: userModeration
  };
}

module.exports = {
  BLOCKED_ACTION_MESSAGE,
  detectViolationHints,
  ensureModerationColumns,
  getUserModerationByPhone,
  assertUserCanInteract
};
