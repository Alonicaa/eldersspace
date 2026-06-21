# ElderSpace Database - Quick Reference Guide

## Table Summary (28 Tables Total)

### Core User Management (3 tables)
| Table | PK | Key Columns | Purpose |
|-------|----|----|---------|
| `users` | user_id | phone_number(UNIQUE), role, total_points, is_blocked | User accounts and profiles |
| `followers` | id | follower_id, following_id | Follow relationships |

### Content Management (4 tables)
| Table | PK | Key Columns | Purpose |
|-------|----|----|---------|
| `posts` | post_id | user_id, visibility, shared_post_id, is_deleted | User posts and shares |
| `post_images` | image_id | post_id, image_url | Post image attachments |
| `post_likes` | id | post_id, user_id, type(like/dislike) | Post reactions |
| `comments` | comment_id | post_id, user_id, parent_id, is_deleted | Post comments and replies |

### Reporting & Moderation (3 tables)
| Table | PK | Key Columns | Purpose |
|-------|----|----|---------|
| `post_reports` | report_id | post_id, reporter_user_id, status | Post violation reports |
| `comment_reports` | report_id | comment_id, reporter_user_id, status | Comment violation reports |
| `post_moderation_logs` | id | post_id, admin_actor, action | Moderation audit trail |

### Notifications (1 table)
| Table | PK | Key Columns | Purpose |
|-------|----|----|---------|
| `notifications` | notification_id | user_id, actor_id, type, is_read, redemption_id | All user notifications |

### Rewards & Incentives (3 tables)
| Table | PK | Key Columns | Purpose |
|-------|----|----|---------|
| `rewards` | reward_id | reward_name, points_required, category, stock, user_limit | Available rewards |
| `reward_settings` | setting_id | points_per_minute, daily_login_bonus, etc. | Global reward configuration |
| `bonus_events` | event_id | event_type, points_awarded, start_date, end_date | Special bonus events |

### Promo Codes & Campaigns (3 tables)
| Table | PK | Key Columns | Purpose |
|-------|----|----|---------|
| `promo_campaigns` | campaign_id | reward_id, campaign_name, campaign_start_date | Promotional campaigns |
| `promo_codes` | promo_code_id | code(UNIQUE), reward_id, is_used, used_by_user_id | Individual promo codes |
| `promo_code_logs` | log_id | promo_code_id, action, user_id | Promo code audit trail |

### QR Codes & Reward Redemption (3 tables)
| Table | PK | Key Columns | Purpose |
|-------|----|----|---------|
| `qr_codes` | qr_id | code(UNIQUE), user_id, reward_id, is_used, expires_at | Generated QR codes |
| `qr_code_logs` | log_id | qr_id, action, status, ip_address | QR code scan logs |
| `reward_redemption_history` | redemption_id | user_id, reward_id, qr_code, redemption_status | Redemption tracking |

### Activity-Based Rewards (4 tables)
| Table | PK | Key Columns | Purpose |
|-------|----|----|---------|
| `post_activity_rewards` | id | user_id, reward_date(UNQ with user), points_awarded | Daily post activity |
| `comment_activity_rewards` | id | user_id, reward_date(UNQ with user), points_awarded | Daily comment activity |
| `share_activity_rewards` | id | user_id, shared_post_id(UNQ with user), points_awarded | Share activity |
| `account_milestone_rewards` | id | user_id, milestone_type(UNQ with user) | Achievement tracking |

### Sessions & Transactions (2 tables)
| Table | PK | Key Columns | Purpose |
|-------|----|----|---------|
| `app_sessions` | session_id | user_id, started_at, duration_minutes | App usage sessions |
| `points_transactions` | transaction_id | user_id, source_type, points, type(earn/deduct) | Point history |

### Logging & Audit (2 tables)
| Table | PK | Key Columns | Purpose |
|-------|----|----|---------|
| `security_logs` | id | event_type, actor_name, actor_phone, target_phone | Security audit trail |
| `admin_logs` | id | event, user | Admin action log |

---

## Critical SQL Queries

