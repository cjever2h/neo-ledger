/* 데이터 저장소: 기본은 이 기기(localStorage), 로그인하면 Supabase 와 동기화 */
(function (global) {
  const SUPABASE_URL = 'https://gcnfvcbatpohhctitnkl.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_8zyr4Cia8y1JiVOguUC12Q_ZOknEH3F';
  const KEY = 'ledger.v1';
  const TABLES = { tx: 'ledger_tx', budgets: 'ledger_budgets', rules: 'ledger_rules', holdings: 'ledger_holdings' };

  const blank = () => ({
    tx: [], budgets: {}, rules: [], holdings: [],
    settings: { theme: 'auto' },
    cloudUid: null,
    pending: { up: { tx: [], budgets: [], rules: [], holdings: [] }, del: { tx: [], budgets: [], rules: [], holdings: [] } }
  });

  let d = load();
  let sb = null, user = null, lastPull = 0, flushTimer = null, flushing = false;
  const subs = new Set();
  const status = { state: 'local', msg: '이 기기에만 저장 중', at: null };

  function load() {
    try {
      const j = JSON.parse(localStorage.getItem(KEY) || 'null');
      const b = blank();
      if (!j) return b;
      return Object.assign(b, j, { pending: Object.assign(b.pending, j.pending || {}) });
    } catch (e) { return blank(); }
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* 저장공간 부족 등 */ } }
  function emit() { subs.forEach(f => { try { f(); } catch (e) { console.error(e); } }); }
  function setStatus(state, msg) { status.state = state; status.msg = msg; if (state === 'ok') status.at = new Date(); emit(); }
  function uuid() { return (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); })); }
  const nowIso = () => new Date().toISOString();

  function mark(table, key, deleted) {
    const p = d.pending;
    const other = deleted ? p.up[table] : p.del[table];
    const mine = deleted ? p.del[table] : p.up[table];
    const oi = other.indexOf(key); if (oi >= 0) other.splice(oi, 1);
    if (!mine.includes(key)) mine.push(key);
  }
  function changed() { persist(); emit(); scheduleFlush(); }

  // ---------- 거래 ----------
  function addTx(t) {
    const KEYS = ['id', 'occurred_at', 'type', 'amount', 'merchant', 'category', 'account', 'memo', 'source', 'raw_text', 'needs_review', 'created_at', 'updated_at'];
    const clean = {}; KEYS.forEach(k => { if (t[k] !== undefined) clean[k] = t[k]; });
    const row = Object.assign({
      id: uuid(), occurred_at: nowIso(), type: 'expense', amount: 0, merchant: '', category: '기타', account: '', memo: '',
      source: 'manual', raw_text: null, needs_review: false, created_at: nowIso(), updated_at: nowIso()
    }, clean);
    row.amount = Math.max(0, Math.round(Number(row.amount) || 0));
    d.tx.push(row); mark('tx', row.id, false); changed(); return row;
  }
  function updateTx(id, patch) {
    const r = d.tx.find(x => x.id === id); if (!r) return null;
    Object.assign(r, patch, { updated_at: nowIso() });
    r.amount = Math.max(0, Math.round(Number(r.amount) || 0));
    mark('tx', id, false); changed(); return r;
  }
  function removeTx(id) {
    const i = d.tx.findIndex(x => x.id === id); if (i < 0) return null;
    const [r] = d.tx.splice(i, 1); mark('tx', id, true); changed(); return r;
  }
  function restoreTx(row) { d.tx.push(row); mark('tx', row.id, false); changed(); }

  // ---------- 예산 / 규칙 / 보유종목 ----------
  function setBudget(cat, amount) {
    amount = Math.max(0, Math.round(Number(amount) || 0));
    if (amount === 0) { delete d.budgets[cat]; mark('budgets', cat, true); } else { d.budgets[cat] = amount; mark('budgets', cat, false); }
    changed();
  }
  function addRule(keyword, category, type) {
    keyword = String(keyword || '').trim(); if (!keyword) return;
    const i = d.rules.findIndex(r => r.keyword.toLowerCase() === keyword.toLowerCase());
    const row = { keyword, category, type: type || 'expense' };
    if (i >= 0) d.rules[i] = row; else d.rules.push(row);
    mark('rules', keyword, false); changed();
  }
  function removeRule(keyword) {
    const i = d.rules.findIndex(r => r.keyword === keyword); if (i < 0) return;
    d.rules.splice(i, 1); mark('rules', keyword, true); changed();
  }
  function saveHolding(h) {
    const row = Object.assign({ id: uuid(), ticker: '', name: '', market: '', qty: 0, avg_price: 0, cur_price: 0, currency: 'KRW', memo: '', updated_at: nowIso() }, h, { updated_at: nowIso() });
    ['qty', 'avg_price', 'cur_price'].forEach(k => row[k] = Number(row[k]) || 0);
    const i = d.holdings.findIndex(x => x.id === row.id);
    if (i >= 0) d.holdings[i] = row; else d.holdings.push(row);
    mark('holdings', row.id, false); changed(); return row;
  }
  function removeHolding(id) {
    const i = d.holdings.findIndex(x => x.id === id); if (i < 0) return;
    d.holdings.splice(i, 1); mark('holdings', id, true); changed();
  }
  function setSetting(k, v) { d.settings[k] = v; persist(); emit(); }

  // ---------- Supabase ----------
  function client() {
    if (sb) return sb;
    if (!global.supabase) return null;
    sb = global.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    return sb;
  }
  async function init() {
    const c = client();
    if (!c) { setStatus('local', '이 기기에만 저장 중 (동기화 라이브러리를 불러오지 못했어요)'); return; }
    c.auth.onAuthStateChange((ev, session) => {
      const u = session && session.user;
      if (u && (!user || user.id !== u.id)) { user = u; setTimeout(() => fullSync(), 0); }
      if (!u && user) { user = null; setStatus('local', '이 기기에만 저장 중'); }
    });
    const { data } = await c.auth.getSession();
    if (data && data.session) { user = data.session.user; await fullSync(); }
  }
  function toRow(table, key) {
    if (table === 'tx') { const r = d.tx.find(x => x.id === key); return r && Object.assign({}, r, { user_id: user.id }); }
    if (table === 'holdings') { const r = d.holdings.find(x => x.id === key); return r && Object.assign({}, r, { user_id: user.id }); }
    if (table === 'budgets') return d.budgets[key] != null ? { user_id: user.id, category: key, amount: d.budgets[key] } : null;
    if (table === 'rules') { const r = d.rules.find(x => x.keyword === key); return r && { user_id: user.id, keyword: r.keyword, category: r.category, type: r.type || 'expense' }; }
  }
  async function flush() {
    if (!user || flushing) return false;
    const c = client(); flushing = true;
    try {
      for (const t of Object.keys(TABLES)) {
        const keys = d.pending.up[t].slice();
        const rows = keys.map(k => toRow(t, k)).filter(Boolean);
        for (let i = 0; i < rows.length; i += 200) {
          const chunk = rows.slice(i, i + 200);
          const conflict = t === 'budgets' ? 'user_id,category' : t === 'rules' ? 'user_id,keyword' : 'id';
          const { error } = await c.from(TABLES[t]).upsert(chunk, { onConflict: conflict });
          if (error) throw error;
        }
        d.pending.up[t] = d.pending.up[t].filter(k => !keys.includes(k));
        const dels = d.pending.del[t].slice();
        if (dels.length) {
          const col = t === 'budgets' ? 'category' : t === 'rules' ? 'keyword' : 'id';
          for (let i = 0; i < dels.length; i += 100) {
            const { error } = await c.from(TABLES[t]).delete().in(col, dels.slice(i, i + 100));
            if (error) throw error;
          }
          d.pending.del[t] = d.pending.del[t].filter(k => !dels.includes(k));
        }
      }
      persist(); return true;
    } catch (e) {
      console.error('flush', e); setStatus('error', '동기화 실패: ' + (e.message || e)); return false;
    } finally { flushing = false; }
  }
  async function pullAll() {
    const c = client();
    const out = {};
    for (const t of Object.keys(TABLES)) {
      let all = [], from = 0;
      for (;;) {
        const { data, error } = await c.from(TABLES[t]).select('*').range(from, from + 999);
        if (error) throw error;
        all = all.concat(data || []);
        if (!data || data.length < 1000) break;
        from += 1000;
      }
      out[t] = all;
    }
    d.tx = out.tx.map(r => ({ id: r.id, occurred_at: r.occurred_at, type: r.type, amount: Number(r.amount), merchant: r.merchant, category: r.category, account: r.account, memo: r.memo, source: r.source, raw_text: r.raw_text, needs_review: r.needs_review, created_at: r.created_at, updated_at: r.updated_at }));
    d.budgets = {}; out.budgets.forEach(r => d.budgets[r.category] = Number(r.amount));
    d.rules = out.rules.map(r => ({ keyword: r.keyword, category: r.category, type: r.type }));
    d.holdings = out.holdings.map(r => ({ id: r.id, ticker: r.ticker, name: r.name, market: r.market, qty: Number(r.qty), avg_price: Number(r.avg_price), cur_price: Number(r.cur_price), currency: r.currency, memo: r.memo, updated_at: r.updated_at }));
  }
  async function fullSync() {
    if (!user) return false;
    setStatus('syncing', '동기화 중...');
    try {
      if (d.cloudUid !== user.id) {
        // 이 기기의 기존 기록을 계정으로 올린다 (처음 로그인할 때 1회)
        d.tx.forEach(r => mark('tx', r.id, false));
        Object.keys(d.budgets).forEach(k => mark('budgets', k, false));
        d.rules.forEach(r => mark('rules', r.keyword, false));
        d.holdings.forEach(r => mark('holdings', r.id, false));
        d.cloudUid = user.id;
      }
      const ok = await flush();
      if (!ok) return false;
      await pullAll(); lastPull = Date.now(); persist();
      setStatus('ok', '동기화됨 · ' + (user.email || ''));
      return true;
    } catch (e) { console.error(e); setStatus('error', '동기화 실패: ' + (e.message || e)); return false; }
  }
  function scheduleFlush() {
    if (!user) return;
    clearTimeout(flushTimer);
    flushTimer = setTimeout(async () => { const ok = await flush(); if (ok) setStatus('ok', '동기화됨 · ' + (user.email || '')); }, 700);
  }
  async function signIn(email) {
    const c = client(); if (!c) throw new Error('동기화 라이브러리를 불러오지 못했어요');
    const redirect = location.origin + location.pathname;
    const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
    if (error) throw error;
  }
  async function signOut() { const c = client(); if (c) await c.auth.signOut(); user = null; d.cloudUid = null; persist(); setStatus('local', '이 기기에만 저장 중'); }
  function maybePull() { if (user && Date.now() - lastPull > 60000 && !flushing) fullSync(); }

  // ---------- 백업 ----------
  function exportJson() { return JSON.stringify({ app: 'ledger', version: 1, exported_at: nowIso(), tx: d.tx, budgets: d.budgets, rules: d.rules, holdings: d.holdings }, null, 1); }
  function importJson(text) {
    const j = JSON.parse(text);
    if (!j || !Array.isArray(j.tx)) throw new Error('가계부 백업 파일이 아니에요');
    const have = new Set(d.tx.map(x => x.id)); let n = 0;
    j.tx.forEach(r => { if (!have.has(r.id)) { d.tx.push(Object.assign({ id: uuid(), source: 'import' }, r)); mark('tx', r.id || d.tx[d.tx.length - 1].id, false); n++; } });
    Object.entries(j.budgets || {}).forEach(([k, v]) => { d.budgets[k] = v; mark('budgets', k, false); });
    (j.rules || []).forEach(r => { if (!d.rules.find(x => x.keyword === r.keyword)) { d.rules.push(r); mark('rules', r.keyword, false); } });
    (j.holdings || []).forEach(r => { if (!d.holdings.find(x => x.id === r.id)) { d.holdings.push(r); mark('holdings', r.id, false); } });
    changed(); return n;
  }
  function clearAll() {
    d.tx.forEach(r => mark('tx', r.id, true));
    Object.keys(d.budgets).forEach(k => mark('budgets', k, true));
    d.rules.forEach(r => mark('rules', r.keyword, true));
    d.holdings.forEach(r => mark('holdings', r.id, true));
    d.tx = []; d.budgets = {}; d.rules = []; d.holdings = []; changed();
  }

  global.Store = {
    get data() { return d; }, get user() { return user; }, status, uuid,
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
    addTx, updateTx, removeTx, restoreTx, setBudget, addRule, removeRule, saveHolding, removeHolding, setSetting,
    init, fullSync, signIn, signOut, maybePull, exportJson, importJson, clearAll
  };
})(window);
