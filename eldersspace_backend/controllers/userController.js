const pool = require('../config/db.js');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  ensureModerationColumns,
  getUserModerationByPhone
} = require('../services/moderationService');

const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');
const AVATAR_DIR = 'avatars';

function normalizePhoneForPath(phone) {
  return (
    String(phone || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '_') || 'unknown'
  );
}

function normalizeStoredPath(storedPath) {
  return String(storedPath || '').replace(/\\/g, '/');
}

const BACKEND_URL = process.env.BACKEND_URL || 'http://10.0.2.2:3000';

function buildUploadUrl(storedPath) {
  const normalized = normalizeStoredPath(storedPath);
  return normalized ? `${BACKEND_URL}/uploads/${normalized}` : null;
}

// Multer – profile picture upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const safePhone = normalizePhoneForPath(req.params.phone_number);
      const userAvatarDir = path.join(UPLOADS_ROOT, AVATAR_DIR, safePhone);
      fs.mkdirSync(userAvatarDir, { recursive: true });
      cb(null, userAvatarDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '_avatar' + ext.toLowerCase());
  },
});
exports.uploadAvatar = multer({ storage }).single('avatar');

// Register (legacy)
exports.registerUser = async (req, res) => {
  const { full_name, phone_number, password } = req.body;
  try {
    const conn = await pool.getConnection();
    await conn.query(
      `INSERT INTO users (full_name, phone_number, password, role, is_verified)
       VALUES (?, ?, ?, ?, ?)`,
      [full_name, phone_number, password, 'elder', false]
    );
    conn.release();
    res.json({ message: 'User registered successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Upload / Update profile picture
exports.updateProfilePicture = async (req, res) => {
  const { phone_number } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });
  try {
    const conn = await pool.getConnection();
    const [user] = await conn.query(
      'SELECT user_id, profile_picture FROM users WHERE phone_number = ?',
      [phone_number]
    );
    if (user.length === 0) { conn.release(); return res.status(404).json({ error: 'User not found' }); }

    const safePhone = normalizePhoneForPath(phone_number);
    const storedPath = normalizeStoredPath(
      path.posix.join(AVATAR_DIR, safePhone, req.file.filename)
    );

    await conn.query('UPDATE users SET profile_picture = ? WHERE user_id = ?', [storedPath, user[0].user_id]);

    // Remove old avatar when user uploads a replacement image.
    const oldStoredPath = normalizeStoredPath(user[0].profile_picture);
    if (oldStoredPath) {
      const oldAbsolutePath = path.join(UPLOADS_ROOT, ...oldStoredPath.split('/'));
      if (fs.existsSync(oldAbsolutePath)) {
        fs.unlinkSync(oldAbsolutePath);
      }
    }

    conn.release();
    res.json({
      message: 'Profile picture updated',
      profile_picture_path: storedPath,
      profile_picture_url: buildUploadUrl(storedPath),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get profile picture
exports.getProfilePicture = async (req, res) => {
  const { phone_number } = req.params;
  try {
    const conn = await pool.getConnection();
    const [user] = await conn.query('SELECT profile_picture FROM users WHERE phone_number = ?', [phone_number]);
    conn.release();
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });
    const pic = normalizeStoredPath(user[0].profile_picture);
    res.json({
      profile_picture_path: pic || null,
      profile_picture_url: buildUploadUrl(pic),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update name
exports.updateName = async (req, res) => {
  const { phone_number } = req.params;
  const { full_name } = req.body;
  try {
    const conn = await pool.getConnection();
    const [user] = await conn.query('SELECT user_id, full_name FROM users WHERE phone_number = ?', [phone_number]);
    if (user.length === 0) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    await conn.query('UPDATE users SET full_name = ? WHERE phone_number = ?', [full_name, phone_number]);
    await conn.query(`INSERT INTO user_activity_logs (user_id, action_type, old_value, new_value) VALUES (?, ?, ?, ?)`,
      [user[0].user_id, 'CHANGE_NAME', user[0].full_name, full_name]);
    conn.release();
    res.json({ message: 'Name updated and logged' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update about me
exports.updateAboutMe = async (req, res) => {
  const { phone_number } = req.params;
  const { about_me } = req.body;
  try {
    const conn = await pool.getConnection();
    const [user] = await conn.query('SELECT user_id FROM users WHERE phone_number = ?', [phone_number]);
    if (user.length === 0) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    await conn.query('UPDATE users SET about_me = ? WHERE phone_number = ?', [about_me || null, phone_number]);
    conn.release();
    res.json({ message: 'About me updated', about_me: about_me || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get about me
exports.getAboutMe = async (req, res) => {
  const { phone_number } = req.params;
  try {
    const conn = await pool.getConnection();
    const [user] = await conn.query('SELECT about_me FROM users WHERE phone_number = ?', [phone_number]);
    conn.release();
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ about_me: user[0].about_me || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Follow user
exports.followUser = async (req, res) => {
  const { phone_number } = req.params;
  const { follower_phone } = req.body;
  try {
    const conn = await pool.getConnection();
    const [target]   = await conn.query('SELECT user_id FROM users WHERE phone_number = ?', [phone_number]);
    const [follower] = await conn.query('SELECT user_id FROM users WHERE phone_number = ?', [follower_phone]);
    if (!target.length || !follower.length) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    if (target[0].user_id === follower[0].user_id) { conn.release(); return res.status(400).json({ error: 'Cannot follow yourself' }); }
    await conn.query('INSERT IGNORE INTO followers (follower_id, following_id) VALUES (?, ?)', [follower[0].user_id, target[0].user_id]);
    conn.release();
    res.json({ message: 'Followed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Unfollow user
exports.unfollowUser = async (req, res) => {
  const { phone_number } = req.params;
  const { follower_phone } = req.body;
  try {
    const conn = await pool.getConnection();
    const [target]   = await conn.query('SELECT user_id FROM users WHERE phone_number = ?', [phone_number]);
    const [follower] = await conn.query('SELECT user_id FROM users WHERE phone_number = ?', [follower_phone]);
    if (!target.length || !follower.length) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    await conn.query('DELETE FROM followers WHERE follower_id = ? AND following_id = ?', [follower[0].user_id, target[0].user_id]);
    conn.release();
    res.json({ message: 'Unfollowed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Check follow status
exports.checkFollowStatus = async (req, res) => {
  const { phone_number } = req.params;
  const { viewer_phone } = req.query;
  try {
    const conn = await pool.getConnection();
    const [target] = await conn.query('SELECT user_id FROM users WHERE phone_number = ?', [phone_number]);
    const [viewer] = await conn.query('SELECT user_id FROM users WHERE phone_number = ?', [viewer_phone]);
    if (!target.length || !viewer.length) { conn.release(); return res.json({ is_following: false }); }
    const [row] = await conn.query('SELECT id FROM followers WHERE follower_id = ? AND following_id = ?', [viewer[0].user_id, target[0].user_id]);
    conn.release();
    res.json({ is_following: row.length > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Follow stats
exports.getFollowStats = async (req, res) => {
  const { phone_number } = req.params;
  try {
    const conn = await pool.getConnection();
    const [user] = await conn.query('SELECT user_id FROM users WHERE phone_number = ?', [phone_number]);
    if (!user.length) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    const [[followerRow]] = await conn.query('SELECT COUNT(*) as total FROM followers WHERE following_id = ?', [user[0].user_id]);
    const [[followingRow]] = await conn.query('SELECT COUNT(*) as total FROM followers WHERE follower_id  = ?', [user[0].user_id]);
    conn.release();
    res.json({
      followers: Number(followerRow.total || 0),
      following: Number(followingRow.total || 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getFollowers = async (req, res) => {
  const { phone_number } = req.params;
  try {
    const conn = await pool.getConnection();
    const [users] = await conn.query(
      `SELECT u.full_name, u.phone_number, u.profile_picture
       FROM followers f JOIN users u ON f.follower_id=u.user_id JOIN users me ON me.user_id=f.following_id
       WHERE me.phone_number=?`, [phone_number]);
    conn.release();
    res.json(users.map(u => ({ ...u, profile_picture_url: u.profile_picture ? `${BACKEND_URL}/uploads/` + u.profile_picture : null })));
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getFollowing = async (req, res) => {
  const { phone_number } = req.params;
  try {
    const conn = await pool.getConnection();
    const [users] = await conn.query(
      `SELECT u.full_name, u.phone_number, u.profile_picture
       FROM followers f JOIN users u ON f.following_id=u.user_id JOIN users me ON me.user_id=f.follower_id
       WHERE me.phone_number=?`, [phone_number]);
    conn.release();
    res.json(users.map(u => ({ ...u, profile_picture_url: u.profile_picture ? `${BACKEND_URL}/uploads/` + u.profile_picture : null })));
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// Get user posts (with visibility filter)
exports.getUserPosts = async (req, res) => {
  const { phone } = req.params;
  const viewer = req.query.viewer; // phone of person viewing

  try {
    const conn = await pool.getConnection();

    // ดึง user_id ของเจ้าของโปรไฟล์
    const [owner] = await conn.query('SELECT user_id FROM users WHERE phone_number=?', [phone]);
    if (!owner.length) { conn.release(); return res.json([]); }
    const ownerUserId = Number(owner[0].user_id);

    // ดึง user_id ของ viewer (ถ้ามี)
    let viewerUserId = null;
    if (viewer) {
      const [vr] = await conn.query('SELECT user_id FROM users WHERE phone_number=?', [viewer]);
      if (vr.length) viewerUserId = Number(vr[0].user_id);
    }

    const isOwner = viewerUserId === ownerUserId;

    // visibility condition สำหรับโปรไฟล์หน้านี้
    let visCond;
    if (isOwner) {
      // เจ้าของเห็นทุกโพสต์ตัวเอง
      visCond = `1=1`;
    } else if (!viewerUserId) {
      // ไม่ได้ login เห็นแค่ public
      visCond = `p.visibility = 'public'`;
    } else {
      visCond = `(
        p.visibility = 'public'
        OR (
          p.visibility = 'followers'
          AND EXISTS (SELECT 1 FROM followers WHERE follower_id=${viewerUserId} AND following_id=${ownerUserId})
        )
        OR (
          p.visibility = 'friends'
          AND EXISTS (
            SELECT 1 FROM followers f1
            JOIN followers f2
              ON f1.follower_id=${viewerUserId} AND f1.following_id=${ownerUserId}
             AND f2.follower_id=${ownerUserId}  AND f2.following_id=${viewerUserId}
          )
        )
      )`;
    }

    let extraSelect = '';
    if (viewerUserId) {
      extraSelect = `, (SELECT type FROM post_likes WHERE post_id=p.post_id AND user_id=${viewerUserId}) as user_like`;
    }

    const [posts] = await conn.query(
      `SELECT p.*, u.full_name, u.phone_number, u.profile_picture${extraSelect},
        (SELECT COUNT(*) FROM post_likes WHERE post_id=p.post_id AND type='like')    as likes,
        (SELECT COUNT(*) FROM post_likes WHERE post_id=p.post_id AND type='dislike') as dislikes,
        (SELECT COUNT(*) FROM comments    WHERE post_id=p.post_id AND is_deleted=0)  as comments
       FROM posts p
       JOIN users u ON p.user_id=u.user_id
       WHERE u.phone_number=?
         AND p.is_deleted=0
         AND ${visCond}
       ORDER BY p.created_at DESC`,
      [phone]
    );

    for (let post of posts) {
      const [imgs] = await conn.query('SELECT image_url FROM post_images WHERE post_id=?', [post.post_id]);
      post.images = imgs.map(i => `${BACKEND_URL}/uploads/` + i.image_url);
      post.profile_picture_url = post.profile_picture
        ? `${BACKEND_URL}/uploads/` + post.profile_picture : null;

      // ดึงโพสต์ต้นฉบับจริงๆ (chase chain จนถึง root)
      if (post.shared_post_id) {
        let currentId = Number(post.shared_post_id);
        const visited = new Set();
        let rootPost  = null;

        while (currentId) {
          if (visited.has(currentId)) break;
          visited.add(currentId);

          const [origRows] = await conn.query(
            `SELECT p.post_id, p.content, p.created_at, p.shared_post_id,
                    u.full_name, u.phone_number, u.profile_picture
             FROM posts p
             JOIN users u ON p.user_id=u.user_id
             WHERE p.post_id=?`,
            [currentId]
          );
          if (!origRows.length) break;

          const row = origRows[0];

          if (row.shared_post_id) {
            // ยังแชร์ต่ออีก → ไปหาต้นฉบับของมัน
            currentId = Number(row.shared_post_id);
            continue;
          }

          // เจอต้นฉบับแล้ว
          const [origImgs] = await conn.query(
            'SELECT image_url FROM post_images WHERE post_id=?', [row.post_id]
          );
          row.images = origImgs.map(i => `${BACKEND_URL}/uploads/` + i.image_url);
          row.profile_picture_url = row.profile_picture
            ? `${BACKEND_URL}/uploads/` + row.profile_picture : null;
          delete row.shared_post_id;
          rootPost = row;
          break;
        }

        post.shared_post = rootPost;
      } else {
        post.shared_post = null;
      }
    }

    conn.release();
    res.json(posts.map(p => ({
      ...p,
      likes:    Number(p.likes),
      dislikes: Number(p.dislikes),
      comments: Number(p.comments)
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getModerationStatus = async (req, res) => {
  const { phone_number } = req.params;
  let conn;

  try {
    conn = await pool.getConnection();
    await ensureModerationColumns(conn);

    const status = await getUserModerationByPhone(conn, phone_number);
    if (!status) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      phone_number: status.phoneNumber,
      is_blocked: status.isBlocked,
      blocked_reason: status.blockedReason,
      warning_note: status.warningNote,
      blocked_at: status.blockedAt
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
};

// Get profile details
exports.getProfileDetails = async (req, res) => {
  const { phone_number } = req.params;
  try {
    const conn = await pool.getConnection();
    const [user] = await conn.query(
      `SELECT current_location, hometown, birth_date, relationship_status, family_info, gender, pronouns
       FROM users WHERE phone_number = ?`,
      [phone_number]
    );
    conn.release();
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    res.json({
      current_location: user[0].current_location || null,
      hometown: user[0].hometown || null,
      birth_date: user[0].birth_date || null,
      relationship_status: user[0].relationship_status || null,
      family_info: user[0].family_info || null,
      gender: user[0].gender || null,
      pronouns: user[0].pronouns || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update profile details
exports.updateProfileDetails = async (req, res) => {
  const { phone_number } = req.params;
  const { current_location, hometown, birth_date, relationship_status, family_info, gender, pronouns } = req.body;
  
  try {
    const conn = await pool.getConnection();
    const [user] = await conn.query('SELECT user_id FROM users WHERE phone_number = ?', [phone_number]);
    if (user.length === 0) { conn.release(); return res.status(404).json({ error: 'User not found' }); }

    await conn.query(
      `UPDATE users SET 
        current_location = ?, 
        hometown = ?, 
        birth_date = ?, 
        relationship_status = ?, 
        family_info = ?, 
        gender = ?, 
        pronouns = ? 
       WHERE phone_number = ?`,
      [current_location, hometown, birth_date, relationship_status, family_info, gender, pronouns, phone_number]
    );
    
    conn.release();
    res.json({ 
      message: 'Profile details updated',
      current_location: current_location || null,
      hometown: hometown || null,
      birth_date: birth_date || null,
      relationship_status: relationship_status || null,
      family_info: family_info || null,
      gender: gender || null,
      pronouns: pronouns || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};