### User Queries
```sql
-- Get user by phone
SELECT * FROM users WHERE phone_number = '0800000001';

-- Get user statistics
SELECT user_id, full_name, total_points, login_streak, is_blocked 
FROM users WHERE user_id = 1;

-- Get followers/following count
SELECT 
  (SELECT COUNT(*) FROM followers WHERE following_id = 1) as followers,
  (SELECT COUNT(*) FROM followers WHERE follower_id = 1) as following;
```

### Post Queries
```sql
-- Get user posts with stats
SELECT p.post_id, p.content, p.created_at,
  COUNT(DISTINCT CASE WHEN pl.type='like' THEN pl.id END) as likes,
  COUNT(DISTINCT CASE WHEN pl.type='dislike' THEN pl.id END) as dislikes,
  COUNT(DISTINCT c.comment_id) as comments
FROM posts p
LEFT JOIN post_likes pl ON p.post_id = pl.post_id
LEFT JOIN comments c ON p.post_id = c.post_id
WHERE p.user_id = 1 AND p.is_deleted = 0
GROUP BY p.post_id;

-- Get trending posts
SELECT p.post_id, p.content, u.full_name,
  COUNT(pl.id) as total_reactions,
  COUNT(c.comment_id) as comments
FROM posts p
JOIN users u ON p.user_id = u.user_id
LEFT JOIN post_likes pl ON p.post_id = pl.post_id
LEFT JOIN comments c ON p.post_id = c.post_id
WHERE DATE(p.created_at) >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY p.post_id
ORDER BY total_reactions DESC
LIMIT 10;
```

### Reward Queries
```sql
-- Get available rewards for user
SELECT * FROM rewards 
WHERE is_active = 1 AND points_required <= ? 
  AND (user_limit = -1 OR user_limit > 
    (SELECT COUNT(*) FROM reward_redemption_history 
     WHERE user_id = ? AND reward_id = rewards.reward_id))
ORDER BY points_required;

-- Get user reward history
SELECT r.reward_name, rh.points_redeemed, rh.redemption_status, rh.redeemed_at
FROM reward_redemption_history rh
JOIN rewards r ON rh.reward_id = r.reward_id
WHERE rh.user_id = ?
ORDER BY rh.redeemed_at DESC;

-- Get points transactions
SELECT source_type, SUM(CASE WHEN type='earn' THEN points ELSE -points END) as net_points
FROM points_transactions
WHERE user_id = ? AND DATE(created_at) >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY source_type;
```

### Moderation Queries
```sql
-- Get pending reports
SELECT pr.report_id, pr.reason, p.content, u.full_name
FROM post_reports pr
JOIN posts p ON pr.post_id = p.post_id
JOIN users u ON p.user_id = u.user_id
WHERE pr.status = 'pending'
ORDER BY pr.created_at DESC;

-- Get blocked users
SELECT user_id, phone_number, full_name, blocked_reason, blocked_at
FROM users
WHERE is_blocked = 1
ORDER BY blocked_at DESC;
```

### Notification Queries
```sql
-- Get unread notifications for user
SELECT * FROM notifications
WHERE user_id = ? AND is_read = 0
ORDER BY created_at DESC
LIMIT 20;

-- Mark notification as read
UPDATE notifications SET is_read = 1
WHERE notification_id = ? AND user_id = ?;
```

---

## Index Performance Strategy

### Query Pattern → Index Used
| Query Type | Index | Performance |
|-----------|-------|-------------|
| Find user by phone | `users.phone_number` | ⚡ Excellent |
| Get user posts | `posts.user_id, created_at` | ⚡ Excellent |
| Count post likes | `post_likes.post_id` | ⚡ Excellent |
| Check if following | `followers(follower_id, following_id)` | ⚡ Excellent |
| Get notifications | `notifications.user_id, is_read` | ⚡ Excellent |
| Filter by status | `post_reports.status, created_at` | ⚡ Excellent |
| Date range queries | `created_at` on all tables | ✓ Good |
| Get user points | `users.total_points` | ✓ Good |

---

## Character Encoding

**All tables use:** `utf8mb4_unicode_ci`
- Supports: Emoji, Thai characters, Chinese, Japanese, Korean, etc.
- Case-insensitive collation (proper for names, usernames)
- Recommended for international applications

