/* Blink: snaps and chats on Supabase. No build step, deploys as static files. */
(() => {
'use strict';

/* ------------------------------------------------------------------ utils */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } }
};

const P = {
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  stories: '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5 3.5-5 3.5z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  flip: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  fwd: '<path d="m9 18 6-6-6-6"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
  pen: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  userx: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 8 5 5"/><path d="m22 8-5 5"/>'
};
const ic = (n, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;

function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => t.classList.add('out'), 3400);
  setTimeout(() => t.remove(), 3900);
}

function friendlyError(e) {
  const m = (e && e.message) || String(e);
  if (/invalid login/i.test(m)) return 'Email or password is incorrect.';
  if (/already registered|already been registered/i.test(m)) return 'That email already has an account. Log in instead.';
  if (/rate limit|too many/i.test(m)) return 'Too many attempts. Wait a minute and try again.';
  if (/not confirmed/i.test(m)) return 'Confirm your email first. Check your inbox for the link.';
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Can’t reach the server. Check your connection.';
  if (/row-level security|violates row/i.test(m)) return 'That isn’t allowed. Make sure you’re friends with this person.';
  return m;
}

const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; };
const initials = p => {
  const w = String(p?.display_name || p?.username || '?').trim().split(/\s+/);
  return ((w[0]?.[0] || '?') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
};
function avatar(p, size = 44, ring = '') {
  const st = `width:${size}px;height:${size}px;font-size:${Math.round(size * .38)}px`;
  const inner = p?.avatar_url
    ? `<span class="av" style="${st}"><img src="${esc(p.avatar_url)}" alt="" loading="lazy" draggable="false"></span>`
    : (() => { const h = hue(p?.username || 'x'); return `<span class="av" style="${st};background:linear-gradient(145deg,hsl(${h} 62% 44%),hsl(${(h + 45) % 360} 62% 28%))">${esc(initials(p))}</span>`; })();
  return ring ? `<span class="ringwrap ${ring}">${inner}</span>` : inner;
}

const fmtTime = d => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function ago(d) {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  if (s < 604800) return Math.floor(s / 86400) + 'd';
  return new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' });
}
function dayLabel(d) {
  const x = new Date(d), t = new Date(), y = new Date();
  y.setDate(t.getDate() - 1);
  if (x.toDateString() === t.toDateString()) return 'Today';
  if (x.toDateString() === y.toDateString()) return 'Yesterday';
  return x.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}
const toBlob = (c, q = .85) => new Promise(r => c.toBlob(r, 'image/jpeg', q));
function makeCanvas(w, h, max) {
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  return c;
}
async function fileToCanvas(file, max = 1280) {
  const bmp = await createImageBitmap(file);
  const c = makeCanvas(bmp.width, bmp.height, max);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

/* ------------------------------------------------------------------ boot */
const cfg = window.BLINK_CONFIG || {};
const hideBoot = () => $('#boot').classList.add('gone');
$$('[data-ic]').forEach(el => { el.innerHTML = ic(el.dataset.ic, +el.dataset.size || 22); });

if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || /YOUR-/.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY) || !window.supabase) {
  hideBoot();
  const a = $('#auth'); a.hidden = false;
  a.innerHTML = `<div class="setup"><div class="wordmark sm">blink<span class="blip"></span></div>
    <h1>Connect your Supabase project</h1>
    <ol><li>Create a project at supabase.com.</li>
    <li>Run <code>supabase/schema.sql</code> in the SQL editor.</li>
    <li>Copy the Project URL and anon key into <code>config.js</code>.</li>
    <li>Redeploy, then reload this page.</li></ol></div>`;
  return;
}

const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

/* ------------------------------------------------------------------ state */
const fresh = () => ({
  user: null, me: null, booting: false, tab: 'camera', active: null,
  friends: [], incoming: [], outgoing: [], byId: new Map(),
  msgs: new Map(), streaks: new Map(), stories: new Map(),
  snapTarget: null, storyMode: false, channel: null,
  q: '', results: [], searching: false, lastSync: 0
});
let S = fresh();
let ED = null;   // snap editor state
let SV = null;   // story viewer state
const cam = { stream: null, facing: 'user', starting: false };
const K = k => `blink.${k}.${S.me?.id || ''}`;

