const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function uploadToStorage(buffer, originalname, mimetype, folder = 'misc') {
  const ext = path.extname(originalname);
  const base = path.basename(originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  const filepath = `${folder}/${base}-${uniqueSuffix}${ext}`;

  const { error } = await supabase.storage
    .from('uploads')
    .upload(filepath, buffer, { contentType: mimetype, upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from('uploads').getPublicUrl(filepath);
  return data.publicUrl;
}

module.exports = { uploadToStorage };