---

## Foreign Key Structure

```
users
  ├─ followers (follower_id → users.user_id)
  ├─ followers (following_id → users.user_id)
  ├─ posts (user_id → users.user_id)
  ├─ comments (user_id → users.user_id)
  ├─ post_likes (user_id → users.user_id)
  ├─ security_logs (actor/target reference)
  └─ (many more...)

posts
  ├─ post_images (post_id → posts.post_id)
  ├─ post_likes (post_id → posts.post_id)
  ├─ comments (post_id → posts.post_id)
  ├─ post_reports (post_id → posts.post_id)
  └─ posts (shared_post_id → posts.post_id, self-reference)

rewards
  ├─ promo_codes (reward_id → rewards.reward_id)
  ├─ qr_codes (reward_id → rewards.reward_id)
  ├─ reward_redemption_history (reward_id → rewards.reward_id)
  └─ bonus_events (implicit through business logic)
```

---

## Data Integrity Rules

| Rule | Implementation | Why |
|------|---------------|----|
| One phone number per user | UNIQUE constraint on users.phone_number | Phone is unique identifier |
| No duplicate follows | UNIQUE(follower_id, following_id) | Prevent double-follow |
| No duplicate likes | UNIQUE(post_id, user_id) | One reaction per user per post |
| No duplicate reports | UNIQUE(post_id, reporter_user_id) | Prevent spam reports |
| Cascade delete | ON DELETE CASCADE on all FKs | Clean data when user deleted |
| Soft delete posts | is_deleted flag | Preserve data for audit |
| Date constraints | Created before modified | Data consistency |

---

## Performance Tuning Tips

1. **Add indexes for frequently filtered columns**
   ```sql
   -- For new queries, check EXPLAIN output
   EXPLAIN SELECT * FROM posts WHERE user_id = 1 AND created_at > NOW() - INTERVAL 7 DAY;
   ```

2. **Use composite indexes for common queries**
   ```sql
   -- Consider if querying both together frequently
   CREATE INDEX idx_user_created ON posts(user_id, created_at);
   ```

3. **Archive old data periodically**
   ```sql
   -- Move data older than 2 years to archive table
   DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL 2 YEAR);
   ```

4. **Monitor slow queries**
   ```sql
   SET GLOBAL slow_query_log = 'ON';
   SET GLOBAL long_query_time = 2;
   ```

---

## Backup and Recovery

### Daily Backup
```bash
mysqldump -u user -p eldersspace > backup_$(date +\%Y\%m\%d).sql
```

### Weekly Full Backup
```bash
mysqldump -u user -p --single-transaction --routines --events eldersspace > weekly_backup.sql
```

### Restore from Backup
```bash
mysql -u user -p eldersspace < backup_20260511.sql
```

---

## Connection String Examples

### Node.js (MariaDB)
```javascript
const pool = mariadb.createPool({
  host: 'localhost',
  port: 3306,
  user: 'eldersspace_user',
  password: 'password',
  database: 'eldersspace',
  connectionLimit: 5
});
```

### Python
```python
import mysql.connector
connection = mysql.connector.connect(
  host='localhost',
  port=3306,
  user='eldersspace_user',
  password='password',
  database='eldersspace'
)
```

### PHP PDO
```php
$pdo = new PDO(
  'mysql:host=localhost;dbname=eldersspace;charset=utf8mb4',
  'eldersspace_user',
  'password'
);
```

---

## File Reference

| File | Purpose | Last Updated |
|------|---------|--------------|
| `complete_database_schema.sql` | Full schema dump (28 tables) | 2026-05-11 |
| `SCHEMA_DOCUMENTATION.md` | Detailed table descriptions | 2026-05-11 |
| `SETUP_GUIDE.sql` | Step-by-step installation | 2026-05-11 |
| `QUICK_REFERENCE.md` | This file | 2026-05-11 |

---

**Last Updated:** May 11, 2026  
**Database Version:** 1.0  
**Total Tables:** 28  
**Compatibility:** MySQL 5.7+, MariaDB 10.3+