/* ------------------------------------------------------------------ auth */
let authMode = 'login';
function renderAuth(mode = authMode) {
  authMode = mode;
  const a = $('#auth'); a.hidden = false; $('#app').hidden = true;
  if (!$('.auth-wrap', a)) {
    a.innerHTML = `<div class="auth-wrap">
      <section class="auth-hero">
        <div class="wordmark" role="img" aria-label="Blink">blink<span class="blip"></span></div>
        <p class="tagline">Snaps and chats that don’t stick around.</p>
        <div class="fan" aria-hidden="true">
          <div class="snapcard c1"><span class="tag"><i class="sq snap"></i>Snap</span><div class="cap">dinner??</div></div>
          <div class="snapcard c2"><span class="tag"><i class="sq snap"></i>Snap</span><div class="cap">omw</div></div>
          <div class="snapcard c3"><span class="tag"><i class="sq snap"></i>Snap</span><div class="cap">look at this dog</div></div>
        </div>
      </section>
      <section class="auth-card">
        <div class="seg-tabs" role="tablist">
          <button role="tab" data-act="authMode" data-m="login">Log in</button>
          <button role="tab" data-act="authMode" data-m="signup">Sign up</button>
        </div>
        <form id="authForm" novalidate></form>
      </section></div>`;
  }
  $$('.seg-tabs button', a).forEach(b => { const on = b.dataset.m === mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  const signup = mode === 'signup';
  $('#authForm').innerHTML = `
    ${signup ? `<label class="field"><span>Display name</span><input name="display" autocomplete="name" maxlength="40" placeholder="Alex Rivera"></label>
    <label class="field"><span>Username</span><input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" placeholder="alex.r" required></label>` : ''}
    <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></label>
    <label class="field"><span>Password</span><input name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="6" required placeholder="At least 6 characters"></label>
    <button class="btn primary block" type="submit">${signup ? 'Create account' : 'Log in'}</button>
    <p class="form-msg" id="authMsg" role="alert"></p>`;
}

async function onAuthSubmit(form) {
  const f = new FormData(form), msg = $('#authMsg'), btn = $('button[type=submit]', form);
  msg.className = 'form-msg'; msg.textContent = ''; btn.disabled = true;
  try {
    const email = String(f.get('email') || '').trim(), password = String(f.get('password') || '');
    if (!email || !password) throw new Error('Enter your email and password.');
    if (authMode === 'login') {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const username = String(f.get('username') || '').trim().toLowerCase().replace(/^@/, '');
      const display = String(f.get('display') || '').trim() || username;
      if (!/^[a-z0-9_.]{3,20}$/.test(username)) throw new Error('Usernames are 3–20 characters: letters, numbers, dots or underscores.');
      if (password.length < 6) throw new Error('Your password needs at least 6 characters.');
      const { data: free, error: e1 } = await sb.rpc('username_available', { uname: username });
      if (e1) throw e1;
      if (!free) throw new Error('That username is taken. Try another.');
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { username, display_name: display } } });
      if (error) throw error;
      if (!data.session) { msg.className = 'form-msg ok'; msg.textContent = 'Account created. Check your email to confirm it, then log in.'; }
    }
  } catch (err) {
    msg.className = 'form-msg err'; msg.textContent = friendlyError(err);
  } finally { btn.disabled = false; }
}

sb.auth.onAuthStateChange((event, session) => {
  // never await supabase calls inside this callback; defer instead
  if (event === 'SIGNED_OUT') { setTimeout(() => { teardown(); renderAuth(); hideBoot(); }, 0); return; }
  if (session?.user) {
    if (S.booting || S.me?.id === session.user.id) return;
    S.user = session.user; S.booting = true;
    setTimeout(boot, 0);
  } else if (event === 'INITIAL_SESSION') {
    setTimeout(() => { renderAuth(); hideBoot(); }, 0);
  }
});

async function boot() {
  try {
    await loadMe();
    $('#auth').hidden = true; $('#app').hidden = false;
    $('#camMe').innerHTML = avatar(S.me, 40);
    await Promise.all([loadFriends(), loadRecent(), loadStreaks()]);
    await loadStories();
    subscribe();
    render();
  } catch (err) {
    console.error(err);
    toast(err.message?.includes('profiles') || err.code === 'PGRST116'
      ? 'Your profile is missing. Run supabase/schema.sql, then sign up again.'
      : friendlyError(err), 'err');
    S.booting = false;
    await sb.auth.signOut();
    return;
  } finally { S.booting = false; hideBoot(); }
}

function teardown() {
  camStop();
  if (S.channel) { sb.removeChannel(S.channel); S.channel = null; }
  const l = $('#layer'); while (l.firstChild) closeLayer(l.firstChild);
  S = fresh(); ED = null; SV = null;
  $('#app').hidden = true; $('#panel').innerHTML = ''; $('#chatView').innerHTML = '';
  document.title = 'Blink';
}

/* ------------------------------------------------------------------ data */
async function loadMe() {
  const { data, error } = await sb.from('profiles').select('*').eq('id', S.user.id).single();
  if (error) throw error;
  S.me = data;
}

async function loadFriends() {
  const { data: rows, error } = await sb.from('friendships').select('*');
  if (error) throw error;
  const ids = [...new Set(rows.flatMap(r => [r.requester_id, r.addressee_id]))].filter(id => id !== S.me.id);
  let profs = [];
  if (ids.length) {
    const { data, error: e2 } = await sb.from('profiles').select('*').in('id', ids);
    if (e2) throw e2;
    profs = data;
  }
  const pm = new Map(profs.map(p => [p.id, p]));
  S.friends = []; S.incoming = []; S.outgoing = [];
  for (const r of rows) {
    const p = pm.get(r.requester_id === S.me.id ? r.addressee_id : r.requester_id);
    if (!p) continue;
    const item = { ...p, fid: r.id };
    if (r.status === 'accepted') S.friends.push(item);
    else if (r.addressee_id === S.me.id) S.incoming.push(item);
    else S.outgoing.push(item);
  }
  S.friends.sort((a, b) => a.display_name.localeCompare(b.display_name));
  S.byId = new Map(S.friends.map(f => [f.id, f]));
}

const otherOf = m => (m.sender_id === S.me.id ? m.recipient_id : m.sender_id);
function upsertMsg(m) {
  const k = otherOf(m), arr = S.msgs.get(k) || [];
  const i = arr.findIndex(x => x.id === m.id);
  if (i >= 0) arr[i] = m; else arr.push(m);
  arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  S.msgs.set(k, arr);
}
const findMsg = id => { for (const arr of S.msgs.values()) { const m = arr.find(x => x.id === id); if (m) return m; } return null; };

async function loadRecent() {
  const { data, error } = await sb.from('messages').select('*').order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  S.msgs = new Map();
  data.reverse().forEach(upsertMsg);
}

async function loadThread(fid) {
  const me = S.me.id;
  const { data, error } = await sb.from('messages').select('*')
    .or(`and(sender_id.eq.${me},recipient_id.eq.${fid}),and(sender_id.eq.${fid},recipient_id.eq.${me})`)
    .order('created_at', { ascending: false }).limit(300);
  if (error) { toast(friendlyError(error), 'err'); return; }
  S.msgs.set(fid, data.reverse());
}

async function loadStreaks() {
  const since = new Date(Date.now() - 45 * 864e5).toISOString();
  const { data, error } = await sb.from('messages').select('sender_id,recipient_id,created_at').eq('kind', 'snap').gte('created_at', since).limit(3000);
  if (error) return;
  const key = d => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; };
  const per = new Map();
  for (const m of data) {
    const mine = m.sender_id === S.me.id, f = mine ? m.recipient_id : m.sender_id;
    const o = per.get(f) || { mine: new Set(), theirs: new Set() };
    (mine ? o.mine : o.theirs).add(key(m.created_at));
    per.set(f, o);
  }
  S.streaks = new Map();
  for (const [f, o] of per) {
    const both = dt => { const k = key(dt); return o.mine.has(k) && o.theirs.has(k); };
    const d = new Date(); let n = 0;
    if (!both(d)) d.setDate(d.getDate() - 1);
    while (both(d)) { n++; d.setDate(d.getDate() - 1); }
    if (n > 1) S.streaks.set(f, n);
  }
}

async function loadStories() {
  const since = new Date(Date.now() - 864e5).toISOString();
  const { data, error } = await sb.from('stories').select('*').gte('created_at', since).order('created_at', { ascending: true });
  if (error) return;
  S.stories = new Map();
  for (const s of data) { const a = S.stories.get(s.user_id) || []; a.push(s); S.stories.set(s.user_id, a); }
}

/* read / unread */
function unreadFor(fid) {
  const lr = store.get(K('read'), {})[fid] || 0;
  let snaps = 0, texts = 0;
  for (const m of S.msgs.get(fid) || []) {
    if (m.recipient_id !== S.me.id) continue;
    if (m.kind === 'snap') { if (!m.opened_at) snaps++; }
    else if (new Date(m.created_at).getTime() > lr) texts++;
  }
  return { snaps, texts };
}
function markRead(fid) {
  const last = (S.msgs.get(fid) || []).filter(m => m.recipient_id === S.me.id).at(-1);
  if (!last) return;
  const r = store.get(K('read'), {}); r[fid] = new Date(last.created_at).getTime(); store.set(K('read'), r);
}
const seenSet = () => new Set(store.get(K('seen'), []));

/* ------------------------------------------------------------------ realtime */
function subscribe() {
  if (S.channel) sb.removeChannel(S.channel);
  const me = S.me.id;
  const ch = sb.channel('blink-' + me);
  for (const ev of ['INSERT', 'UPDATE']) {
    ch.on('postgres_changes', { event: ev, schema: 'public', table: 'messages', filter: `recipient_id=eq.${me}` }, onMsgEvent);
    ch.on('postgres_changes', { event: ev, schema: 'public', table: 'messages', filter: `sender_id=eq.${me}` }, onMsgEvent);
    ch.on('postgres_changes', { event: ev, schema: 'public', table: 'friendships', filter: `addressee_id=eq.${me}` }, refreshFriends);
    ch.on('postgres_changes', { event: ev, schema: 'public', table: 'friendships', filter: `requester_id=eq.${me}` }, refreshFriends);
  }
  ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, onMsgEvent);
  ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'friendships' }, refreshFriends);
  ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stories' }, refreshStories);
  ch.subscribe();
  S.channel = ch;
}

let streakT;
function onMsgEvent(p) {
  if (p.eventType === 'DELETE') {
    const id = p.old?.id;
    for (const arr of S.msgs.values()) { const i = arr.findIndex(m => m.id === id); if (i >= 0) { arr.splice(i, 1); break; } }
  } else {
    const m = p.new;
    if (!m) return;
    if (!S.byId.has(otherOf(m))) refreshFriends();
    upsertMsg(m);
    if (p.eventType === 'INSERT' && m.recipient_id === S.me.id) notify(m);
    if (m.kind === 'snap') { clearTimeout(streakT); streakT = setTimeout(async () => { await loadStreaks(); refreshUI(); }, 600); }
    if (S.active && otherOf(m) === S.active && !document.hidden) markRead(S.active);
  }
  refreshUI(S.active && p.new && otherOf(p.new) === S.active);
}
function notify(m) {
  const f = S.byId.get(m.sender_id);
  if (!f) return;
  if (S.active === f.id && !document.hidden) return;
  toast(m.kind === 'snap' ? `${f.display_name} sent you a snap` : `${f.display_name}: ${String(m.body).slice(0, 60)}`);
}
let rfT;
function refreshFriends() { clearTimeout(rfT); rfT = setTimeout(async () => { try { await loadFriends(); await loadStories(); } catch (e) { console.warn(e); } refreshUI(); }, 150); }
let rsT;
function refreshStories() { clearTimeout(rsT); rsT = setTimeout(async () => { await loadStories(); refreshUI(); }, 150); }
async function resync() {
  if (!S.me || Date.now() - S.lastSync < 10000) return;
  S.lastSync = Date.now();
  try {
    await Promise.all([loadFriends(), loadRecent(), loadStories(), loadStreaks()]);
    if (S.active) await loadThread(S.active);
  } catch (e) { console.warn(e); }
  refreshUI();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) resync(); });

/* ------------------------------------------------------------------ rendering */
function setTab(t) {
  if (t === 'camera' || (t === 'chats' && S.tab !== 'chats')) S.active = null;
  S.tab = t;
  render();
}

function render() {
  if (!S.me) return;
  const chatOpen = !!S.active;
  const app = $('#app');
  app.dataset.view = (S.tab === 'camera' || (S.tab === 'chats' && chatOpen)) ? 'stage' : 'panel';
  app.dataset.chat = (S.tab === 'chats' && chatOpen) ? '1' : '0';
  $$('.rail [data-tab]').forEach(b => { const on = b.dataset.tab === S.tab; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
  $('#camView').hidden = chatOpen;
  renderPanel(); renderChat(); updateCamUI(); syncCamera(); updateBadges();
}
function refreshUI(forceScroll = false) {
  if (!S.me) return;
  renderPanel(); renderChat(forceScroll); updateBadges(); updateCamUI();
}

function updateBadges() {
  let n = 0;
  for (const f of S.friends) { const u = unreadFor(f.id); n += u.snaps + u.texts; }
  const set = (sel, v) => { const b = $(sel); b.hidden = !v; b.textContent = v > 99 ? '99+' : v; };
  set('#bChats', n); set('#bFriends', S.incoming.length);
  const seen = seenSet();
  $('#bStories').hidden = !S.friends.some(f => (S.stories.get(f.id) || []).some(s => !seen.has(s.id)));
  document.title = n ? `(${n}) Blink` : 'Blink';
}

/* ----- panel views ----- */
const streakChip = id => S.streaks.has(id) ? `<span class="streak" title="Snap streak">🔥 ${S.streaks.get(id)}</span>` : '';

const views = {
  chats() {
    let h = '';
    if (S.incoming.length) h += `<button class="banner" data-act="goFriends"><span>${S.incoming.length} friend request${S.incoming.length > 1 ? 's' : ''}</span>${ic('fwd', 18)}</button>`;
    if (!S.friends.length) return h + `<div class="empty"><h3>No friends here yet</h3><p>Find people by username, then send them your first snap.</p><button class="btn primary" data-act="goFriends">Find friends</button></div>`;
    const rows = S.friends.map(f => ({ f, last: (S.msgs.get(f.id) || []).at(-1) }))
      .sort((a, b) => (b.last ? new Date(b.last.created_at) : 0) - (a.last ? new Date(a.last.created_at) : 0));
    return h + `<ul>${rows.map(chatRow).join('')}</ul>`;
  },

  stories() {
    const seen = seenSet();
    const mine = S.stories.get(S.me.id) || [];
    let h = `<ul><li class="row static"><button class="hit" data-act="${mine.length ? 'viewStory' : 'addStory'}" data-id="${S.me.id}">
      <span class="mystory">${avatar(S.me, 50, mine.length ? 'ring-seen' : '')}${mine.length ? '' : `<i class="addbadge">${ic('plus', 12)}</i>`}</span>
      <div class="row-main"><div class="row-title">My story</div><div class="row-sub">${mine.length ? `${mine.length} snap${mine.length > 1 ? 's' : ''}, last posted ${ago(mine.at(-1).created_at) === 'now' ? 'just now' : ago(mine.at(-1).created_at) + ' ago'}` : 'Share a snap with all your friends'}</div></div></button>
      ${mine.length ? `<button class="btn ghost sm" data-act="addStory">Add</button>` : ''}</li></ul>`;
    const rows = S.friends.filter(f => S.stories.has(f.id)).map(f => ({ f, list: S.stories.get(f.id) }))
      .sort((a, b) => new Date(b.list.at(-1).created_at) - new Date(a.list.at(-1).created_at));
    h += `<h2 class="sec">Friends’ stories</h2>`;
    if (!rows.length) return h + `<p class="hint">When friends post to their story, it shows up here for 24 hours.</p>`;
    return h + `<ul>${rows.map(({ f, list }) => {
      const unseen = list.some(s => !seen.has(s.id));
      return `<li><button class="row" data-act="viewStory" data-id="${f.id}">${avatar(f, 50, unseen ? 'ring-new' : 'ring-seen')}
        <div class="row-main"><div class="row-title">${esc(f.display_name)}</div><div class="row-sub">${unseen ? 'New story' : 'Seen'}</div></div>
        <div class="row-side"><time>${ago(list.at(-1).created_at)}</time></div></button></li>`;
    }).join('')}</ul>`;
  },

  friends() {
    const q = cleanQ(S.q);
    let h = `<label class="search">${ic('search', 18)}<input id="friendSearch" type="search" placeholder="Search by username" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(S.q)}" aria-label="Search by username"></label>`;
    if (q.length >= 2) {
      h += `<h2 class="sec">Results</h2>`;
      h += S.searching ? `<p class="hint">Searching…</p>`
        : S.results.length ? `<ul>${S.results.map(resultRow).join('')}</ul>`
        : `<p class="hint">No usernames start with “${esc(q)}”.</p>`;
    }
    if (S.incoming.length) h += `<h2 class="sec">Friend requests</h2><ul>${S.incoming.map(p => person(p,
      `<div class="row-actions"><button class="btn primary sm" data-act="acceptFriend" data-fid="${p.fid}">Accept</button><button class="btn ghost sm" data-act="declineFriend" data-fid="${p.fid}">Decline</button></div>`)).join('')}</ul>`;
    h += `<h2 class="sec">Your friends</h2>`;
    h += S.friends.length ? `<ul>${S.friends.map(p => person(p,
      `<div class="row-actions"><button class="icon-btn sm" data-act="snapTo" data-id="${p.id}" aria-label="Snap ${esc(p.display_name)}">${ic('camera', 18)}</button><button class="icon-btn sm" data-act="openChat" data-id="${p.id}" aria-label="Chat with ${esc(p.display_name)}">${ic('chat', 18)}</button></div>`)).join('')}</ul>`
      : `<p class="hint">Search for a username above to add your first friend.</p>`;
    if (S.outgoing.length) h += `<h2 class="sec">Sent requests</h2><ul>${S.outgoing.map(p => person(p,
      `<button class="btn ghost sm" data-act="cancelFriend" data-fid="${p.fid}">Cancel</button>`)).join('')}</ul>`;
    return h;
  }
};

