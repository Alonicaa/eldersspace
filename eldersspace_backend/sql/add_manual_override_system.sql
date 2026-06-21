-- ════════════════════════════════════════════════════════════════════════════
-- Manual Code Override / Force Redeem System
-- Created: May 13, 2026
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Update promo_codes table to support manual override ─────────────────
-- ALTER TABLE promo_codes ADD COLUMN override_flag VARCHAR(50) DEFAULT NULL COMMENT 'manual_redeemed, reset, cancelled, etc.';
-- ALTER TABLE promo_codes ADD COLUMN override_reason VARCHAR(255) DEFAULT NULL;
-- ALTER TABLE promo_codes ADD COLUMN override_by_admin_id BIGINT DEFAULT NULL;
-- ALTER TABLE promo_codes ADD COLUMN override_at TIMESTAMP NULL DEFAULT NULL;
-- ALTER TABLE promo_codes ADD COLUMN override_details JSON DEFAULT NULL;
-- ALTER TABLE promo_codes ADD COLUMN last_updated_by BIGINT DEFAULT NULL;
-- ALTER TABLE promo_codes ADD COLUMN last_updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- ─── 2. Create manual_override_audit_log table ────────────────────────────
-- Tracks ALL manual actions performed by admins on promo codes
CREATE TABLE IF NOT EXISTS manual_override_audit_log (
    audit_log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Code Information
    promo_code_id BIGINT NOT NULL,
    code VARCHAR(100) NOT NULL,
    campaign_id BIGINT,
    reward_id BIGINT,
    assigned_user_id BIGINT,
    assigned_phone VARCHAR(20),
    
    -- Override Action Details
    action VARCHAR(50) NOT NULL COMMENT 'force_redeem, reset_status, cancel_code, reassign, extend_expiry, refund_points, change_status',
    old_status VARCHAR(50) NOT NULL COMMENT 'ready, reserved, redeemed, expired, cancelled, refunded, manual_redeemed',
    new_status VARCHAR(50) NOT NULL,
    override_reason VARCHAR(50) COMMENT 'qr_failed, app_issue, scan_failed, system_down, branch_redeem, manual_compensation, other',
    override_reason_custom VARCHAR(255),
    admin_notes TEXT,
    
    -- Admin Information
    admin_id BIGINT NOT NULL,
    admin_name VARCHAR(100),
    admin_phone VARCHAR(20),
    admin_email VARCHAR(100),
    
    -- Branch & Staff Information (for in-branch redemptions)
    branch_id BIGINT,
    branch_name VARCHAR(100),
    staff_id BIGINT,
    staff_name VARCHAR(100),
    
    -- Device & Network Information
    device_ip VARCHAR(45),
    device_user_agent TEXT,
    device_fingerprint VARCHAR(100),
    
    -- Timestamp
    action_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Related Information
    related_qr_code VARCHAR(100),
    related_redemption_id BIGINT,
    
    -- Status Tracking
    is_critical BOOLEAN DEFAULT FALSE COMMENT 'Flag suspicious actions',
    reversal_audit_log_id BIGINT DEFAULT NULL COMMENT 'If this action was reversed, link to reversal log',
    
    -- Metadata
    metadata JSON,
    
    INDEX idx_promo_code_id (promo_code_id),
    INDEX idx_admin_id (admin_id),
    INDEX idx_action (action),
    INDEX idx_action_timestamp (action_timestamp),
    INDEX idx_code (code),
    INDEX idx_old_status (old_status),
    INDEX idx_new_status (new_status),
    INDEX idx_assigned_user_id (assigned_user_id),
    INDEX idx_branch_id (branch_id),
    INDEX idx_override_reason (override_reason),
    FOREIGN KEY (admin_id) REFERENCES users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (promo_code_id) REFERENCES promo_codes(promo_code_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='Complete audit log for all manual override actions on promo codes';

-- ─── 3. Create promo_code_timeline table ──────────────────────────────────
-- Visual timeline for each promo code showing all events
CREATE TABLE IF NOT EXISTS promo_code_timeline (
    timeline_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    promo_code_id BIGINT NOT NULL,
    
    -- Event Information
    event_type VARCHAR(50) NOT NULL COMMENT 'created, used, failed, manual_override, expired, cancelled, reassigned, extended, refunded',
    event_title VARCHAR(100) NOT NULL,
    event_description TEXT,
    
    -- Event Actor
    actor_type VARCHAR(20) COMMENT 'system, user, admin',
    actor_id BIGINT,
    actor_name VARCHAR(100),
    actor_phone VARCHAR(20),
    
    -- Event Timing
    event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Event Status & Details
    event_status VARCHAR(50) COMMENT 'success, failed, pending, cancelled',
    event_metadata JSON,
    
    -- Link to Audit Log (if applicable)
    related_audit_log_id BIGINT,
    
    INDEX idx_promo_code_id (promo_code_id),
    INDEX idx_event_type (event_type),
    INDEX idx_event_timestamp (event_timestamp),
    INDEX idx_actor_id (actor_id),
    FOREIGN KEY (promo_code_id) REFERENCES promo_codes(promo_code_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='Timeline of all events affecting a promo code';

-- ─── 4. Create admin_override_privileges table ───────────────────────────
-- Control who can do what kinds of overrides
CREATE TABLE IF NOT EXISTS admin_override_privileges (
    privilege_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    admin_id BIGINT NOT NULL,
    
    -- Override Permissions
    can_force_redeem BOOLEAN DEFAULT FALSE,
    can_reset_status BOOLEAN DEFAULT FALSE,
    can_cancel_code BOOLEAN DEFAULT FALSE,
    can_reassign_code BOOLEAN DEFAULT FALSE,
    can_extend_expiry BOOLEAN DEFAULT FALSE,
    can_refund_points BOOLEAN DEFAULT FALSE,
    can_view_audit_log BOOLEAN DEFAULT TRUE,
    can_export_audit_log BOOLEAN DEFAULT FALSE,
    
    -- Restrictions
    max_daily_overrides INT DEFAULT 100,
    max_override_value INT DEFAULT 0 COMMENT '0 = unlimited',
    requires_approval BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    granted_by BIGINT,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    reason TEXT,
    
    INDEX idx_admin_id (admin_id),
    UNIQUE KEY unique_admin (admin_id),
    FOREIGN KEY (admin_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='Admin permissions for manual override operations';

-- ─── 5. Create override_approval_queue table (for high-risk actions) ──────
-- Pending approvals for sensitive override actions
CREATE TABLE IF NOT EXISTS override_approval_queue (
    approval_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Request Details
    promo_code_id BIGINT NOT NULL,
    code VARCHAR(100) NOT NULL,
    requested_action VARCHAR(50) NOT NULL,
    old_status VARCHAR(50),
    new_status VARCHAR(50),
    reason VARCHAR(50),
    reason_custom VARCHAR(255),
    
    -- Requester Information
    requested_by_admin_id BIGINT NOT NULL,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Approval Status
    approval_status VARCHAR(20) DEFAULT 'pending' COMMENT 'pending, approved, rejected, expired',
    approved_by_admin_id BIGINT,
    approved_at TIMESTAMP NULL,
    approval_reason TEXT,
    rejection_reason TEXT,
    
    -- Expiry (approval valid for 24 hours)
    expires_at TIMESTAMP DEFAULT (DATE_ADD(NOW(), INTERVAL 24 HOUR)),
    
    INDEX idx_promo_code_id (promo_code_id),
    INDEX idx_approval_status (approval_status),
    INDEX idx_requested_at (requested_at),
    INDEX idx_requested_by_admin_id (requested_by_admin_id),
    FOREIGN KEY (promo_code_id) REFERENCES promo_codes(promo_code_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='Queue for pending high-risk override actions requiring approval';

-- ─── 6. Stored Procedure: Log Manual Override ────────────────────────────
DELIMITER $$

CREATE PROCEDURE sp_log_manual_override(
    IN p_promo_code_id BIGINT,
    IN p_code VARCHAR(100),
    IN p_action VARCHAR(50),
    IN p_old_status VARCHAR(50),
    IN p_new_status VARCHAR(50),
    IN p_reason VARCHAR(50),
    IN p_reason_custom VARCHAR(255),
    IN p_admin_id BIGINT,
    IN p_admin_name VARCHAR(100),
    IN p_admin_phone VARCHAR(20),
    IN p_branch_id BIGINT,
    IN p_branch_name VARCHAR(100),
    IN p_staff_id BIGINT,
    IN p_staff_name VARCHAR(100),
    IN p_notes TEXT,
    IN p_device_ip VARCHAR(45),
    IN p_user_agent TEXT,
    OUT p_audit_log_id BIGINT
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS CONDITION 1 @msg = MESSAGE_TEXT;
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = @msg;
    END;
    
    -- Insert into manual_override_audit_log
    INSERT INTO manual_override_audit_log (
        promo_code_id,
        code,
        action,
        old_status,
        new_status,
        override_reason,
        override_reason_custom,
        admin_id,
        admin_name,
        admin_phone,
        branch_id,
        branch_name,
        staff_id,
        staff_name,
        admin_notes,
        device_ip,
        device_user_agent
    ) VALUES (
        p_promo_code_id,
        p_code,
        p_action,
        p_old_status,
        p_new_status,
        p_reason,
        p_reason_custom,
        p_admin_id,
        p_admin_name,
        p_admin_phone,
        p_branch_id,
        p_branch_name,
        p_staff_id,
        p_staff_name,
        p_notes,
        p_device_ip,
        p_user_agent
    );
    
    SET p_audit_log_id = LAST_INSERT_ID();
    
    -- Insert timeline event
    INSERT INTO promo_code_timeline (
        promo_code_id,
        event_type,
        event_title,
        event_description,
        actor_type,
        actor_id,
        actor_name,
        event_status,
        event_metadata,
        related_audit_log_id
    ) VALUES (
        p_promo_code_id,
        'manual_override',
        CONCAT('Manual Override: ', p_action),
        CONCAT('Admin changed status from ', p_old_status, ' to ', p_new_status, ' - Reason: ', COALESCE(p_reason_custom, p_reason)),
        'admin',
        p_admin_id,
        p_admin_name,
        'success',
        JSON_OBJECT('reason', p_reason, 'notes', p_notes, 'branch', p_branch_name, 'staff', p_staff_name),
        LAST_INSERT_ID()
    );
    
END$$

DELIMITER ;

-- ─── 7. Update promo_codes table (Add columns if not exist) ──────────────
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS override_flag VARCHAR(50) DEFAULT NULL COMMENT 'manual_redeemed, reset, cancelled, etc.';
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS override_reason VARCHAR(255) DEFAULT NULL;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS override_by_admin_id BIGINT DEFAULT NULL;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS override_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS last_updated_by BIGINT DEFAULT NULL;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- ─── 8. Status Reference Table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_code_status_reference (
    status_id TINYINT AUTO_INCREMENT PRIMARY KEY,
    status_name VARCHAR(50) UNIQUE NOT NULL,
    status_label_th VARCHAR(50),
    status_color VARCHAR(20) COMMENT 'green, blue, purple, orange, red, gray',
    status_description TEXT,
    is_terminal BOOLEAN DEFAULT FALSE COMMENT 'Terminal states cannot be changed',
    is_manual_only BOOLEAN DEFAULT FALSE COMMENT 'Can only be set via manual override'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO promo_code_status_reference (status_name, status_label_th, status_color, is_terminal, is_manual_only) VALUES
('ready', 'พร้อมใช้', 'green', FALSE, FALSE),
('reserved', 'จองแล้ว', 'blue', FALSE, FALSE),
('redeemed', 'แลกแล้ว', 'blue', TRUE, FALSE),
('expired', 'หมดอายุ', 'red', TRUE, FALSE),
('cancelled', 'ยกเลิก', 'gray', TRUE, FALSE),
('refunded', 'คืนเงิน', 'gray', TRUE, FALSE),
('manual_redeemed', 'แลกแบบ Manual', 'purple', TRUE, TRUE)
ON DUPLICATE KEY UPDATE status_label_th=VALUES(status_label_th), status_color=VALUES(status_color);

-- ─── 9. Override reason reference table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS override_reason_reference (
    reason_id TINYINT AUTO_INCREMENT PRIMARY KEY,
    reason_code VARCHAR(50) UNIQUE NOT NULL,
    reason_label_th VARCHAR(100),
    reason_description TEXT,
    severity VARCHAR(20) COMMENT 'low, medium, high, critical'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO override_reason_reference (reason_code, reason_label_th, severity) VALUES
('qr_failed', 'QR ใช้งานไม่ได้', 'medium'),
('app_issue', 'ลูกค้าแอพมีปัญหา', 'medium'),
('scan_failed', 'สแกนไม่ผ่าน', 'low'),
('system_down', 'ระบบล่ม', 'high'),
('branch_redeem', 'Redeem หน้าสาขา', 'low'),
('manual_compensation', 'Manual compensation', 'medium'),
('other', 'อื่น ๆ', 'low')
ON DUPLICATE KEY UPDATE reason_label_th=VALUES(reason_label_th), severity=VALUES(severity);

-- ─── 10. Create indexes for performance ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_promo_codes_override_flag ON promo_codes(override_flag);
CREATE INDEX IF NOT EXISTS idx_promo_codes_override_at ON promo_codes(override_at);
CREATE INDEX IF NOT EXISTS idx_promo_codes_last_updated_at ON promo_codes(last_updated_at);
CREATE INDEX IF NOT EXISTS idx_promo_codes_last_updated_by ON promo_codes(last_updated_by);
