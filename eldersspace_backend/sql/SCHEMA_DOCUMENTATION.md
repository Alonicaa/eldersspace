# ElderSpace Complete Database Schema Documentation

## Overview
This document describes the complete database schema for the ElderSpace project. The database contains 28 tables organized into 10 logical categories. All tables use InnoDB engine with utf8mb4 charset and utf8mb4_unicode_ci collation.

---

## Database Quick Reference

**Database Name:** `eldersspace`  
**Character Set:** `utf8mb4`  
**Collation:** `utf8mb4_unicode_ci`  
**Engine:** InnoDB  
**Total Tables:** 28  

---

## Table Categories and Purposes

### 1. CORE USER MANAGEMENT TABLES (3 tables)

#### `users` - User Information
- **Primary Key:** `user_id`
- **Unique Columns:** `phone_number`
- **Key Columns:**
  - `role`: ENUM('admin', 'elder', 'caregiver') - User type
  - `total_points`: User's reward points
  - `login_streak`: Consecutive login days
  - `is_blocked`: Account suspension status
- **Contains:** Full name, contact, profile picture, location info, gender, pronouns, family info, about me, moderation status
- **Indexes:** phone_number, role, is_blocked, total_points, created_at

#### `followers` - Follow Relationships
- **Primary Key:** `id`
- **Foreign Keys:** `follower_id`, `following_id` (both reference users)
- **Unique:** (follower_id, following_id) - prevents duplicate follows
- **Purpose:** Maintains social graph for follow/unfollow relationships
- **Indexes:** follower_id, following_id

---

### 2. CONTENT MANAGEMENT TABLES (4 tables)

#### `posts` - User Posts and Shares
- **Primary Key:** `post_id`
- **Foreign Keys:** `user_id`, `shared_post_id` (self-referencing for shares)
- **Key Columns:**
  - `visibility`: 'public', 'followers', 'friends', 'only_me'
  - `shared_post_id`: For re-sharing posts (creates chain)
  - `is_deleted`: Soft delete flag
- **Contains:** Post content, timestamps
- **Indexes:** user_id, shared_post_id, is_deleted, created_at, visibility

#### `post_images` - Post Image Attachments
- **Primary Key:** `image_id`
- **Foreign Key:** `post_id`
- **Key Columns:**
  - `image_url`: Storage path of the image
- **Purpose:** Stores URLs of images attached to posts
- **Indexes:** post_id

#### `post_likes` - Post Reactions (Likes/Dislikes)
- **Primary Key:** `id`
- **Foreign Keys:** `post_id`, `user_id`
- **Unique:** (post_id, user_id) - one reaction per user per post
- **Key Columns:**
  - `type`: ENUM('like', 'dislike')
- **Indexes:** post_id, user_id, type

#### `comments` - Post Comments and Replies
- **Primary Key:** `comment_id`
- **Foreign Keys:** `post_id`, `user_id`, `parent_id` (for nested replies)
- **Key Columns:**
  - `is_deleted`: Soft delete flag
  - `parent_id`: For threaded replies (references another comment)
- **Contains:** Comment text, timestamps
- **Indexes:** post_id, user_id, parent_id, is_deleted, created_at

---

### 3. REPORTING AND MODERATION TABLES (3 tables)

#### `post_reports` - Post Violation Reports
- **Primary Key:** `report_id`
- **Foreign Keys:** `post_id`, `reporter_user_id`
- **Unique:** (post_id, reporter_user_id) - prevents duplicate reports
- **Key Columns:**
  - `status`: ENUM('pending', 'reviewed', 'dismissed')
  - `reason`: Violation category
- **Purpose:** Tracks user reports of inappropriate posts
- **Indexes:** post_id, status, created_at

#### `comment_reports` - Comment Violation Reports
- **Primary Key:** `report_id`
- **Foreign Keys:** `comment_id`, `reporter_user_id`
- **Structure:** Similar to post_reports but for comments
- **Indexes:** comment_id, status, created_at

