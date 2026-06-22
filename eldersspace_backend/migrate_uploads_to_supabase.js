require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const BUCKET = 'uploads';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false },
  family: 4,
});

function getAllFiles(dir, base = dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // skip promo_csv
      if (entry.name === 'promo_csv') continue;
      results.push(...getAllFiles(fullPath, base));
    } else {
      const relPath = path.relative(base, fullPath).replace(/\\/g, '/');
      results.push({ fullPath, relPath });
    }
  }
  return results;
}

function mimeFromExt(ext) {
  const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
  return map[ext.toLowerCase()] || 'application/octet-stream';
}

async function uploadFile(fullPath, relPath) {
  const buffer = fs.readFileSync(fullPath);
  const ext = path.extname(relPath).replace('.', '');
  const contentType = mimeFromExt(ext);

  const { error } = await supabase.storage.from(BUCKET).upload(relPath, buffer, { contentType, upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(relPath);
  return data.publicUrl;
}

async function updateDb(conn, relPath, publicUrl) {
  let updated = 0;

  // users.profile_picture
  const r1 = await conn.query(
    `UPDATE users SET profile_picture = $1 WHERE profile_picture = $2 OR profile_picture LIKE $3`,
    [publicUrl, relPath, `%/uploads/${relPath}`]
  );
  updated += r1.rowCount;

  // post_images.image_url
  const r2 = await conn.query(
    `UPDATE post_images SET image_url = $1 WHERE image_url = $2 OR image_url LIKE $3`,
    [publicUrl, relPath, `%/uploads/${relPath}`]
  );
  updated += r2.rowCount;

  // articles.cover_image
  const r3 = await conn.query(
    `UPDATE articles SET cover_image = $1 WHERE cover_image = $2 OR cover_image LIKE $3`,
    [publicUrl, relPath, `%/uploads/${relPath}`]
  );
  updated += r3.rowCount;

  // partner_ads.image_url
  const r4 = await conn.query(
    `UPDATE partner_ads SET image_url = $1 WHERE image_url = $2 OR image_url LIKE $3`,
    [publicUrl, relPath, `%/uploads/${relPath}`]
  );
  updated += r4.rowCount;

  // partners logo/banner columns (try common names)
  for (const col of ['logo_url', 'cover_image', 'image_url', 'banner_url']) {
    try {
      const r = await conn.query(
        `UPDATE partners SET ${col} = $1 WHERE ${col} = $2 OR ${col} LIKE $3`,
        [publicUrl, relPath, `%/uploads/${relPath}`]
      );
      updated += r.rowCount;
    } catch (_) {}
  }

  // banners table
  try {
    const r = await conn.query(
      `UPDATE banners SET image_url = $1 WHERE image_url = $2 OR image_url LIKE $3`,
      [publicUrl, relPath, `%/uploads/${relPath}`]
    );
    updated += r.rowCount;
  } catch (_) {}

  return updated;
}

async function main() {
  const files = getAllFiles(UPLOADS_DIR);
  console.log(`Found ${files.length} files to migrate\n`);

  const conn = await pool.connect();
  let uploaded = 0, skipped = 0, dbUpdated = 0;

  for (const { fullPath, relPath } of files) {
    process.stdout.write(`Uploading ${relPath} ... `);
    try {
      const publicUrl = await uploadFile(fullPath, relPath);
      const rows = await updateDb(conn, relPath, publicUrl);
      dbUpdated += rows;
      uploaded++;
      console.log(`OK (${rows} DB rows updated)`);
    } catch (err) {
      skipped++;
      console.log(`SKIP: ${err.message}`);
    }
  }

  conn.release();
  await pool.end();
  console.log(`\nDone: ${uploaded} uploaded, ${skipped} skipped, ${dbUpdated} DB rows updated`);
}

main().catch(err => { console.error(err); process.exit(1); });
