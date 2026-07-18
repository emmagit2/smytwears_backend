require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
console.log('Service key present:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log('Service key starts with:', process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 10));
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } }
);

module.exports = supabase;