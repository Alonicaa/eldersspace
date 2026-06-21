const pool = require('../config/db');
const path = require('path');
const fs = require('fs');

// ── Auto-migrate: add contact columns if they don't exist ──
(async () => {
  try {
    const conn = await pool.getConnection();
    const cols = [
      "ALTER TABLE partners ADD COLUMN contact_phone    VARCHAR(100) DEFAULT NULL",
      "ALTER TABLE partners ADD COLUMN contact_email    VARCHAR(255) DEFAULT NULL",
      "ALTER TABLE partners ADD COLUMN contact_line     VARCHAR(100) DEFAULT NULL",
      "ALTER TABLE partners ADD COLUMN contact_facebook VARCHAR(500) DEFAULT NULL",
      "ALTER TABLE partners ADD COLUMN contact_address  TEXT         DEFAULT NULL",
    ];
    for (const sql of cols) { try { await conn.query(sql); } catch (_) { /* column already exists */ } }
    conn.release();
  } catch (_) {}
})();

// ── Helpers ──

function buildUploadsDir(sub) {
  const dir = path.join(__dirname, `../uploads/${sub}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function fileUrl(filename, sub) {
  return `/uploads/${sub}/${filename}`;
}

// ── Partners ──

exports.getAllPartners = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM partners WHERE is_active = 1 ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAllPartnersAdmin = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM partners ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getPartnerById = async (req, res) => {
  try {
    const { id } = req.params;
    const [[partner]] = await pool.query('SELECT * FROM partners WHERE id = ?', [id]);
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    const [jobs] = await pool.query(
      'SELECT * FROM partner_jobs WHERE partner_id = ? AND is_active = 1 ORDER BY created_at DESC',
      [id]
    );
    const [services] = await pool.query(
      'SELECT * FROM partner_services WHERE partner_id = ? AND is_active = 1 ORDER BY display_order ASC',
      [id]
    );
    const [banners] = await pool.query(
      `SELECT * FROM home_banners
       WHERE partner_id = ? AND is_active = 1
         AND (start_date IS NULL OR start_date <= CURDATE())
         AND (end_date IS NULL OR end_date >= CURDATE())
       ORDER BY display_order ASC`,
      [id]
    );
    const [projects] = await pool.query(
      'SELECT * FROM partner_projects WHERE partner_id = ? AND is_active = 1 ORDER BY created_at DESC',
      [id]
    );

    res.json({ ...partner, jobs, services, banners, projects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createPartner = async (req, res) => {
  try {
    const { name, tagline, description, category, website_url, tier,
            contact_phone, contact_email, contact_line, contact_facebook, contact_address } = req.body;
    let logo_url = null;
    let cover_image_url = null;

    if (req.files?.logo?.[0]) {
      logo_url = fileUrl(req.files.logo[0].filename, 'partners');
    }
    if (req.files?.cover?.[0]) {
      cover_image_url = fileUrl(req.files.cover[0].filename, 'partners');
    }

    const [result] = await pool.query(
      `INSERT INTO partners
         (name, logo_url, cover_image_url, tagline, description, category, website_url, tier,
          contact_phone, contact_email, contact_line, contact_facebook, contact_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, logo_url, cover_image_url, tagline, description, category, website_url,
       tier || 'none',
       contact_phone || null, contact_email || null, contact_line || null,
       contact_facebook || null, contact_address || null]
    );
    res.status(201).json({ id: result.insertId, message: 'Partner created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updatePartner = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, tagline, description, category, website_url, is_active, tier,
            contact_phone, contact_email, contact_line, contact_facebook, contact_address } = req.body;
    const updates = {};

    if (name !== undefined) updates.name = name;
    if (tagline !== undefined) updates.tagline = tagline;
    if (description !== undefined) updates.description = description;
    if (category !== undefined) updates.category = category;
    if (website_url !== undefined) updates.website_url = website_url;
    if (is_active !== undefined) updates.is_active = is_active;
    if (tier !== undefined) updates.tier = tier;
    if (contact_phone !== undefined)    updates.contact_phone    = contact_phone    || null;
    if (contact_email !== undefined)    updates.contact_email    = contact_email    || null;
    if (contact_line !== undefined)     updates.contact_line     = contact_line     || null;
    if (contact_facebook !== undefined) updates.contact_facebook = contact_facebook || null;
    if (contact_address !== undefined)  updates.contact_address  = contact_address  || null;
    if (req.files?.logo?.[0]) updates.logo_url = fileUrl(req.files.logo[0].filename, 'partners');
    if (req.files?.cover?.[0]) updates.cover_image_url = fileUrl(req.files.cover[0].filename, 'partners');

    if (Object.keys(updates).length === 0) {
      return res.json({ message: 'No changes' });
    }

    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    await pool.query(`UPDATE partners SET ${fields} WHERE id = ?`, [...values, id]);
    res.json({ message: 'Partner updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deletePartner = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE partners SET is_active = 0 WHERE id = ?', [id]);
    res.json({ message: 'Partner deactivated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Partner Jobs ──

exports.getPartnerJobs = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT pj.*, p.name AS partner_name, p.logo_url AS partner_logo
       FROM partner_jobs pj
       JOIN partners p ON p.id = pj.partner_id
       WHERE pj.is_active = 1 AND p.is_active = 1
       ORDER BY pj.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createJob = async (req, res) => {
  try {
    const { partner_id } = req.params;
    const { title, job_type, location, salary_range, description, link_url } = req.body;
    const [result] = await pool.query(
      `INSERT INTO partner_jobs (partner_id, title, job_type, location, salary_range, description, link_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [partner_id, title, job_type, location, salary_range, description, link_url || null]
    );
    res.status(201).json({ id: result.insertId, message: 'Job created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { title, job_type, location, salary_range, description, link_url, is_active } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (job_type !== undefined) updates.job_type = job_type;
    if (location !== undefined) updates.location = location;
    if (salary_range !== undefined) updates.salary_range = salary_range;
    if (description !== undefined) updates.description = description;
    if (link_url !== undefined) updates.link_url = link_url || null;
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) return res.json({ message: 'No changes' });
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    await pool.query(`UPDATE partner_jobs SET ${fields} WHERE id = ?`, [...Object.values(updates), jobId]);
    res.json({ message: 'Job updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    await pool.query('UPDATE partner_jobs SET is_active = 0 WHERE id = ?', [jobId]);
    res.json({ message: 'Job deactivated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Partner Services ──

exports.getPartnerServices = async (req, res) => {
  try {
    const { partner_id } = req.params;
    const [rows] = await pool.query(
      'SELECT * FROM partner_services WHERE partner_id = ? AND is_active = 1 ORDER BY display_order ASC',
      [partner_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createService = async (req, res) => {
  try {
    const { partner_id } = req.params;
    const { title, description, display_order } = req.body;
    let image_url = null;
    if (req.file) {
      image_url = fileUrl(req.file.filename, 'partners');
    }
    const [result] = await pool.query(
      `INSERT INTO partner_services (partner_id, title, image_url, description, display_order)
       VALUES (?, ?, ?, ?, ?)`,
      [partner_id, title, image_url, description, display_order || 0]
    );
    res.status(201).json({ id: result.insertId, message: 'Service created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteService = async (req, res) => {
  try {
    const { serviceId } = req.params;
    await pool.query('UPDATE partner_services SET is_active = 0 WHERE id = ?', [serviceId]);
    res.json({ message: 'Service deactivated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateService = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { title, description, display_order } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (display_order !== undefined) updates.display_order = display_order;
    if (req.file) updates.image_url = fileUrl(req.file.filename, 'partners');
    if (!Object.keys(updates).length) return res.json({ message: 'No changes' });
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    await pool.query(`UPDATE partner_services SET ${fields} WHERE id = ?`, [...Object.values(updates), serviceId]);
    res.json({ message: 'Service updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Partner Projects ──

exports.getAllProjects = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT pp.*, p.name AS partner_name, p.logo_url AS partner_logo
       FROM partner_projects pp
       JOIN partners p ON p.id = pp.partner_id
       WHERE pp.is_active = 1 AND p.is_active = 1
       ORDER BY pp.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getPartnerProjects = async (req, res) => {
  try {
    const { partner_id } = req.params;
    const [rows] = await pool.query(
      'SELECT * FROM partner_projects WHERE partner_id = ? AND is_active = 1 ORDER BY created_at DESC',
      [partner_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createProject = async (req, res) => {
  try {
    const { partner_id } = req.params;
    const { title, description, link_url } = req.body;
    let image_url = null;
    if (req.file) image_url = fileUrl(req.file.filename, 'partners');
    const [result] = await pool.query(
      `INSERT INTO partner_projects (partner_id, title, image_url, description, link_url)
       VALUES (?, ?, ?, ?, ?)`,
      [partner_id, title, image_url, description, link_url || null]
    );
    res.status(201).json({ id: result.insertId, message: 'Project created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    await pool.query('UPDATE partner_projects SET is_active = 0 WHERE id = ?', [projectId]);
    res.json({ message: 'Project deactivated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { title, description, link_url } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (link_url !== undefined) updates.link_url = link_url;
    if (req.file) updates.image_url = fileUrl(req.file.filename, 'partners');
    if (!Object.keys(updates).length) return res.json({ message: 'No changes' });
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    await pool.query(`UPDATE partner_projects SET ${fields} WHERE id = ?`, [...Object.values(updates), projectId]);
    res.json({ message: 'Project updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Home Banners ──

exports.getHomeBanners = async (req, res) => {
  try {
    const { type } = req.query;
    let query = `
      SELECT hb.*, p.name AS partner_name, p.logo_url AS partner_logo, p.tier AS partner_tier
      FROM home_banners hb
      LEFT JOIN partners p ON p.id = hb.partner_id
      WHERE hb.is_active = 1
        AND (hb.start_date IS NULL OR hb.start_date <= CURDATE())
        AND (hb.end_date IS NULL OR hb.end_date >= CURDATE())
    `;
    const params = [];
    if (type) {
      query += ' AND hb.banner_type = ?';
      params.push(type);
    }
    query += ' ORDER BY hb.display_order ASC, hb.created_at DESC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAllBannersAdmin = async (req, res) => {
  try {
    const { partner_id, type } = req.query;
    let query = `
      SELECT hb.*, p.name AS partner_name
      FROM home_banners hb
      LEFT JOIN partners p ON p.id = hb.partner_id
      WHERE 1=1
    `;
    const params = [];
    if (partner_id) { query += ' AND hb.partner_id = ?'; params.push(partner_id); }
    if (type)       { query += ' AND hb.banner_type = ?'; params.push(type); }
    query += ' ORDER BY hb.created_at DESC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.trackBannerView = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE home_banners SET view_count = view_count + 1 WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.trackBannerClick = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE home_banners SET click_count = click_count + 1 WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createBanner = async (req, res) => {
  try {
    const { partner_id, title, description, link_url, banner_type, display_order, start_date, end_date } = req.body;
    let image_url = null;
    if (req.file) {
      image_url = fileUrl(req.file.filename, 'banners');
    }
    const [result] = await pool.query(
      `INSERT INTO home_banners (partner_id, title, description, image_url, link_url, banner_type, display_order, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        partner_id || null, title, description, image_url, link_url,
        banner_type || 'general', display_order || 0,
        start_date || null, end_date || null
      ]
    );
    res.status(201).json({ id: result.insertId, message: 'Banner created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, link_url, banner_type, display_order, is_active, start_date, end_date, partner_id } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (link_url !== undefined) updates.link_url = link_url;
    if (banner_type !== undefined) updates.banner_type = banner_type;
    if (display_order !== undefined) updates.display_order = display_order;
    if (is_active !== undefined) updates.is_active = is_active;
    if (start_date !== undefined) updates.start_date = start_date;
    if (end_date !== undefined) updates.end_date = end_date;
    if (partner_id !== undefined) updates.partner_id = partner_id;
    if (req.file) updates.image_url = fileUrl(req.file.filename, 'banners');

    if (Object.keys(updates).length === 0) return res.json({ message: 'No changes' });
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    await pool.query(`UPDATE home_banners SET ${fields} WHERE id = ?`, [...Object.values(updates), id]);
    res.json({ message: 'Banner updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE home_banners SET is_active = 0 WHERE id = ?', [id]);
    res.json({ message: 'Banner deactivated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
