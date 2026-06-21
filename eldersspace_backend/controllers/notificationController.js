const pool = require("../config/db");

exports.getNotifications = async (req, res) => {
  const { phone } = req.params;

  try {
    const conn = await pool.getConnection();

    const [user] = await conn.query(
      'SELECT user_id, phone_number FROM users WHERE phone_number=? LIMIT 1',
      [phone]
    );

    if (!user.length) {
      conn.release();
      return res.status(404).json({ error: 'User not found' });
    }

    const [notifications] = await conn.query(
      `SELECT
         n.*,
         u.full_name,
         me.phone_number AS owner_phone,
         rrh.qr_code,
         rrh.reward_name,
         rrh.points_redeemed  AS points_used,
         rrh.redemption_status,
         rrh.expires_at,
         rrh.redeemed_at
       FROM notifications n
       JOIN users u  ON n.actor_id = u.user_id
       JOIN users me ON me.user_id  = n.user_id
       LEFT JOIN reward_redemption_history rrh ON rrh.redemption_id = n.redemption_id
       WHERE me.phone_number = ?
       ORDER BY n.created_at DESC`,
      [phone]
    );

    conn.release();
    res.json(notifications);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createRewardNotification = async (req, res) => {
  const { phone_number, reward_name, qr_code, expires_at, points_used } = req.body;

  try {
    const conn = await pool.getConnection();

    // Get user_id from phone_number
    const [user] = await conn.query(
      'SELECT user_id FROM users WHERE phone_number = ? LIMIT 1',
      [phone_number]
    );

    if (!user.length) {
      conn.release();
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = user[0].user_id;

    // Create notification for reward redemption
    // For reward notifications, actor_id is the same as user_id (self notification)
    // Store reward details in the content field as JSON
    const content = JSON.stringify({
      reward_name,
      qr_code,
      expires_at,
      points_used,
      type: 'reward_redemption'
    });

    const [result] = await conn.query(
      `INSERT INTO notifications (user_id, actor_id, type, content, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [
        userId,
        userId,
        'reward_redemption',
        content
      ]
    );

    conn.release();

    console.log(`✓ Reward notification created for user ${userId} (${phone_number}): ${reward_name}`);

    res.status(201).json({
      success: true,
      message: 'Reward notification created',
      notification_id: result.insertId,
      reward_name,
      qr_code,
      expires_at,
      points_used
    });

  } catch (err) {
    console.error('Error creating reward notification:', err);
    res.status(500).json({ error: err.message });
  }
};