const person = (p, right) => `<li class="row static">${avatar(p, 46)}<div class="row-main"><div class="row-title">${esc(p.display_name)}</div><div class="row-sub">@${esc(p.username)}</div></div>${right}</li>`;

function relation(id) {
  if (S.friends.some(f => f.id === id)) return 'friend';
  const inc = S.incoming.find(f => f.id === id); if (inc) return inc;
  if (S.outgoing.some(f => f.id === id)) return 'outgoing';
  return 'none';
}
function resultRow(p) {
  const r = relation(p.id);
  const right = r === 'friend' ? `<span class="muted">Friends</span>`
    : r === 'outgoing' ? `<span class="muted">Requested</span>`
    : r === 'none' ? `<button class="btn primary sm" data-act="addFriend" data-id="${p.id}">Add</button>`
    : `<button class="btn primary sm" data-act="acceptFriend" data-fid="${r.fid}">Accept</button>`;
  return person(p, right);
}

function chatRow({ f, last }) {
  const u = unreadFor(f.id), me = S.me.id;
  let sub, unread = false;
  if (!last) sub = `<span class="st">Say hi</span>`;
  else if (last.kind === 'snap') {
    if (last.recipient_id === me) {
      unread = !last.opened_at;
      sub = last.opened_at ? `<span class="st"><i class="sq open"></i>Opened</span>` : `<span class="st"><i class="sq snap"></i>New snap</span>`;
    } else sub = last.opened_at ? `<span class="st"><i class="sq out open"></i>Opened</span>` : `<span class="st"><i class="sq out snap"></i>Delivered</span>`;
  } else {
    unread = u.texts > 0;
    sub = `<span class="st"><i class="sq ${last.sender_id === me ? 'out ' : ''}chat"></i>${last.sender_id === me ? 'You: ' : ''}${esc(last.body)}</span>`;
  }
  if (u.snaps || u.texts) unread = true;
  const total = u.snaps + u.texts;
  return `<li><button class="row ${unread ? 'unread' : ''}" data-act="openChat" data-id="${f.id}">${avatar(f, 50)}
    <div class="row-main"><div class="row-title">${esc(f.display_name)} ${streakChip(f.id)}</div><div class="row-sub">${sub}</div></div>
    <div class="row-side">${last ? `<time>${ago(last.created_at)}</time>` : ''}${total ? `<span class="count ${u.snaps ? '' : 'chat'}">${total}</span>` : ''}</div></button></li>`;
}