#### `post_moderation_logs` - Moderation Actions Audit Trail
- **Primary Key:** `id`
- **Foreign Key:** `post_id`
- **Key Columns:**
  - `admin_actor`: Who performed the action
  - `action`: 'delete', 'hide', 'warn', 'dismiss'
  - `reason`: Why action was taken
  - `note`: Additional warning for user
- **Purpose:** Tracks all moderation actions for audit
- **Indexes:** post_id, created_at

---

### 4. NOTIFICATIONS TABLE (1 table)

#### `notifications` - User Notifications
- **Primary Key:** `notification_id`
- **Foreign Keys:** `user_id`, `actor_id`, `post_id`, `redemption_id`
- **Key Columns:**
  - `type`: ENUM('like', 'comment', 'reply', 'follow', 'share', 'reward_redemption')
  - `is_read`: Read/unread status
  - `content`: JSON data for complex notifications
  - `reward_name`, `qr_code`: For reward redemption notifications
- **Purpose:** Tracks all notifications (social, system, rewards)
- **Indexes:** user_id, type, created_at, is_read

---

### 5. REWARDS AND INCENTIVE TABLES (2 tables)

#### `rewards` - Available Rewards/Incentives
- **Primary Key:** `reward_id`
- **Key Columns:**
  - `points_required`: Points needed to redeem
  - `category`: Type of reward
  - `stock`: Available inventory
  - `user_limit`: Max times per user (-1 = unlimited)
  - `usage_instructions`: How to use reward
  - `image_url`: Reward image
  - `is_active`: Active/inactive status
- **Purpose:** Master list of all available rewards
- **Indexes:** category, is_active, points_required

#### `reward_settings` - Reward System Configuration
- **Primary Key:** `setting_id` (usually only 1 row)
- **Key Columns:**
  - `points_per_minute`: Base earning rate
  - `session_bonus_threshold`: Min session time for bonus
  - `session_bonus_points`: Bonus points for reaching threshold
  - `daily_login_bonus`: Daily check-in reward
  - `streak_milestone_bonus`: Bonus for login streak
  - `profile_completion_points`: One-time profile setup bonus
  - `post_activity_points`: Points per post activity
  - `comment_activity_points`: Points per comment
  - `share_activity_points`: Points per share
- **Purpose:** Global configuration for all point calculations
- **Contains:** All multipliers and thresholds

#### `bonus_events` - Special Bonus Events
- **Primary Key:** `event_id`
- **Key Columns:**
  - `event_type`: Type of bonus event
  - `points_awarded`: Points for this event
  - `start_date`, `end_date`: Event duration
  - `max_points_per_user`: Cap per user
  - `is_active`: Active/inactive
- **Purpose:** Temporary bonus events (holidays, special occasions)
- **Indexes:** event_type, is_active, dates

---

### 6. PROMO CODE AND CAMPAIGN TABLES (3 tables)

#### `promo_campaigns` - Promotional Campaigns
- **Primary Key:** `campaign_id`
- **Foreign Key:** `reward_id`
- **Key Columns:**
  - `campaign_name`: Campaign identifier
  - `campaign_start_date`, `campaign_end_date`: Duration
  - `is_active`: Status
- **Purpose:** Organizes promo codes into campaigns
- **Indexes:** reward_id, is_active, dates

#### `promo_codes` - Individual Promo Codes
- **Primary Key:** `promo_code_id`
- **Foreign Keys:** `reward_id`, `campaign_id`, `used_by_user_id`
- **Unique:** `code` - code must be unique
- **Key Columns:**
  - `code`: The actual promo code string
  - `is_used`: Whether already redeemed
  - `used_by_user_id`, `used_by_phone`: Who used it
  - `used_at`: When it was used
  - `expiry_date`: Expiration date
  - `batch_upload_id`: For bulk uploads
- **Purpose:** Stores individual promo codes
- **Indexes:** code, reward_id, is_used, campaign_id

#### `promo_code_logs` - Promo Code Audit Trail
- **Primary Key:** `log_id`
- **Foreign Keys:** `promo_code_id`, `user_id`, `reward_id`
- **Key Columns:**
  - `action`: Action type (create, use, expire, validate)
- **Purpose:** Audit trail for all promo code events
- **Indexes:** promo_code_id, action, user_id

