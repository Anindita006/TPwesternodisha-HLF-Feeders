/* Project SUPER 50 — Supabase-backed data adapter
   ---------------------------------------------------
   The dashboard's own code never talks to Supabase directly — it just
   calls window.claude.use('db') / window.claude.use('downloads'), the same
   calls it used inside Claude. This file implements that same interface,
   but reads/writes rows in the `datasets` table (see supabase/setup.sql)
   using the official Supabase JS client (loaded via CDN in index.html,
   right before this file).

   HOW DATA GETS SHARED
   - WRITE (admin only): uploading a file calls this adapter, which UPDATEs
     that dataset's row in Supabase. Row Level Security only allows this
     for a signed-in user — sign in once per device via "Sign in to
     publish", using the admin account you created in Supabase
     (Authentication -> Users). Supabase's own client keeps that session
     valid across page reloads.
   - READ (everyone): every open page reads via Supabase's public anon key
     (no sign-in needed), and again every few seconds (see pollIntervalMs
     in supabase-config.js), so uploads show up for everyone automatically.

   Just like the earlier GitHub/backend adapters, index.html still thinks
   in terms of a "meta" document plus numbered "chunk" documents (a split
   built for GitHub's commit-size limits). Supabase has no such limit, so
   this adapter buffers the chunk writes in memory and sends them as ONE
   update per upload, and always reports back exactly one chunk on read.
   Nothing in index.html needed to change.
*/
(function(){
  const SIGNED_IN_FLAG = 'super50SupabaseSignedIn';

  const mapMeta = {
    dtMeta: 'dt', villageMeta: 'village', feederLossMeta: 'feeder_loss', actionMeta: 'action'
  };
  const mapCollection = {
    dtChunks: 'dt', villageChunks: 'village', feederLossChunks: 'feeder_loss', actionChunks: 'action'
  };

  const readCache = {};
  const writeBuffers = {};
  let client = null;

  function cfg(){ return window.GITHUB_CONFIG || {}; }
  function isConfigured(){
    const c = cfg();
    return !!(c.supabaseUrl && c.supabaseAnonKey &&
      !String(c.supabaseUrl).includes('YOUR_') && !String(c.supabaseAnonKey).includes('YOUR_'));
  }

  function getClient(){
    if(client) return client;
    if(!isConfigured()) return null;
    if(!window.supabase || typeof window.supabase.createClient !== 'function'){
      console.error('Supabase library not loaded — check the CDN <script> tag in index.html.');
      return null;
    }
    client = window.supabase.createClient(cfg().supabaseUrl, cfg().supabaseAnonKey);
    return client;
  }

  // ---------------- sign-in handling ----------------
  function hasToken(){
    try{ return localStorage.getItem(SIGNED_IN_FLAG) === '1'; }catch(e){ return false; }
  }
  async function clearToken(){
    try{
      const c = getClient();
      if(c) await c.auth.signOut();
    }catch(e){ console.error('signOut', e); }
    try{ localStorage.removeItem(SIGNED_IN_FLAG); }catch(e){}
  }
  async function setToken({ email, password } = {}){
    if(!isConfigured()) throw new Error('supabase-config.js is not filled in yet (supabaseUrl/supabaseAnonKey are still placeholders).');
    const c = getClient();
    if(!c) throw new Error('Supabase client could not be created — check supabase-config.js and that the CDN script loaded.');
    if(!email || !password) throw new Error('Email and password are both required.');
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if(error) throw new Error(error.message);
    if(!data || !data.session) throw new Error('Sign-in did not return a session.');
    try{ localStorage.setItem(SIGNED_IN_FLAG, '1'); }catch(e){}
    return true;
  }

  // ---------------- dataset-level read, with caching ----------------
  async function loadDataset(dataset){
    const c = getClient();
    if(!c) return null;
    const { data, error } = await c
      .from('datasets')
      .select('rows, filename, uploaded_at, row_count')
      .eq('dataset', dataset)
      .maybeSingle();
    if(error){ console.warn('Supabase read failed for', dataset, error.message); return null; }
    if(!data || !data.row_count) { delete readCache[dataset]; return null; }

    const cached = readCache[dataset];
    const unchanged = cached && cached.uploadedAt === data.uploaded_at && cached.count === data.row_count;
    if(unchanged) return cached;

    const result = { rows: data.rows || [], filename: data.filename, uploadedAt: data.uploaded_at, count: data.row_count };
    readCache[dataset] = result;
    return result;
  }

  async function writeDataset(dataset, { rows, filename }){
    const c = getClient();
    if(!c) throw new Error('Supabase is not configured — edit supabase-config.js.');
    const { error } = await c
      .from('datasets')
      .update({ rows, filename: filename || null, uploaded_at: new Date().toISOString() })
      .eq('dataset', dataset);
    if(error){
      throw new Error(
        'Supabase write failed for ' + dataset + ': ' + error.message +
        ' — make sure you are signed in (RLS only allows updates from an authenticated user).'
      );
    }
  }

  // ---------------- db interface (mirrors the Firestore-style calls the dashboard makes) ----------------
  function dbAdapter(){
    return {
      doc(path){
        const [collection, id] = String(path).split('/');
        return {
          async get(){
            if(mapMeta[collection]){
              const dataset = mapMeta[collection];
              const loaded = await loadDataset(dataset);
              return {
                exists: !!loaded,
                data: () => (loaded ? { count: loaded.count, chunks: loaded.count ? 1 : 0, filename: loaded.filename, uploadedAt: loaded.uploadedAt } : null),
              };
            }
            if(mapCollection[collection]){
              const dataset = mapCollection[collection];
              const idx = Number(id);
              const loaded = await loadDataset(dataset);
              if(!loaded || idx !== 0 || !loaded.rows.length) return { exists: false, data: () => null };
              return { exists: true, data: () => ({ rows: loaded.rows }) };
            }
            throw new Error('Unknown document ' + path);
          },
          async set(value){
            if(mapMeta[collection]){
              const dataset = mapMeta[collection];
              const buf = writeBuffers[dataset] || {};
              const chunkCount = value.chunks || 0;
              let rows = [];
              for(let i = 0; i < chunkCount; i++){ rows = rows.concat((buf[i] && buf[i].rows) || []); }
              await writeDataset(dataset, { rows, filename: value.filename });
              delete writeBuffers[dataset];
              delete readCache[dataset];
              return;
            }
            if(mapCollection[collection]){
              const dataset = mapCollection[collection];
              const idx = Number(id);
              writeBuffers[dataset] = writeBuffers[dataset] || {};
              writeBuffers[dataset][idx] = value; // buffered only — no network call yet
              return;
            }
            throw new Error('Unknown document ' + path);
          },
          async delete(){
            if(mapCollection[collection]){
              const dataset = mapCollection[collection];
              const idx = Number(id);
              if(writeBuffers[dataset]) delete writeBuffers[dataset][idx];
            }
          },
        };
      },
      collection(name){
        return {
          limit(){
            return {
              async get(){
                const dataset = mapCollection[name];
                if(!dataset) throw new Error('Unknown collection ' + name);
                const loaded = await loadDataset(dataset);
                if(!loaded || !loaded.rows.length) return { docs: [] };
                return { docs: [{ id: '0', data: () => ({ rows: loaded.rows }) }] };
              },
            };
          },
          doc(id){ return dbAdapter().doc(name + '/' + id); },
        };
      },
    };
  }

  function browserDownloads(){
    return {
      save: async ({ filename, data }) => {
        const blob = new Blob([data], { type: 'application/octet-stream' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      },
    };
  }

  window.claude = window.claude || {};
  const oldUse = window.claude.use;
  window.claude.use = async function(name){
    if(name === 'db') return dbAdapter();
    if(name === 'downloads') return browserDownloads();
    if(typeof oldUse === 'function') return oldUse(name);
    return null;
  };

  // Kept as window.SUPER50_GITHUB so index.html's existing sign-in UI code
  // needs zero further changes — it just talks to Supabase under the hood now.
  window.SUPER50_GITHUB = { setToken, clearToken, hasToken, isConfigured };

  if(!isConfigured()){
    console.warn('Project SUPER 50: add your Supabase project URL and anon key in supabase-config.js');
  }
})();