function renderPanel() {
  if (!S.me) return;
  const tab = S.tab === 'stories' ? 'stories' : S.tab === 'friends' ? 'friends' : 'chats';
  const titles = { chats: 'Chats', stories: 'Stories', friends: 'Friends' };
  const panel = $('#panel');
  const fe = document.activeElement;
  const keep = fe && fe.id === 'friendSearch' ? fe.selectionStart : null;
  const prev = $('.panel-body', panel);
  const scroll = prev && panel.dataset.pane === tab ? prev.scrollTop : 0;
  panel.dataset.pane = tab;
  panel.innerHTML = `<header class="panel-head"><h1>${titles[tab]}</h1><button class="me-btn" data-act="openProfile" aria-label="Your profile">${avatar(S.me, 40)}</button></header><div class="panel-body">${views[tab]()}</div>`;
  $('.panel-body', panel).scrollTop = scroll;
  if (keep !== null) { const n = $('#friendSearch'); if (n) { n.focus(); n.setSelectionRange(keep, keep); } }
}

/* ----- conversation ----- */
function msgHtml(m) {
  const mine = m.sender_id === S.me.id;
  let inner;
  if (m.kind === 'snap') {
    if (mine) inner = `<div class="snap-tile out ${m.opened_at ? 'opened' : ''}">${ic('send', 16)}<span>${m.opened_at ? 'Snap opened' : 'Snap delivered'}</span></div>`;
    else if (m.opened_at) inner = `<div class="snap-tile opened"><i class="sq open"></i><span>Snap opened</span></div>`;
    else inner = `<button class="snap-tile new" data-act="openSnap" data-id="${m.id}"><i class="sq"></i><span>Tap to view snap</span></button>`;
  } else inner = `<p class="bubble">${esc(m.body)}</p>`;
  return `<div class="m ${mine ? 'me' : 'them'}">${inner}</div>`;
}
function threadHtml(f) {
  const arr = S.msgs.get(f.id) || [];
  if (!arr.length) return `<div class="empty small"><h3>Start the conversation</h3><p>Send ${esc(f.display_name)} a chat, or snap them a photo.</p></div>`;
  let h = '', lastDay = '';
  arr.forEach((m, i) => {
    const d = dayLabel(m.created_at);
    if (d !== lastDay) { h += `<div class="day">${d}</div>`; lastDay = d; }
    h += msgHtml(m);
    const n = arr[i + 1];
    if (!n || n.sender_id !== m.sender_id || new Date(n.created_at) - new Date(m.created_at) > 300000 || dayLabel(n.created_at) !== d)
      h += `<time class="m-time ${m.sender_id === S.me.id ? 'r' : ''}">${fmtTime(m.created_at)}</time>`;
  });
  return h;
}
function renderChat(forceScroll = false) {
  const el = $('#chatView');
  if (!S.active) { el.hidden = true; el.dataset.fid = ''; el.innerHTML = ''; return; }
  const f = S.byId.get(S.active);
  if (!f) { S.active = null; render(); return; }
  el.hidden = false;
  if (el.dataset.fid !== f.id) {
    el.dataset.fid = f.id; forceScroll = true;
    el.innerHTML = `<header class="chat-head">
        <button class="icon-btn back" data-act="closeChat" aria-label="Back to chats">${ic('back', 24)}</button>
        ${avatar(f, 42)}
        <div class="ch-name"><strong>${esc(f.display_name)}</strong><span id="chSub"></span></div>
        <button class="icon-btn sm" data-act="snapTo" aria-label="Send a snap">${ic('camera', 18)}</button>
        <button class="icon-btn sm" data-act="chatMenu" aria-label="Conversation options">${ic('more', 18)}</button>
      </header>
      <div class="msg-list" id="msgList" role="log" aria-live="polite"></div>
      <form class="composer" id="composer" autocomplete="off">
        <input id="composeIn" placeholder="Send a chat" maxlength="2000" aria-label="Message ${esc(f.display_name)}">
        <button class="send" type="submit" aria-label="Send">${ic('send', 20)}</button>
      </form>`;
  }
  $('#chSub').innerHTML = `@${esc(f.username)} ${streakChip(f.id)}`;
  const list = $('#msgList');
  const stick = forceScroll || list.scrollHeight - list.scrollTop - list.clientHeight < 90;
  list.innerHTML = threadHtml(f);
  if (stick) list.scrollTop = list.scrollHeight;
}

