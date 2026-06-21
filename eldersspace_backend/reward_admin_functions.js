// These functions should be added to adminController.js

/**
 * GET /api/admin/rewards
 * ดึงรายชื่อรางวัลทั้งหมด พร้อม pagination
 */
exports.getAllRewards = async (req, res) => {
  let conn;
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    conn = await pool.getConnection();

    // Get total count
    const countResult = await conn.query('SELECT COUNT(*) as total FROM rewards');
    const total = Number(countResult[0]?.total || 0);

    // Get rewards with pagination
    const rewards = await conn.query(
      `SELECT reward_id, reward_name, required_points, description, image_url, category, 
              expiry_date, is_active, created_at, updated_at
       FROM rewards
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [parseInt(limit), parseInt(offset)]
    );

    conn.release();

    return res.json({
      success: true,
      data: rewards,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
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

    conn = await pool.getConnection();

    const reward = await conn.query(
      `SELECT reward_id, reward_name, required_points, description, image_url, category,
              expiry_date, is_active, created_at, updated_at
       FROM rewards
       WHERE reward_id = ?`,
      [id]
    );

    conn.release();

    if (!reward.length) {
      return res.status(404).json({ error: 'Reward not found' });
    }

    return res.json({
      success: true,
      data: reward[0]
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
    const {
      reward_name,
      required_points,
      description,
      image_url,
      category,
      expiry_date,
      is_active = true
    } = req.body;

    // Validate required fields
    if (!reward_name || typeof required_points !== 'number') {
      return res.status(400).json({
        error: 'Missing required fields: reward_name, required_points'
      });
    }

    conn = await pool.getConnection();

    // Check if rewards table has the category column
    const categoryCheck = await conn.query(
      `SELECT COUNT(*) as total FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'rewards' 
       AND column_name = 'category'`
    );

    if (Number(categoryCheck[0]?.total || 0) === 0) {
      // Add category column if it doesn't exist
      await conn.query('ALTER TABLE rewards ADD COLUMN category VARCHAR(100)');
    }

    const result = await conn.query(
      `INSERT INTO rewards (reward_name, required_points, description, image_url, category, expiry_date, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        reward_name,
        required_points,
        description || null,
        image_url || null,
        category || null,
        expiry_date || null,
        is_active ? 1 : 0
      ]
    );

    conn.release();

    return res.json({
      success: true,
      message: 'Reward created successfully',
      reward_id: Number(result.insertId)
    });
  } catch (error) {
    console.error('Failed to create reward:', error);
    return res.status(500).json({ error: 'Failed to create reward' });
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

    conn = await pool.getConnection();

    // Check if reward exists
    const reward = await conn.query(
      'SELECT reward_id FROM rewards WHERE reward_id = ?',
      [id]
    );

    if (!reward.length) {
      conn.release();
      return res.status(404).json({ error: 'Reward not found' });
    }

    // Build dynamic update query
    const updateFields = [];
    const values = [];

    if (updates.reward_name) {
      updateFields.push('reward_name = ?');
      values.push(updates.reward_name);
    }
    if (typeof updates.required_points !== 'undefined') {
      updateFields.push('required_points = ?');
      values.push(updates.required_points);
    }
    if (updates.description !== undefined) {
      updateFields.push('description = ?');
      values.push(updates.description || null);
    }
    if (updates.image_url !== undefined) {
      updateFields.push('image_url = ?');
      values.push(updates.image_url || null);
    }
    if (updates.category !== undefined) {
      updateFields.push('category = ?');
      values.push(updates.category || null);
    }
    if (updates.expiry_date !== undefined) {
      updateFields.push('expiry_date = ?');
      values.push(updates.expiry_date || null);
    }
    if (typeof updates.is_active !== 'undefined') {
      updateFields.push('is_active = ?');
      values.push(updates.is_active ? 1 : 0);
    }

    if (updateFields.length === 0) {
      conn.release();
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateFields.push('updated_at = NOW()');
    values.push(id);

    await conn.query(
      `UPDATE rewards SET ${updateFields.join(', ')} WHERE reward_id = ?`,
      values
    );

    conn.release();

    return res.json({
      success: true,
      message: 'Reward updated successfully'
    });
  } catch (error) {
    console.error('Failed to update reward:', error);
    return res.status(500).json({ error: 'Failed to update reward' });
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

    conn = await pool.getConnection();

    // Check if reward exists
    const reward = await conn.query(
      'SELECT reward_id FROM rewards WHERE reward_id = ?',
      [id]
    );

    if (!reward.length) {
      conn.release();
      return res.status(404).json({ error: 'Reward not found' });
    }

    // Delete the reward
    await conn.query('DELETE FROM rewards WHERE reward_id = ?', [id]);

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
    conn = await pool.getConnection();

    const categories = await conn.query(
      `SELECT DISTINCT category FROM rewards WHERE category IS NOT NULL AND category != '' ORDER BY category`
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
