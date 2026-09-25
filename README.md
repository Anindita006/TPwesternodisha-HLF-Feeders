PROJECT SUPER 50 — THREE WAYS TO SYNC DATA
=============================================

index.html is currently wired to OPTION C (Supabase) — the active files in
this folder's root are index.html, supabase-config.js, supabase-adapter.js,
and supabase/setup.sql.

OPTION C — SUPABASE (currently active, recommended)
-------------------------------------------------------
Files: index.html, supabase-config.js, supabase-adapter.js, supabase/setup.sql
- Excel/CSV uploads write straight to a Postgres table in your own free
  Supabase project. Everyone reads it via Supabase's public API (anon key);
  only a signed-in admin account can upload.
- No server to deploy or keep alive, no disk to lose — Supabase's database
  is the persistent storage.

  SETUP
  1) Create a free project at supabase.com.
  2) Dashboard -> SQL Editor -> New query -> paste all of supabase/setup.sql
     -> Run.
  3) Dashboard -> Authentication -> Users -> Add user -> create the one
     admin login (email + password) that will be allowed to upload.
  4) Dashboard -> Settings -> API -> copy the Project URL and the "anon
     public" key into supabase-config.js.
  5) Push index.html, supabase-config.js, supabase-adapter.js to your
     GitHub Pages repo (root). Turn on GitHub Pages (Settings -> Pages ->
     Deploy from a branch -> main / root).
  6) Open the Pages URL, click "Sign in to publish", use the admin login
     from step 3. Upload a file — open the Pages URL elsewhere, it updates
     within ~pollIntervalMs (default 8s).

OPTION B — GITHUB-AS-DATABASE (no server, no external account beyond GitHub)
--------------------------------------------------------------------------------
Files: github-version/github-config.js, github-version/github-adapter.js
- Uploads commit straight to a data/ folder in your GitHub repo; every
  viewer reads those files directly. Needs a GitHub token on the
  uploading device, and the repo (+ its data) must be public.
- To switch to this option: change the three <script> tags near the
  bottom of index.html (the supabase-js CDN line, supabase-config.js,
  supabase-adapter.js) to just:
    <script src="github-config.js"></script>
    <script src="github-adapter.js"></script>
  then copy github-version/github-config.js and
  github-version/github-adapter.js to the repo root.
  Note: this option's sign-in modal was built for GitHub tokens, not
  email/password — ask if you want that UI reverted alongside the swap.

OPTION A — YOUR OWN EXPRESS BACKEND (full control, needs a host)
----------------------------------------------------------------------
Files: express-backend-version/backend-config.js,
       express-backend-version/backend-adapter.js,
       express-backend-version/backend/ (server.js, package.json, README.md)
- A real Node/Express API you deploy yourself (Render/Railway/Fly/your own
  VPS). Most flexible, but you own persistence, uptime, and CORS.
- See express-backend-version/backend/README.md for deploy steps and a
  persistence warning (some free hosts wipe their disk on restart).

WHICH ONE SHOULD YOU USE?
----------------------------
Supabase (Option C) is the recommended default: free, persistent, no
server to babysit, and real authentication instead of a bare token. Use
Option B only if you'd rather not create any account beyond GitHub. Use
Option A only if you specifically want a backend you fully control (e.g.
to add features beyond what Supabase/PostgREST gives you for free).

SECURITY NOTES (all options)
--------------------------------
- The in-app "password" (UPLOAD_PASSWORD in index.html) is a UI gate only,
  not real authentication — it stops casual clicks, not a determined person.
- Option C's real permission boundary is Row Level Security in
  supabase/setup.sql (only a signed-in user can write) — never disable RLS
  or use the "service_role" key in frontend code.
- Data is visible to anyone who can reach it: Supabase's public read policy
  (Option C), the public repo's data/ folder (Option B), or your API's
  read endpoint (Option A).