async function openChat(id) {
  S.active = id; S.tab = 'chats'; S.snapTarget = null; S.storyMode = false;
  render();
  if ($('#composeIn') && matchMedia('(min-width: 821px)').matches) $('#composeIn').focus();
  await loadThread(id);
  if (S.active !== id) return;
  markRead(id); renderChat(true); renderPanel(); updateBadges();
}

async function sendText() {
  const inp = $('#composeIn'), body = inp.value.trim();
  if (!body || !S.active) return;
  inp.value = '';
  const { data, error } = await sb.from('messages').insert({ sender_id: S.me.id, recipient_id: S.active, kind: 'text', body }).select().single();
  if (error) { inp.value = body; toast(friendlyError(error), 'err'); return; }
  upsertMsg(data); markRead(S.active); renderChat(true); renderPanel();
}

/* ------------------------------------------------------------------ layers */
const layerEl = () => $('#layer');
function pushLayer(html, cls = '', cleanup) {
  const d = document.createElement('div');
  d.className = 'ov ' + cls;
  if (cls.includes('sheet-host')) d.dataset.act = 'backdrop';
  d.innerHTML = html;
  d._cleanup = cleanup;
  layerEl().append(d);
  document.body.classList.add('noscroll');
  return d;
}
function closeLayer(el) {
  if (!el || !el.isConnected) return;
  const c = el._cleanup; el._cleanup = null;
  el.remove();
  if (!layerEl().children.length) document.body.classList.remove('noscroll');
  c?.();
}
const popLayer = () => closeLayer(layerEl().lastElementChild);

function ask(title, body, okLabel = 'Confirm') {
  return new Promise(res => {
    const el = pushLayer(`<div class="sheet small" role="alertdialog" aria-label="${esc(title)}">
      <h2 class="sheet-title">${esc(title)}</h2><p class="muted">${esc(body)}</p>
      <div class="btn-row"><button class="btn ghost" data-ask="0">Cancel</button><button class="btn danger" data-ask="1">${esc(okLabel)}</button></div></div>`,
      'sheet-host', () => res(false));
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-ask]');
      if (!b) return;
      el._cleanup = null; closeLayer(el); res(b.dataset.ask === '1');
    });
  });
}