---

### 7. QR CODE AND REWARD REDEMPTION TABLES (3 tables)

#### `qr_codes` - QR Code Management
- **Primary Key:** `qr_id`
- **Foreign Keys:** `user_id`, `reward_id`
- **Unique:** `code` - QR code string
- **Key Columns:**
  - `code`: Generated QR code
  - `points_redeemed`: Points used for this reward
  - `is_used`: Whether already scanned
  - `expires_at`: QR code expiration
- **Purpose:** Stores generated QR codes for reward redemption
- **Indexes:** code, user_id, is_used, expires_at

#### `qr_code_logs` - QR Code Scan Logs
- **Primary Key:** `log_id`
- **Foreign Keys:** `qr_id`, `user_id`
- **Key Columns:**
  - `action`: 'verify', 'use', 'expire', 'failed'
  - `status`: 'success', 'expired', 'already_used', 'invalid'
  - `ip_address`, `user_agent`: Scan context
- **Purpose:** Detailed audit of QR code scanning activities
- **Indexes:** qr_code, qr_id, user_id, action, scanned_at

#### `reward_redemption_history` - Reward Redemption Tracking
- **Primary Key:** `redemption_id`
- **Foreign Keys:** `user_id`, `reward_id`
- **Unique:** `qr_code` - links to generated QR
- **Key Columns:**
  - `redemption_status`: 'pending', 'scanned', 'used', 'expired', 'cancelled'
  - `redeemed_at`: When user clicked redeem
  - `scanned_at`: When shop scanned QR
  - `used_at`: When marked as used
  - `expires_at`: Expiration date
- **Purpose:** Complete history of reward redemptions
- **Indexes:** user_id, reward_id, qr_code, status, expires_at

---

### 8. ACTIVITY-BASED REWARDS TABLES (4 tables)

#### `post_activity_rewards` - Post Activity Tracking
- **Primary Key:** `id`
- **Foreign Key:** `user_id`
- **Unique:** (user_id, reward_date) - one per user per day
- **Key Columns:**
  - `reward_date`: Date of activity
  - `post_count`: Number of posts
  - `points_awarded`: Bonus points earned
- **Purpose:** Tracks daily post activity for rewards
- **Indexes:** user_id, reward_date

#### `comment_activity_rewards` - Comment Activity Tracking
- **Primary Key:** `id`
- **Foreign Key:** `user_id`
- **Structure:** Similar to post_activity_rewards
- **Purpose:** Tracks daily comment activity (max 5 per day)

#### `share_activity_rewards` - Share Activity Tracking
- **Primary Key:** `id`
- **Foreign Keys:** `user_id`, `shared_post_id`
- **Unique:** (user_id, shared_post_id) - one reward per share
- **Purpose:** Tracks share activity (one reward per original post)

#### `account_milestone_rewards` - Account Milestone Tracking
- **Primary Key:** `id`
- **Foreign Key:** `user_id`
- **Unique:** (user_id, milestone_type) - one per milestone type
- **Key Columns:**
  - `milestone_type`: 'profile_completion', 'verified_account', etc.
  - `points_awarded`: Bonus for achieving milestone
- **Purpose:** Tracks one-time achievement rewards

---

### 9. SESSION AND ACTIVITY TRACKING TABLES (2 tables)

#### `app_sessions` - App Usage Sessions
- **Primary Key:** `session_id`
- **Foreign Key:** `user_id`
- **Key Columns:**
  - `started_at`: When session began
  - `ended_at`: When session ended
  - `duration_minutes`: Session length
  - `points_awarded`: Bonus points for this session
  - `device_info`: Device information
- **Purpose:** Tracks app usage sessions for time-based rewards
- **Indexes:** user_id, started_at, created_at

#### `points_transactions` - Points Transaction History
- **Primary Key:** `transaction_id`
- **Foreign Key:** `user_id`
- **Key Columns:**
  - `source_type`: 'daily_checkin', 'app_time', 'admin', 'post_activity', etc.
  - `points`: Amount (positive = earned, negative = spent)
  - `type`: 'earn' or 'deduct'
