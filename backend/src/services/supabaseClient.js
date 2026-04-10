'use strict';

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

// ─── Public client (anon key) ─────────────────────────────────────────────────
// Used for operations that respect Supabase Row Level Security (RLS).
// Safe to use for user-authenticated requests — access is governed by RLS policies.
const supabase = createClient(config.supabase.url, config.supabase.anonKey);

// ─── Admin client (service role key) ─────────────────────────────────────────
// Bypasses RLS. Use ONLY for privileged server-side operations (e.g. triggers,
// admin tasks). NEVER send this key to the browser.
const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

module.exports = { supabase, supabaseAdmin };
