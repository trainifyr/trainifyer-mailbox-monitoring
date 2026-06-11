// Supabase client using the anon (public) key.
// This client respects RLS policies — queries are scoped to the current user's JWT.
// Use this for user-scoped operations that should be governed by RLS.
// For admin operations, use supabaseClient.js (service-role key) instead.
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl    = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase configuration (SUPABASE_URL, SUPABASE_ANON_KEY)');
}

const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

module.exports = supabaseAnon;
