const SECURITY_EVENT_TYPES = {
  USER_OTP_REQUEST: 'user_otp_request',
  USER_OTP_SUCCESS: 'user_otp_success',
  USER_OTP_FAILED: 'user_otp_failed',
  ADMIN_OTP_REQUEST: 'admin_otp_request',
  ADMIN_OTP_SUCCESS: 'admin_otp_success',
  ADMIN_OTP_FAILED: 'admin_otp_failed',
  ADMIN_LOGIN_SUCCESS: 'admin_login_success',
  ADMIN_LOGIN_FAILED: 'admin_login_failed',
  USER_BLOCKED: 'user_blocked',
  USER_UNBLOCKED: 'user_unblocked'
};

async function ensureSecurityLogsTable(conn) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS security_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      event_type VARCHAR(64) NOT NULL,
      actor_name VARCHAR(255) NULL,
      actor_phone VARCHAR(50) NULL,
      target_name VARCHAR(255) NULL,
      target_phone VARCHAR(50) NULL,
      ip_address VARCHAR(64) NULL,
      device VARCHAR(255) NULL,
      detail TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_security_logs_created_at (created_at),
      INDEX idx_security_logs_event_type_created (event_type, created_at),
      INDEX idx_security_logs_actor_phone (actor_phone),
      INDEX idx_security_logs_target_phone (target_phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

function getRequestIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (forwarded) return forwarded;

  const direct = String(req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '');
  return direct || null;
}

function getRequestDevice(req) {
  const userAgent = String(req.headers['user-agent'] || '').trim();
  if (!userAgent) return null;

  if (/android/i.test(userAgent)) return 'Android';
  if (/(iphone|ipad|ipod)/i.test(userAgent)) return 'iPhone/iPad';
  if (/windows/i.test(userAgent)) return 'Windows';
  if (/mac os/i.test(userAgent)) return 'macOS';
  if (/linux/i.test(userAgent)) return 'Linux';

  return userAgent.slice(0, 255);
}

function getSecurityContext(req) {
  return {
    ipAddress: getRequestIp(req),
    device: getRequestDevice(req)
  };
}

async function logSecurityEvent(conn, {
  eventType,
  actorName = null,
  actorPhone = null,
  targetName = null,
  targetPhone = null,
  detail = null,
  req = null,
  createdAt = null
}) {
  const context = req ? getSecurityContext(req) : { ipAddress: null, device: null };

  await conn.query(
    `INSERT INTO security_logs (
      event_type,
      actor_name,
      actor_phone,
      target_name,
      target_phone,
      ip_address,
      device,
      detail,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
    [
      eventType,
      actorName,
      actorPhone,
      targetName,
      targetPhone,
      context.ipAddress,
      context.device,
      detail,
      createdAt
    ]
  );
}

function formatSecurityEventLabel(eventType) {
  const map = {
    [SECURITY_EVENT_TYPES.USER_OTP_REQUEST]: 'otp_request',
    [SECURITY_EVENT_TYPES.USER_OTP_SUCCESS]: 'login_success',
    [SECURITY_EVENT_TYPES.USER_OTP_FAILED]: 'otp_failed',
    [SECURITY_EVENT_TYPES.ADMIN_OTP_REQUEST]: 'otp_request',
    [SECURITY_EVENT_TYPES.ADMIN_OTP_SUCCESS]: 'login_success',
    [SECURITY_EVENT_TYPES.ADMIN_OTP_FAILED]: 'otp_failed',
    [SECURITY_EVENT_TYPES.ADMIN_LOGIN_SUCCESS]: 'login_success',
    [SECURITY_EVENT_TYPES.ADMIN_LOGIN_FAILED]: 'login_failed',
    [SECURITY_EVENT_TYPES.USER_BLOCKED]: 'user_blocked',
    [SECURITY_EVENT_TYPES.USER_UNBLOCKED]: 'user_unblocked'
  };

  return map[String(eventType || '').toLowerCase()] || String(eventType || 'security_event');
}

function isLoginEvent(eventType) {
  const value = String(eventType || '').toLowerCase();
  return value.includes('login') || value.includes('otp_success');
}

function isOtpEvent(eventType) {
  const value = String(eventType || '').toLowerCase();
  return value.includes('otp');
}

function isSecurityEvent(eventType) {
  const value = String(eventType || '').toLowerCase();
  return value.includes('login') || value.includes('otp') || value.includes('blocked') || value.includes('unblocked') || value.includes('password');
}

module.exports = {
  SECURITY_EVENT_TYPES,
  ensureSecurityLogsTable,
  formatSecurityEventLabel,
  getSecurityContext,
  isLoginEvent,
  isOtpEvent,
  isSecurityEvent,
  logSecurityEvent
};