/* ------------------------------------------------------------------ camera */
async function camStart() {
  if (cam.starting) return;
  if (!navigator.mediaDevices?.getUserMedia) { toast('This browser can’t open the camera. Choose a photo instead.', 'err'); return; }
  cam.starting = true; camStop(true);
  try {
    cam.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: cam.facing, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    const v = $('#camVideo');
    v.srcObject = cam.stream;
    v.classList.toggle('mirror', cam.facing === 'user');
    await v.play().catch(() => {});
    localStorage.setItem('blink.cam', '1');
  } catch (err) {
    cam.stream = null;
    localStorage.removeItem('blink.cam');
    toast(err.name === 'NotAllowedError' ? 'Camera access is blocked. Allow it in your browser settings, or choose a photo.' : 'Couldn’t start the camera.', 'err');
  } finally { cam.starting = false; updateCamUI(); }
}
function camStop(quiet) {
  cam.stream?.getTracks().forEach(t => t.stop());
  cam.stream = null;
  const v = $('#camVideo'); if (v) v.srcObject = null;
  if (!quiet) updateCamUI();
}
function syncCamera() {
  if (!(S.tab === 'camera' && !S.active)) { camStop(); return; }
  if (!cam.stream && !cam.starting && localStorage.getItem('blink.cam')) camStart();
}
function updateCamUI() {
  let label = '';
  if (S.storyMode) label = 'Posting to your story';
  else if (S.snapTarget && S.byId.get(S.snapTarget)) label = `Snap to ${esc(S.byId.get(S.snapTarget).display_name)}`;
  $('#camTarget').innerHTML = label ? `<span class="chip">${label}<button data-act="clearTarget" aria-label="Clear recipient">${ic('x', 14)}</button></span>` : '';
  $('#camView').classList.toggle('off', !cam.stream);
}
function shoot() {
  const v = $('#camVideo');
  if (!cam.stream || !v.videoWidth) { toast('Turn on the camera first.'); return; }
  const c = makeCanvas(v.videoWidth, v.videoHeight, 1280), x = c.getContext('2d');
  x.save();
  if (cam.facing === 'user') { x.translate(c.width, 0); x.scale(-1, 1); }
  x.drawImage(v, 0, 0, c.width, c.height);
  x.restore();
  const fl = $('#shutterFlash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
  openEditor(c);
}

/* ------------------------------------------------------------------ snap editor */
const COLORS = ['#ffffff', '#ffe14d', '#ff4d6d', '#8b6bff', '#3ddc97', '#000000'];
function openEditor(canvas) {
  const base = document.createElement('canvas');
  base.width = canvas.width; base.height = canvas.height;
  base.getContext('2d').drawImage(canvas, 0, 0);
  ED = { canvas, base, pen: false, color: COLORS[0], strokes: [], caption: '', sel: new Set() };
  const el = pushLayer(`<div class="editor" role="dialog" aria-label="Edit your snap">
      <div class="ed-frame" id="edFrame"><div class="ed-caption"><input id="edCap" maxlength="80" placeholder="Add a caption" aria-label="Caption"></div></div>
      <div class="ed-top">
        <button class="icon-btn" data-act="close" aria-label="Discard snap">${ic('x', 22)}</button>
        <div class="ed-tools">
          <button class="icon-btn" id="penBtn" data-act="edPen" aria-label="Draw" aria-pressed="false">${ic('pen', 20)}</button>
          <div class="sw-col" id="edColors" hidden>${COLORS.map((c, i) => `<button class="sw ${i ? '' : 'on'}" data-act="edColor" data-c="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join('')}</div>
          <button class="icon-btn" data-act="edUndo" aria-label="Undo last stroke">${ic('undo', 20)}</button>
        </div>
      </div>
      <div class="ed-bottom"><button class="btn primary" data-act="edNext">Send to ${ic('fwd', 18)}</button></div>
    </div>`, 'editor-host', () => { ED = null; });
  $('#edFrame', el).prepend(canvas);
  bindDraw(canvas);
}
function bindDraw(c) {
  let cur = null;
  const pt = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  c.addEventListener('pointerdown', e => {
    if (!ED?.pen) return;
    c.setPointerCapture(e.pointerId);
    cur = { color: ED.color, w: Math.max(5, c.width / 120), pts: [pt(e)] };
    ED.strokes.push(cur); redraw();
  });
  c.addEventListener('pointermove', e => { if (cur) { cur.pts.push(pt(e)); redraw(); } });
  const end = () => { cur = null; };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
}
function redraw() {
  const c = ED.canvas, x = c.getContext('2d');
  x.clearRect(0, 0, c.width, c.height); x.drawImage(ED.base, 0, 0);
  x.lineCap = 'round'; x.lineJoin = 'round';
  for (const s of ED.strokes) {
    x.strokeStyle = s.color; x.lineWidth = s.w; x.beginPath();
    s.pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
    if (s.pts.length === 1) x.lineTo(s.pts[0][0] + .1, s.pts[0][1]);
    x.stroke();
  }
}

function openSendSheet() {
  if (S.storyMode) ED.sel.add('story');
  if (S.snapTarget) ED.sel.add(S.snapTarget);
  const rows = S.friends.map(f => `<label class="pick">${avatar(f, 44)}<span class="pn"><b>${esc(f.display_name)}</b><small>@${esc(f.username)}</small></span><input type="checkbox" value="${f.id}" ${ED.sel.has(f.id) ? 'checked' : ''}></label>`).join('');
  pushLayer(`<div class="sheet" role="dialog" aria-label="Send to">
    <h2 class="sheet-title">Send to</h2>
    <div class="picks">
      <label class="pick">${avatar(S.me, 44)}<span class="pn"><b>My story</b><small>Visible to friends for 24 hours</small></span><input type="checkbox" value="story" ${ED.sel.has('story') ? 'checked' : ''}></label>
      ${rows || `<p class="hint">Add friends to send them snaps directly.</p>`}
    </div>
    <button class="btn primary block" id="sendBtn" data-act="sendSnap"></button></div>`, 'sheet-host');
  updateSendBtn();
}
function updateSendBtn() {
  const b = $('#sendBtn'); if (!b || !ED) return;
  const n = ED.sel.size;
  b.disabled = !n; b.textContent = n ? `Send to ${n}` : 'Choose who gets it';
}

async function sendSnap() {
  if (!ED || !ED.sel.size) return;
  const btn = $('#sendBtn'); btn.disabled = true; btn.textContent = 'Sending…';
  const targets = [...ED.sel], caption = ED.caption.trim() || null;
  try {
    const blob = await toBlob(ED.canvas, .82);
    for (const t of targets) {
      const id = crypto.randomUUID();
      if (t === 'story') {
        const path = `${S.me.id}/${id}.jpg`;
        const up = await sb.storage.from('stories').upload(path, blob, { contentType: 'image/jpeg' });
        if (up.error) throw up.error;
        const { error } = await sb.from('stories').insert({ user_id: S.me.id, media_path: path, caption });
        if (error) throw error;
      } else {
        // one copy per recipient so each person can view-once independently
        const path = `${S.me.id}/${t}/${id}.jpg`;
        const up = await sb.storage.from('snaps').upload(path, blob, { contentType: 'image/jpeg' });
        if (up.error) throw up.error;
        const { data, error } = await sb.from('messages').insert({ sender_id: S.me.id, recipient_id: t, kind: 'snap', media_path: path, caption }).select().single();
        if (error) { sb.storage.from('snaps').remove([path]); throw error; }
        upsertMsg(data);
      }
    }
    const back = S.snapTarget;
    const l = layerEl(); while (l.firstChild) closeLayer(l.firstChild);
    S.snapTarget = null; S.storyMode = false;
    toast('Sent');
    loadStories().then(refreshUI); loadStreaks().then(refreshUI);
    if (back) openChat(back); else render();
  } catch (err) {
    toast(friendlyError(err), 'err');
    btn.disabled = false; updateSendBtn();
  }
}

/* ------------------------------------------------------------------ viewers */
async function openSnap(id) {
  const m = findMsg(id);
  if (!m || m.recipient_id !== S.me.id || m.opened_at) return;
  const { data, error } = await sb.storage.from('snaps').createSignedUrl(m.media_path, 120);
  if (error || !data?.signedUrl) {
    toast('This snap is no longer available.', 'err');
    sb.rpc('open_snap', { msg_id: m.id }).then(() => {});
    m.opened_at = new Date().toISOString(); refreshUI();
    return;
  }
  const f = S.byId.get(m.sender_id) || {};
  const DUR = 10000;
  let timer;
  const ov = pushLayer(`<div class="viewer" data-act="close">
      <img src="${esc(data.signedUrl)}" alt="Snap from ${esc(f.display_name || 'a friend')}">
      <div class="vbars" style="--dur:${DUR}ms"><span class="seg" id="snapSeg"><i></i></span></div>
      <div class="vhead">${avatar(f, 36)}<b>${esc(f.display_name || '')}</b><time>${ago(m.created_at)}</time></div>
      ${m.caption ? `<div class="vcap">${esc(m.caption)}</div>` : ''}
      <div class="hint-tap">Tap anywhere to close. Snaps can only be viewed once.</div>
    </div>`, 'viewer-host', () => {
      clearTimeout(timer);
      sb.storage.from('snaps').remove([m.media_path]).then(() => {}, () => {});
      refreshUI();
    });
  const img = $('img', ov);
  const go = () => { $('#snapSeg')?.classList.add('run'); timer = setTimeout(() => closeLayer(ov), DUR); };
  if (img.complete) go(); else { img.onload = go; img.onerror = () => closeLayer(ov); }
  m.opened_at = new Date().toISOString();
  sb.rpc('open_snap', { msg_id: m.id }).then(() => {});
  renderPanel(); renderChat(); updateBadges();
}

async function openStories(uid) {
  const list = S.stories.get(uid) || [];
  if (!list.length) return;
  const { data, error } = await sb.storage.from('stories').createSignedUrls(list.map(s => s.media_path), 3600);
  if (error) { toast('Couldn’t load this story.', 'err'); return; }
  const map = new Map(data.map(d => [d.path, d.signedUrl]));
  const seen = seenSet();
  const start = Math.max(0, list.findIndex(s => !seen.has(s.id)));
  SV = { uid, list, map, i: start, timer: null, el: null };
  SV.el = pushLayer('', 'viewer-host', () => { clearTimeout(SV?.timer); SV = null; renderPanel(); updateBadges(); });
  showStory();
}
function showStory() {
  if (!SV) return;
  clearTimeout(SV.timer);
  const s = SV.list[SV.i], own = SV.uid === S.me.id, p = own ? S.me : (S.byId.get(SV.uid) || {});
  SV.el.innerHTML = `<div class="viewer" role="dialog" aria-label="${own ? 'Your story' : esc((p.display_name || '') + '’s story')}">
      <img src="${esc(SV.map.get(s.media_path) || '')}" alt="">
      <div class="vbars" style="--dur:5.5s">${SV.list.map((_, k) => `<span class="seg ${k < SV.i ? 'done' : k === SV.i ? 'run' : ''}"><i></i></span>`).join('')}</div>
      <div class="vhead">${avatar(p, 36)}<b>${own ? 'Your story' : esc(p.display_name || '')}</b><time>${ago(s.created_at)}</time><span class="grow"></span>
        ${own ? `<button class="icon-btn sm" data-act="storyDelete" aria-label="Delete this snap">${ic('trash', 18)}</button>` : ''}
        <button class="icon-btn sm" data-act="close" aria-label="Close story">${ic('x', 18)}</button></div>
      <button class="tap l" data-act="storyPrev" aria-label="Previous"></button>
      <button class="tap r" data-act="storyNext" aria-label="Next"></button>
      ${s.caption ? `<div class="vcap">${esc(s.caption)}</div>` : ''}
    </div>`;
  const seen = store.get(K('seen'), []);
  if (!seen.includes(s.id)) { seen.push(s.id); store.set(K('seen'), seen.slice(-500)); }
  SV.timer = setTimeout(storyNext, 5500);
}
function storyNext() {
  if (!SV) return;
  if (SV.i < SV.list.length - 1) { SV.i++; showStory(); } else closeLayer(SV.el);
}
function storyPrev() { if (!SV) return; if (SV.i > 0) SV.i--; showStory(); }
async function storyDelete() {
  if (!SV) return;
  const s = SV.list[SV.i]; clearTimeout(SV.timer);
  if (!await ask('Delete this snap?', 'It will disappear from your story for everyone.', 'Delete')) { showStory(); return; }
  await sb.storage.from('stories').remove([s.media_path]);
  const { error } = await sb.from('stories').delete().eq('id', s.id);
  if (error) { toast(friendlyError(error), 'err'); showStory(); return; }
  const mine = (S.stories.get(S.me.id) || []).filter(x => x.id !== s.id);
  if (mine.length) S.stories.set(S.me.id, mine); else S.stories.delete(S.me.id);
  SV.list = SV.list.filter(x => x.id !== s.id);
  if (!SV.list.length) { closeLayer(SV.el); return; }
  SV.i = Math.min(SV.i, SV.list.length - 1); showStory();
}

/* ------------------------------------------------------------------ profile */
function openProfile() {
  pushLayer(`<div class="sheet" role="dialog" aria-label="Your profile">
    <div class="prof"><div id="pfAvatar">${avatar(S.me, 96)}</div>
      <button class="btn ghost sm" data-act="pickAvatar">Change photo</button></div>
    <label class="field"><span>Display name</span><input id="pfName" maxlength="40" value="${esc(S.me.display_name)}"></label>
    <div class="field"><span>Username</span><div class="ro">@${esc(S.me.username)}</div></div>
    <div class="btn-row"><button class="btn ghost" data-act="logout">${ic('logout', 18)}Log out</button><button class="btn primary" data-act="saveProfile">Save</button></div>
  </div>`, 'sheet-host');
}
async function setAvatar(file) {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(bmp.width, bmp.height), out = document.createElement('canvas');
    out.width = out.height = 384;
    out.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 384, 384);
    bmp.close?.();
    const blob = await toBlob(out, .88);
    const path = `${S.me.id}/${Date.now()}.jpg`;
    const up = await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
    if (up.error) throw up.error;
    const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    const { error } = await sb.from('profiles').update({ avatar_url: url }).eq('id', S.me.id);
    if (error) throw error;
    const old = S.me.avatar_url?.split('/avatars/')[1];
    if (old) sb.storage.from('avatars').remove([decodeURIComponent(old.split('?')[0])]).then(() => {}, () => {});
    S.me.avatar_url = url;
    const holder = $('#pfAvatar'); if (holder) holder.innerHTML = avatar(S.me, 96);
    $('#camMe').innerHTML = avatar(S.me, 40);
    renderPanel(); toast('Profile photo updated');
  } catch (err) { toast(friendlyError(err), 'err'); }
}
async function saveProfile() {
  const name = $('#pfName').value.trim();
  if (!name) { toast('Display name can’t be empty.', 'err'); return; }
  const { error } = await sb.from('profiles').update({ display_name: name }).eq('id', S.me.id);
  if (error) { toast(friendlyError(error), 'err'); return; }
  S.me.display_name = name; closeLayer($('#layer').lastElementChild); renderPanel(); toast('Saved');
}

/* ------------------------------------------------------------------ friends */
const cleanQ = v => String(v || '').trim().toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_.]/g, '');
let searchT;
function onSearchInput(v) {
  S.q = v; clearTimeout(searchT);
  const q = cleanQ(v);
  if (q.length < 2) { S.results = []; S.searching = false; renderPanel(); return; }
  S.searching = true; renderPanel();
  searchT = setTimeout(async () => {
    const { data, error } = await sb.from('profiles').select('*').ilike('username', q.replace(/[\\%_]/g, '\\$&') + '%').neq('id', S.me.id).limit(15);
    if (cleanQ(S.q) !== q) return;
    S.searching = false; S.results = error ? [] : data;
    if (error) toast(friendlyError(error), 'err');
    renderPanel();
  }, 250);
}
async function friendAction(fn, okMsg) {
  const { error } = await fn();
  if (error) { toast(error.code === '23505' ? 'You already have a request with this person.' : friendlyError(error), 'err'); return false; }
  if (okMsg) toast(okMsg);
  try { await loadFriends(); await loadStories(); } catch (e) { console.warn(e); }
  refreshUI();
  return true;
}

/* ------------------------------------------------------------------ actions */
const A = {
  authMode: el => renderAuth(el.dataset.m),
  goFriends: () => setTab('friends'),
  openProfile: () => openProfile(),
  pickAvatar: () => $('#avatarIn').click(),
  saveProfile: () => saveProfile(),
  logout: async () => { closeLayer($('#layer').lastElementChild); await sb.auth.signOut(); },
  close: el => closeLayer(el.closest('.ov')),
  backdrop: (el, e) => { if (e.target === el) closeLayer(el); },

  openChat: el => openChat(el.dataset.id),
  closeChat: () => { S.active = null; render(); },
  snapTo: el => { S.snapTarget = el.dataset.id || S.active; S.storyMode = false; S.active = null; S.tab = 'camera'; render(); },
  clearTarget: () => { S.snapTarget = null; S.storyMode = false; updateCamUI(); },
  chatMenu: () => {
    const f = S.byId.get(S.active); if (!f) return;
    pushLayer(`<div class="sheet small" role="dialog" aria-label="Options for ${esc(f.display_name)}"><h2 class="sheet-title">${esc(f.display_name)}</h2>
      <button class="menu-item" data-act="clearChat">${ic('trash', 18)}Clear conversation</button>
      <button class="menu-item danger" data-act="removeFriend">${ic('userx', 18)}Remove friend</button></div>`, 'sheet-host');
  },
  clearChat: async el => {
    closeLayer(el.closest('.ov'));
    const f = S.byId.get(S.active); if (!f) return;
    if (!await ask('Clear this conversation?', `Chats and snaps with ${f.display_name} are deleted for both of you.`, 'Clear')) return;
    const me = S.me.id, arr = S.msgs.get(f.id) || [];
    const paths = arr.filter(m => m.kind === 'snap' && m.media_path).map(m => m.media_path);
    if (paths.length) await sb.storage.from('snaps').remove(paths);
    const { error } = await sb.from('messages').delete().or(`and(sender_id.eq.${me},recipient_id.eq.${f.id}),and(sender_id.eq.${f.id},recipient_id.eq.${me})`);
    if (error) { toast(friendlyError(error), 'err'); return; }
    S.msgs.set(f.id, []); refreshUI(true); toast('Conversation cleared');
  },
  removeFriend: async el => {
    closeLayer(el.closest('.ov'));
    const f = S.byId.get(S.active); if (!f) return;
    if (!await ask(`Remove ${f.display_name}?`, 'You’ll stop seeing each other’s stories and won’t be able to send chats or snaps.', 'Remove')) return;
    if (await friendAction(() => sb.from('friendships').delete().eq('id', f.fid), 'Friend removed')) { S.active = null; render(); }
  },

  addFriend: el => friendAction(() => sb.from('friendships').insert({ requester_id: S.me.id, addressee_id: el.dataset.id }), 'Friend request sent'),
  acceptFriend: el => friendAction(() => sb.from('friendships').update({ status: 'accepted' }).eq('id', el.dataset.fid), 'You’re now friends'),
  declineFriend: el => friendAction(() => sb.from('friendships').delete().eq('id', el.dataset.fid)),
  cancelFriend: el => friendAction(() => sb.from('friendships').delete().eq('id', el.dataset.fid)),

  camStart: () => camStart(),
  camFlip: () => { cam.facing = cam.facing === 'user' ? 'environment' : 'user'; camStart(); },
  shoot: () => shoot(),
  pickFile: () => $('#fileIn').click(),

  edPen: el => {
    ED.pen = !ED.pen;
    $('#edFrame').classList.toggle('pen', ED.pen);
    $('#edColors').hidden = !ED.pen;
    el.classList.toggle('on', ED.pen); el.setAttribute('aria-pressed', ED.pen);
  },
  edColor: el => { ED.color = el.dataset.c; $$('.sw').forEach(s => s.classList.toggle('on', s === el)); },
  edUndo: () => { ED.strokes.pop(); redraw(); },
  edNext: () => openSendSheet(),
  sendSnap: () => sendSnap(),

  openSnap: el => openSnap(el.dataset.id),
  viewStory: el => openStories(el.dataset.id),
  addStory: () => { S.storyMode = true; S.snapTarget = null; S.active = null; S.tab = 'camera'; render(); },
  storyNext, storyPrev, storyDelete: () => storyDelete()
};

/* ------------------------------------------------------------------ events */
document.addEventListener('click', e => {
  const t = e.target.closest('.rail [data-tab]');
  if (t && S.me) { setTab(t.dataset.tab); return; }
  const el = e.target.closest('[data-act]');
  if (el && A[el.dataset.act]) A[el.dataset.act](el, e);
});
document.addEventListener('submit', e => {
  if (e.target.id === 'authForm') { e.preventDefault(); onAuthSubmit(e.target); }
  else if (e.target.id === 'composer') { e.preventDefault(); sendText(); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'friendSearch') onSearchInput(e.target.value);
  else if (e.target.id === 'edCap' && ED) ED.caption = e.target.value;
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.matches?.('.pick input') && ED) { if (t.checked) ED.sel.add(t.value); else ED.sel.delete(t.value); updateSendBtn(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') popLayer(); else if (SV && e.key === 'ArrowRight') storyNext(); else if (SV && e.key === 'ArrowLeft') storyPrev(); });
window.addEventListener('focus', resync);

$('#fileIn').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try { openEditor(await fileToCanvas(file)); } catch { toast('That file couldn’t be opened as a photo.', 'err'); }
});
$('#avatarIn').addEventListener('change', e => {
  const file = e.target.files[0]; e.target.value = '';
  if (file) setAvatar(file);
});

})();
