const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[_sb] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
}

module.exports = createClient(
  process.env.SUPABASE_URL  || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);
