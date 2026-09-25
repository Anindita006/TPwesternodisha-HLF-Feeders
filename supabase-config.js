/* Project SUPER 50 — Supabase configuration
   Fill in the two values below with details from your Supabase project:
   Dashboard -> Settings -> API -> "Project URL" and "anon public" key.
   Both are safe to expose in frontend code — the anon key only grants what
   your Row Level Security policies (see supabase/setup.sql) allow it to. */
window.GITHUB_CONFIG = {
  supabaseUrl: 'https://odkeoqafaajindcarhrv.supabase.co',
  supabaseAnonKey: 'sb_publishable_NZ8pPPOzvacpJufUtrwtNQ_lFgLrGyb',

  // How often (ms) every open page re-checks Supabase for newer data.
  // 8000 = 8 seconds. Lower = faster updates but more requests.
  pollIntervalMs: 8000,
};
