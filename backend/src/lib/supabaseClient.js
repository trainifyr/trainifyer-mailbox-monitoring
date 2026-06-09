// TODO(PHASE-8: REVIEW KEY USAGE) - Service role key is used here because RLS is
// disabled in Phase 1. In Phase 8 (WI-804), RLS policies will replace this
// blanket access and the service role should only be used for admin tasks.

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl        = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase configuration in environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

module.exports = supabase;