- **Purpose:** Complete audit of all point transactions
- **Indexes:** user_id, created_at

---

### 10. LOGGING AND AUDIT TABLES (2 tables)

#### `security_logs` - Security Event Logging
- **Primary Key:** `id`
- **Key Columns:**
  - `event_type`: OTP, login, block/unblock, etc.
  - `actor_name`, `actor_phone`: Who performed action
  - `target_name`, `target_phone`: Who was affected
  - `ip_address`, `device`: Request context
- **Purpose:** Comprehensive security audit trail
- **Indexes:** created_at, event_type, actor_phone, target_phone

#### `admin_logs` - Admin Action Logging
- **Primary Key:** `id`
- **Key Columns:**
  - `event`: What happened
  - `user`: Who did it
- **Purpose:** General admin action audit trail
- **Indexes:** created_at

---

## Foreign Key Relationships

### User-Related
```
users → followers (one user can have many followers/following)
users → posts (one user creates many posts)
users → comments (one user creates many comments)
users → post_likes (one user creates many likes)
```

### Content-Related
```
posts → post_images (one post has many images)
posts → post_likes (one post receives many likes)
posts → comments (one post has many comments)
comments → comment_reports (one comment has many reports)
posts → post_reports (one post has many reports)
```

### Reward-Related
```
users → reward_redemption_history (one user redeems many rewards)
users → qr_codes (one user generates many QR codes)
rewards → qr_codes (one reward can be redeemed many times)
rewards → promo_codes (one reward per campaign)
users → points_transactions (one user has many transactions)
```

---

## How to Use This Schema

### 1. Fresh Installation
```sql
-- Source the complete schema file
SOURCE /path/to/eldersspace_backend/sql/complete_database_schema.sql;

-- Or import via command line
mysql -u user -p eldersspace < complete_database_schema.sql
```

### 2. Add Initial Data
```sql
-- Create reward settings (required)
INSERT INTO reward_settings (setting_id) VALUES (1);

-- Add sample rewards
INSERT INTO rewards (reward_name, points_required, category, is_active)
VALUES ('Coffee', 50, 'Beverages', 1);
```

### 3. Verify Installation
```sql
-- Check all tables exist
SHOW TABLES;

-- Verify table counts
SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'eldersspace';
-- Should return 28

-- Check sample data
SELECT * FROM reward_settings;
SELECT COUNT(*) FROM users;
```

---

## Key Indexes for Performance

### Most Important (Query Performance)
- `users.phone_number` - Used in every auth query
- `posts.user_id` - Used to retrieve user posts
- `followers.follower_id` - Used to check follow status
- `notifications.user_id` - Used to fetch user notifications
- `post_likes.post_id` - Used to count likes

### Activity Tracking
- `created_at` on: users, posts, comments, rewards, notifications, security_logs
- Composite indexes for date range queries

---

## Maintenance and Backups

### Regular Backups
```bash
# Full backup
mysqldump -u user -p eldersspace > backup_$(date +%Y%m%d_%H%M%S).sql

# With procedures and events
mysqldump -u user -p --routines --events eldersspace > full_backup.sql
```

### Check Database Health
```sql
-- Check for corrupt tables
CHECK TABLE users, posts, comments, rewards;

-- Analyze tables
ANALYZE TABLE users, posts, comments;

-- Optimize tables
OPTIMIZE TABLE users, posts, comments;
```

---

## Notes and Best Practices

1. **Always use phone_number as primary identifier** - Never assume user_id is stable
2. **Soft deletes** - Posts and comments use `is_deleted` flag instead of hard delete
3. **Timestamps** - All tables include `created_at` and most include `updated_at`
4. **UTF8MB4** - Supports emoji and all Unicode characters
5. **Indexes** - Heavily indexed for read-heavy workloads
6. **Foreign keys** - All ON DELETE CASCADE for data consistency
7. **Unique constraints** - Prevent duplicates (follows, likes, reports)

---

**Last Updated:** 2026-05-11  
**Database Version:** 1.0  
**Total Tables:** 28  
**Estimated Rows (Production):** 50,000+ users, 1,000,000+ posts
