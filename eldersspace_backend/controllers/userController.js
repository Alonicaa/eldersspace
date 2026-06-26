const pool = require('../config/db.js');
const multer = require('multer');
const { uploadToStorage } = require('../config/supabaseStorage');
const {
  ensureModerationColumns,
  getUserModerationByPhone
} = require('../services/moderationService');

// Multer – profile picture upload (memory storage; file is uploaded to Supabase Storage)
exports.uploadAvatar = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('avatar');

// Register (legacy)
exports.registerUser = async (req, res) => {
  const { full_name, phone_number, password } = req.body;
  try {
    const conn = await pool.connect();
    await conn.query(
      `INSERT INTO users (full_name, phone_number, password, role, is_verified)
       VALUES ($1, $2, $3, $4, $5)`,
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
    const publicUrl = await uploadToStorage(req.file.buffer, req.file.originalname, req.file.mimetype, 'profiles');

    const conn = await pool.connect();
    const { rows: user } = await conn.query(
      'SELECT user_id FROM users WHERE phone_number = $1',
      [phone_number]
    );
    if (user.length === 0) { conn.release(); return res.status(404).json({ error: 'User not found' }); }

    await conn.query('UPDATE users SET profile_picture = $1 WHERE user_id = $2', [publicUrl, user[0].user_id]);

    conn.release();
    res.json({
      message: 'Profile picture updated',
      profile_picture_url: publicUrl,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const BACKEND_URL = process.env.BACKEND_URL || 'http://10.0.2.2:3000';
const SUPABASE_STORAGE_BASE = process.env.SUPABASE_URL
  ? `${process.env.SUPABASE_URL}/storage/v1/object/public/uploads`
  : null;

// Returns a full URL for a stored profile_picture value.
// New uploads store the full Supabase public URL directly.
// Legacy rows store a relative path like "avatars/+66xxx/file.jpg".
function resolveProfilePictureUrl(storedValue) {
  if (!storedValue) return null;
  if (/^https?:\/\//i.test(storedValue)) return storedValue;
  const clean = storedValue.replace(/\\/g, '/').replace(/^\/?(uploads\/)?/, '');
  if (SUPABASE_STORAGE_BASE) return `${SUPABASE_STORAGE_BASE}/${clean}`;
  return `${BACKEND_URL}/uploads/${clean}`;
}

// Get profile picture
exports.getProfilePicture = async (req, res) => {
  const { phone_number } = req.params;
  try {
    const conn = await pool.connect();
    const { rows: user } = await conn.query('SELECT profile_picture FROM users WHERE phone_number = $1', [phone_number]);
    conn.release();
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });
    const pic = user[0].profile_picture || null;
    res.json({
      profile_picture_url: resolveProfilePictureUrl(pic),
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
    const conn = await pool.connect();
    const { rows: user } = await conn.query('SELECT user_id, full_name FROM users WHERE phone_number = $1', [phone_number]);
    if (user.length === 0) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    await conn.query('UPDATE users SET full_name = $1 WHERE phone_number = $2', [full_name, phone_number]);
    await conn.query(`INSERT INTO user_activity_logs (user_id, action_type, old_value, new_value) VALUES ($1, $2, $3, $4)`,
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
    const conn = await pool.connect();
    const { rows: user } = await conn.query('SELECT user_id FROM users WHERE phone_number = $1', [phone_number]);
    if (user.length === 0) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    await conn.query('UPDATE users SET about_me = $1 WHERE phone_number = $2', [about_me || null, phone_number]);
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
    const conn = await pool.connect();
    const { rows: user } = await conn.query('SELECT about_me FROM users WHERE phone_number = $1', [phone_number]);
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
    const conn = await pool.connect();
    const { rows: target }   = await conn.query('SELECT user_id FROM users WHERE phone_number = $1', [phone_number]);
    const { rows: follower } = await conn.query('SELECT user_id FROM users WHERE phone_number = $1', [follower_phone]);
    if (!target.length || !follower.length) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    if (target[0].user_id === follower[0].user_id) { conn.release(); return res.status(400).json({ error: 'Cannot follow yourself' }); }
    await conn.query('INSERT INTO followers (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [follower[0].user_id, target[0].user_id]);
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
    const conn = await pool.connect();
    const { rows: target }   = await conn.query('SELECT user_id FROM users WHERE phone_number = $1', [phone_number]);
    const { rows: follower } = await conn.query('SELECT user_id FROM users WHERE phone_number = $1', [follower_phone]);
    if (!target.length || !follower.length) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    await conn.query('DELETE FROM followers WHERE follower_id = $1 AND following_id = $2', [follower[0].user_id, target[0].user_id]);
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
    const conn = await pool.connect();
    const { rows: target } = await conn.query('SELECT user_id FROM users WHERE phone_number = $1', [phone_number]);
    const { rows: viewer } = await conn.query('SELECT user_id FROM users WHERE phone_number = $1', [viewer_phone]);
    if (!target.length || !viewer.length) { conn.release(); return res.json({ is_following: false }); }
    const { rows: row } = await conn.query('SELECT id FROM followers WHERE follower_id = $1 AND following_id = $2', [viewer[0].user_id, target[0].user_id]);
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
    const conn = await pool.connect();
    const { rows: user } = await conn.query('SELECT user_id FROM users WHERE phone_number = $1', [phone_number]);
    if (!user.length) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    const { rows: followerRows } = await conn.query('SELECT COUNT(*) as total FROM followers WHERE following_id = $1', [user[0].user_id]);
    const { rows: followingRows } = await conn.query('SELECT COUNT(*) as total FROM followers WHERE follower_id  = $1', [user[0].user_id]);
    conn.release();
    res.json({
      followers: Number(followerRows[0].total || 0),
      following: Number(followingRows[0].total || 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getFollowers = async (req, res) => {
  const { phone_number } = req.params;
  try {
    const conn = await pool.connect();
    const { rows: users } = await conn.query(
      `SELECT u.full_name, u.phone_number, u.profile_picture
       FROM followers f JOIN users u ON f.follower_id=u.user_id JOIN users me ON me.user_id=f.following_id
       WHERE me.phone_number=$1`, [phone_number]);
    conn.release();
    res.json(users.map(u => ({ ...u, profile_picture_url: resolveProfilePictureUrl(u.profile_picture) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getFollowing = async (req, res) => {
  const { phone_number } = req.params;
  try {
    const conn = await pool.connect();
    const { rows: users } = await conn.query(
      `SELECT u.full_name, u.phone_number, u.profile_picture
       FROM followers f JOIN users u ON f.following_id=u.user_id JOIN users me ON me.user_id=f.follower_id
       WHERE me.phone_number=$1`, [phone_number]);
    conn.release();
    res.json(users.map(u => ({ ...u, profile_picture_url: resolveProfilePictureUrl(u.profile_picture) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// Get user posts (with visibility filter)
exports.getUserPosts = async (req, res) => {
  const { phone } = req.params;
  const viewer = req.query.viewer; // phone of person viewing

  try {
    const conn = await pool.connect();

    // ดึง user_id ของเจ้าของโปรไฟล์
    const { rows: owner } = await conn.query('SELECT user_id FROM users WHERE phone_number=$1', [phone]);
    if (!owner.length) { conn.release(); return res.json([]); }
    const ownerUserId = Number(owner[0].user_id);

    // ดึง user_id ของ viewer (ถ้ามี)
    let viewerUserId = null;
    if (viewer) {
      const { rows: vr } = await conn.query('SELECT user_id FROM users WHERE phone_number=$1', [viewer]);
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

    const { rows: posts } = await conn.query(
      `SELECT p.*, u.full_name, u.phone_number, u.profile_picture${extraSelect},
        (SELECT COUNT(*) FROM post_likes WHERE post_id=p.post_id AND type='like')    as likes,
        (SELECT COUNT(*) FROM post_likes WHERE post_id=p.post_id AND type='dislike') as dislikes,
        (SELECT COUNT(*) FROM comments    WHERE post_id=p.post_id AND is_deleted=0)  as comments
       FROM posts p
       JOIN users u ON p.user_id=u.user_id
       WHERE u.phone_number=$1
         AND p.is_deleted=0
         AND ${visCond}
       ORDER BY p.created_at DESC`,
      [phone]
    );

    for (let post of posts) {
      const { rows: imgs } = await conn.query('SELECT image_url FROM post_images WHERE post_id=$1', [post.post_id]);
      post.images = imgs.map(i => resolveProfilePictureUrl(i.image_url));
      post.profile_picture_url = resolveProfilePictureUrl(post.profile_picture);

      // ดึงโพสต์ต้นฉบับจริงๆ (chase chain จนถึง root)
      if (post.shared_post_id) {
        let currentId = Number(post.shared_post_id);
        const visited = new Set();
        let rootPost  = null;

        while (currentId) {
          if (visited.has(currentId)) break;
          visited.add(currentId);

          const { rows: origRows } = await conn.query(
            `SELECT p.post_id, p.content, p.created_at, p.shared_post_id,
                    u.full_name, u.phone_number, u.profile_picture
             FROM posts p
             JOIN users u ON p.user_id=u.user_id
             WHERE p.post_id=$1`,
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
          const { rows: origImgs } = await conn.query(
            'SELECT image_url FROM post_images WHERE post_id=$1', [row.post_id]
          );
          row.images = origImgs.map(i => resolveProfilePictureUrl(i.image_url));
          row.profile_picture_url = resolveProfilePictureUrl(row.profile_picture);
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
    conn = await pool.connect();
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
    const conn = await pool.connect();
    const { rows: user } = await conn.query(
      `SELECT current_location, hometown, birth_date, relationship_status, family_info, gender, pronouns
       FROM users WHERE phone_number = $1`,
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
    const conn = await pool.connect();
    const { rows: user } = await conn.query('SELECT user_id FROM users WHERE phone_number = $1', [phone_number]);
    if (user.length === 0) { conn.release(); return res.status(404).json({ error: 'User not found' }); }

    await conn.query(
      `UPDATE users SET
        current_location = $1,
        hometown = $2,
        birth_date = $3,
        relationship_status = $4,
        family_info = $5,
        gender = $6,
        pronouns = $7
       WHERE phone_number = $8`,
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
