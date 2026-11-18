/* LEDGER - 수입·지출·투자 가계부 (B 프로 다크) */
(function () {
  'use strict';
  const S = Store, P = Parser;
  const $ = (s, r) => (r || document).querySelector(s);
  const pad = n => String(n).padStart(2, '0');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const won = n => Math.round(n).toLocaleString('ko-KR') + '원';
  const comp = n => { const a = Math.abs(n); if (a >= 1e8) return (n / 1e8).toFixed(a >= 1e9 ? 0 : 1).replace(/\.0$/, '') + '억'; if (a >= 1e4) return Math.round(n / 1e4).toLocaleString('ko-KR') + '만'; return Math.round(n).toLocaleString('ko-KR'); };
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

  const ICONS = {
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    pie: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
    doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    trend: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    gear: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    left: '<polyline points="15 18 9 12 15 6"/>', right: '<polyline points="9 18 15 12 9 6"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
  };
  const icon = (n, c) => '<svg class="i ' + (c || '') + '" viewBox="0 0 24 24">' + ICONS[n] + '</svg>';

  const TYPES = { expense: '지출', income: '수입', invest: '투자' };
  const SRC = { sms: '문자', receipt: '영수증', extension: '확장', share: '공유', sample: '예시', import: '가져옴', manual: '' };
  const ALLCATS = [].concat(P.CATS.expense, P.CATS.income, P.CATS.invest);
  const catColor = c => 'var(--c' + (Math.max(0, ALLCATS.indexOf(c)) % 11) + ')';

  // ---------- 날짜 유틸 ----------
  const ymOf = iso => { const d = new Date(iso); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
  const dayOf = iso => { const d = new Date(iso); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const curYm = () => ymOf(new Date().toISOString());
  const shiftYm = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
  const daysIn = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  const ymLabel = ym => { const [y, m] = ym.split('-'); return y + '년 ' + Number(m) + '월'; };
  const toLocalInput = iso => { const d = new Date(iso); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const fromLocalInput = v => { const d = new Date(v); return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(); };
  const dowName = i => '일월화수목금토'[i];

  // ---------- 상태 ----------
  const st = { tab: 'home', ym: curYm(), year: new Date().getFullYear(), f: { q: '', type: 'all', cat: 'all', view: 'list', day: null, limit: 120 }, stat: 'month', rep: 'month' };
  let sh = null; // 열린 시트 상태
  let cache = null;
  S.subscribe(() => { cache = null; render(); });

  function txs() { return S.data.tx; }
  function byMonth() {
    if (cache) return cache;
    cache = {};
    for (const t of txs()) { const k = ymOf(t.occurred_at); (cache[k] = cache[k] || []).push(t); }
    return cache;
  }
  const inMonth = ym => byMonth()[ym] || [];
  const inYear = y => { let a = []; for (let m = 1; m <= 12; m++) a = a.concat(inMonth(y + '-' + pad(m))); return a; };
  function sums(list) {
    const r = { income: 0, expense: 0, invest: 0, n: list.length };
    for (const t of list) r[t.type] += t.amount;
    r.net = r.income - r.expense - r.invest;
    r.rate = r.income ? Math.round(r.net / r.income * 100) : 0;
    return r;
  }
  function catTotals(list, type) {
    const m = {};
    for (const t of list) if (t.type === type) m[t.category] = (m[t.category] || 0) + t.amount;
    return Object.entries(m).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
  }

  // ---------- 차트 ----------
  function donut(items, centerTop, centerSub) {
    const total = items.reduce((a, b) => a + b.value, 0);
    const r = 54, C = 2 * Math.PI * r; let off = 0;
    let segs = '';
    if (!total) segs = '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="var(--surface2)" stroke-width="22"/>';
    for (const it of items) {
      const len = it.value / total * C;
      segs += '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="' + it.color + '" stroke-width="22" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 70 70)"><title>' + esc(it.label) + ' ' + won(it.value) + '</title></circle>';
      off += len;
    }
    return '<svg class="chart" viewBox="0 0 140 140" width="150" height="150" style="flex:none">' + segs + '<text x="70" y="68" text-anchor="middle" style="font-size:15px;font-weight:800;fill:var(--ink)">' + esc(centerTop) + '</text><text x="70" y="84" text-anchor="middle">' + esc(centerSub || '') + '</text></svg>';
  }
  const narrow = () => window.innerWidth < 560;
  window.addEventListener('resize', () => { clearTimeout(window.__rz); window.__rz = setTimeout(() => { if (!sh) render(); }, 200); });
  function ticks(max) {
    if (max <= 0) return [0, 10000];
    const raw = max / 3, mag = Math.pow(10, Math.floor(Math.log10(raw))); const n = raw / mag;
    const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag; const out = [];
    for (let v = 0; v <= max + step * 0.999; v += step) out.push(v);
    return out;
  }
  function barsChart(groups, seriesColors, opt) {
    opt = opt || {};
    const W = narrow() ? 340 : 560, H = opt.h || 170, L = 34, B = 20, T = 14;
    const maxV = Math.max(1, ...groups.flatMap(g => g.values));
    const tk = ticks(maxV), top = tk[tk.length - 1];
    const gw = (W - L) / groups.length, bw = Math.min(26, gw / (groups[0].values.length + 1));
    let g = '';
    for (const v of tk) { const y = T + (H - T - B) * (1 - v / top); g += '<line x1="' + L + '" x2="' + W + '" y1="' + y + '" y2="' + y + '" stroke="var(--line)" stroke-width="1"/><text x="' + (L - 4) + '" y="' + (y + 3) + '" text-anchor="end">' + comp(v) + '</text>'; }
    groups.forEach((gr, i) => {
      const cx = L + gw * i + gw / 2, n = gr.values.length;
      gr.values.forEach((v, j) => {
        const h = (H - T - B) * v / top, x = cx - (n * bw) / 2 + j * bw, y = H - B - h;
        g += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (bw - 2).toFixed(1) + '" height="' + Math.max(0, h).toFixed(1) + '" rx="3" fill="' + seriesColors[j] + '"' + (gr.dim ? ' opacity=".45"' : '') + '><title>' + esc(gr.label) + ' ' + won(v) + '</title></rect>';
        if (opt.labels && v > 0) g += '<text x="' + (x + bw / 2 - 1).toFixed(1) + '" y="' + (y - 3).toFixed(1) + '" text-anchor="middle" style="font-size:9px">' + comp(v) + '</text>';
      });
      g += '<text x="' + cx + '" y="' + (H - 5) + '" text-anchor="middle"' + (gr.hl ? ' style="fill:var(--ink);font-weight:700"' : '') + '>' + esc(gr.label) + '</text>';
    });
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block">' + g + '</svg>';
  }
  function areaChart(cur, prev, days, budget) {
    const W = narrow() ? 340 : 560, H = 190, L = 40, B = 20, T = 12, R = 10;
    const all = cur.concat(prev).filter(v => v != null); const maxV = Math.max(1, ...all, budget || 0);
    const tk = ticks(maxV), top = tk[tk.length - 1];
    const X = i => L + (W - L - R) * (i / Math.max(1, days - 1)), Y = v => T + (H - T - B) * (1 - v / top);
    let g = '';
    for (const v of tk) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="var(--line)"/><text x="' + (L - 5) + '" y="' + (Y(v) + 3) + '" text-anchor="end">' + comp(v) + '</text>';
    const path = arr => arr.map((v, i) => v == null ? '' : (i === 0 || arr[i - 1] == null ? 'M' : 'L') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
    if (budget) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(budget) + '" y2="' + Y(budget) + '" stroke="var(--warn)" stroke-dasharray="4 4"/><text x="' + (W - R) + '" y="' + (Y(budget) - 4) + '" text-anchor="end" style="fill:var(--warn)">예산 ' + comp(budget) + '</text>';
    if (prev.length) g += '<path d="' + path(prev) + '" fill="none" stroke="var(--sub)" stroke-width="1.6" stroke-dasharray="4 4" opacity=".8"/>';
    const last = cur.reduce((a, v, i) => v != null ? i : a, -1);
    if (last >= 0) {
      const line = path(cur);
      g += '<defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--pt)" stop-opacity=".32"/><stop offset="1" stop-color="var(--pt)" stop-opacity="0"/></linearGradient></defs>';
      g += '<path d="' + line + ' L' + X(last).toFixed(1) + ' ' + Y(0) + ' L' + X(0) + ' ' + Y(0) + ' Z" fill="url(#ag)"/><path d="' + line + '" fill="none" stroke="var(--pt)" stroke-width="2.4" stroke-linejoin="round"/>';
      g += '<circle cx="' + X(last).toFixed(1) + '" cy="' + Y(cur[last]).toFixed(1) + '" r="4" fill="var(--pt)"/>';
    }
    const xl = [0, Math.floor(days * .25), Math.floor(days * .5), Math.floor(days * .75), days - 1];
    xl.forEach(i => g += '<text x="' + X(i) + '" y="' + (H - 5) + '" text-anchor="middle">' + (i + 1) + '일</text>');
    for (let i = 0; i < days; i++) { const v = cur[i] != null ? cur[i] : null; g += '<rect x="' + (X(i) - 6).toFixed(1) + '" y="' + T + '" width="12" height="' + (H - T - B) + '" fill="transparent"><title>' + (i + 1) + '일 누적 ' + (v != null ? won(v) : '-') + (prev[i] != null ? ' / 전월 ' + won(prev[i]) : '') + '</title></rect>'; }
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block">' + g + '</svg>';
  }
  function hbars(rows) {
    return '<div class="hbar">' + rows.map(r => '<div class="r"><span class="l">' + esc(r.label) + '</span><span class="t"><i class="' + (r.over ? 'over' : '') + '" style="width:' + Math.min(100, r.max ? r.value / r.max * 100 : 0).toFixed(1) + '%;' + (r.color && !r.over ? 'background:' + r.color : '') + '"></i></span><span class="num">' + esc(r.text) + '</span></div>').join('') + '</div>';
  }

  // ---------- 공통 조각 ----------
  function monthNav(kind) {
    const lab = kind === 'year' ? st.year + '년' : ymLabel(st.ym);
    return '<div class="mnav"><button data-a="prev" aria-label="이전">' + icon('left', 'sm') + '</button><span class="lbl">' + lab + '</span><button data-a="next" aria-label="다음">' + icon('right', 'sm') + '</button></div>';
  }
  function txRow(t, o) {
    o = o || {};
    const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '';
    const cls = t.type === 'income' ? 'up' : t.type === 'invest' ? '' : 'dn';
    const style = t.type === 'invest' ? 'color:var(--v)' : '';
    const d = new Date(t.occurred_at);
    const when = o.date ? (d.getMonth() + 1) + '/' + d.getDate() + ' ' : '';
    const time = pad(d.getHours()) + ':' + pad(d.getMinutes());
    const src = SRC[t.source] ? '<span class="chip gray">' + SRC[t.source] + '</span>' : '';
    const rev = t.needs_review ? '<span class="chip warn">확인 필요</span>' : '';
    return '<div class="tx" role="button" tabindex="0" data-a="tx-open" data-id="' + t.id + '"><div class="ic" style="background:color-mix(in srgb,' + catColor(t.category) + ' 20%,transparent);color:' + catColor(t.category) + '">' + esc(t.category[0]) + '</div><div class="m"><b>' + esc(t.merchant || '(내용 없음)') + '</b><span>' + rev + src + esc(t.category) + ' · ' + when + time + (t.account ? ' · ' + esc(t.account) : '') + '</span></div>' + (o.ok ? '<button class="btn sm" data-a="tx-ok" data-id="' + t.id + '">확인</button>' : '') + '<div class="a num ' + cls + '" style="' + style + '">' + sign + won(t.amount) + '</div></div>';
  }
  function empty(title, sub, btn) { return '<div class="empty"><b>' + title + '</b>' + (sub || '') + (btn || '') + '</div>'; }
  const sampleBtn = '<div style="margin-top:12px"><button class="btn sm" data-a="sample">예시 데이터로 둘러보기</button></div>';

  // ---------- 홈 ----------
  function viewHome() {
    const ym = st.ym, list = inMonth(ym), s = sums(list), pm = shiftYm(ym, -1), ps = sums(inMonth(pm));
    const dim = daysIn(ym), now = new Date(), isCur = ym === curYm();
    const dayExp = new Array(dim).fill(0), pdim = daysIn(pm), pdayExp = new Array(pdim).fill(0);
    list.forEach(t => { if (t.type === 'expense') dayExp[new Date(t.occurred_at).getDate() - 1] += t.amount; });
    inMonth(pm).forEach(t => { if (t.type === 'expense') pdayExp[new Date(t.occurred_at).getDate() - 1] += t.amount; });
    const cum = [], pcum = []; let a = 0, b = 0;
    for (let i = 0; i < dim; i++) { a += dayExp[i]; cum.push(isCur && i + 1 > now.getDate() ? null : a); }
    for (let i = 0; i < pdim; i++) { b += pdayExp[i]; if (i < dim) pcum.push(b); }
    const budgetTotal = Object.values(S.data.budgets).reduce((x, y) => x + y, 0);
    const expDelta = ps.expense ? Math.round((s.expense - ps.expense) / ps.expense * 100) : null;
    const review = txs().filter(t => t.needs_review).sort((x, y) => y.occurred_at.localeCompare(x.occurred_at));
    const recent = list.slice().sort((x, y) => y.occurred_at.localeCompare(x.occurred_at)).slice(0, 6);
    const top = catTotals(list, 'expense').slice(0, 5);
    const topMax = top.length ? top[0].v : 0;
    const flowBase = Math.max(s.income, s.expense + s.invest, 1);
    const hold = holdingTotals();
    let h = '<div class="pagehead"><h1>대시보드</h1>' + monthNav('month') + '</div>';
    if (!txs().length) h += '<div class="card" style="margin-bottom:12px">' + empty('아직 기록이 없어요', '오른쪽 아래 + 버튼으로 결제 문자나 영수증을 넣으면 자동으로 분류해서 등록해요.', sampleBtn) + '</div>';
    h += '<div class="grid g4">'
      + '<div class="card kpi pri"><h3>남은 돈</h3><div class="v num ' + (s.net < 0 ? 'dn' : 'up') + '">' + won(s.net) + '</div><div class="s">저축률 ' + (s.income ? s.rate + '%' : '-') + '</div></div>'
      + '<div class="card kpi"><h3>수입</h3><div class="v num up">' + won(s.income) + '</div><div class="s">' + (ps.income ? '전월 ' + won(ps.income) : '전월 기록 없음') + '</div></div>'
      + '<div class="card kpi"><h3>지출</h3><div class="v num">' + won(s.expense) + '</div><div class="s">' + (expDelta == null ? '전월 기록 없음' : '전월 대비 <span class="' + (expDelta > 0 ? 'dn' : 'up') + '">' + (expDelta > 0 ? '+' : '') + expDelta + '%</span>') + '</div></div>'
      + '<div class="card kpi"><h3>투자</h3><div class="v num" style="color:var(--v)">' + won(s.invest) + '</div><div class="s">' + (s.income ? '수입의 ' + pct(s.invest, s.income) + '%' : '이번 달 납입') + '</div></div>'
      + '</div>';
    h += '<div class="grid g32" style="margin-top:12px"><div class="card"><h3><span>누적 지출 추이</span><span class="tiny">점선: 전월</span></h3>' + areaChart(cum, pcum, dim, budgetTotal) + '</div>'
      + '<div style="display:flex;flex-direction:column;gap:12px;min-width:0"><div class="card"><h3>이번 달 현금흐름</h3><div class="bar"><i style="width:' + pct(s.expense, flowBase) + '%;background:var(--pt)"></i><i style="width:' + pct(s.invest, flowBase) + '%;background:var(--v)"></i></div><div class="legend"><span><b style="background:var(--pt)"></b>지출 ' + pct(s.expense, flowBase) + '%</span><span><b style="background:var(--v)"></b>투자 ' + pct(s.invest, flowBase) + '%</span><span><b style="background:var(--surface2)"></b>잔액 ' + Math.max(0, 100 - pct(s.expense, flowBase) - pct(s.invest, flowBase)) + '%</span></div></div>'
      + '<div class="card"><h3><span>투자 현황</span><button class="btn sm" data-a="tab" data-tab="invest">보기</button></h3>' + (hold.count ? '<div class="num" style="font-size:20px;font-weight:800">' + won(hold.valueKrw) + '</div><div class="small ' + (hold.pl >= 0 ? 'up' : 'dn') + '">평가손익 ' + (hold.pl >= 0 ? '+' : '') + won(hold.pl) + ' (' + hold.plRate.toFixed(1) + '%)</div>' : '<div class="small muted">보유 종목을 등록하면 평가금액과 손익이 여기에 보여요. 이번 달 투자 납입은 ' + won(s.invest) + '이에요.</div>') + '</div></div></div>';
    if (review.length) h += '<div class="card" style="margin-top:12px"><h3><span>확인 필요 ' + review.length + '건</span><span class="tiny">분류가 불확실한 자동 등록 건이에요</span></h3><div class="list">' + review.slice(0, 5).map(t => txRow(t, { ok: true, date: true })).join('') + '</div></div>';
    h += '<div class="grid g2" style="margin-top:12px"><div class="card"><h3><span>최근 거래</span><button class="btn sm" data-a="tab" data-tab="tx">전체</button></h3>' + (recent.length ? '<div class="list">' + recent.map(t => txRow(t, { date: true })).join('') + '</div>' : empty('이 달 거래가 없어요')) + '</div>'
      + '<div class="card"><h3><span>지출 TOP 카테고리</span><button class="btn sm" data-a="tab" data-tab="stats">통계</button></h3>' + (top.length ? hbars(top.map(c => { const bg = S.data.budgets[c.k]; return { label: c.k, value: c.v, max: topMax, color: catColor(c.k), text: won(c.v) + (bg ? ' / ' + comp(bg) : ''), over: bg && c.v > bg }; })) : empty('지출 기록이 없어요')) + '</div></div>';
    return h;
  }

  // ---------- 거래 ----------
  function viewTx() {
    const f = st.f; let list = inMonth(st.ym);
    if (f.type !== 'all') list = list.filter(t => t.type === f.type);
    if (f.cat !== 'all') list = list.filter(t => t.category === f.cat);
    if (f.q) { const q = f.q.toLowerCase(); list = list.filter(t => (t.merchant + ' ' + t.memo + ' ' + t.category + ' ' + t.account).toLowerCase().includes(q)); }
    const s = sums(list);
    const catOpts = '<option value="all">모든 카테고리</option>' + ALLCATS.map(c => '<option' + (f.cat === c ? ' selected' : '') + '>' + c + '</option>').join('');
    let h = '<div class="pagehead"><h1>거래</h1>' + monthNav('month') + '<span class="sp"></span><div class="seg neutral"><button class="' + (f.view === 'list' ? 'on' : '') + '" data-a="txview" data-v="list">목록</button><button class="' + (f.view === 'cal' ? 'on' : '') + '" data-a="txview" data-v="cal">달력</button></div></div>';
    h += '<div class="filters"><input type="search" placeholder="가맹점·메모 검색" value="' + esc(f.q) + '" data-bind="q"><select data-bind="type"><option value="all">전체</option>' + Object.keys(TYPES).map(k => '<option value="' + k + '"' + (f.type === k ? ' selected' : '') + '>' + TYPES[k] + '</option>').join('') + '</select><select data-bind="cat">' + catOpts + '</select></div>';
    h += '<div class="small muted" style="margin:-4px 2px 10px">' + s.n + '건 · 수입 <span class="up num">' + won(s.income) + '</span> · 지출 <span class="num">' + won(s.expense) + '</span> · 투자 <span class="num" style="color:var(--v)">' + won(s.invest) + '</span></div>';
    if (f.view === 'cal') {
      const [y, m] = st.ym.split('-').map(Number), first = new Date(y, m - 1, 1).getDay(), dim = daysIn(st.ym), dm = {};
      list.forEach(t => { const k = new Date(t.occurred_at).getDate(); dm[k] = dm[k] || { e: 0, i: 0 }; if (t.type === 'income') dm[k].i += t.amount; else dm[k].e += t.amount; });
      let c = '<div class="cal">' + '일월화수목금토'.split('').map(x => '<div class="h">' + x + '</div>').join('');
      for (let i = 0; i < first; i++) c += '<div class="d e"></div>';
      const today = dayOf(new Date().toISOString());
      for (let d = 1; d <= dim; d++) {
        const key = st.ym + '-' + pad(d), v = dm[d];
        c += '<button class="d' + (key === today ? ' t' : '') + (f.day === key ? ' sel' : '') + '" data-a="calday" data-day="' + key + '"><span class="n">' + d + '</span><span>' + (v && v.e ? '<div class="x num">-' + comp(v.e) + '</div>' : '') + (v && v.i ? '<div class="y num">+' + comp(v.i) + '</div>' : '') + '</span></button>';
      }
      c += '</div>';
      h += '<div class="card">' + c + '</div>';
      if (f.day) list = list.filter(t => dayOf(t.occurred_at) === f.day); else list = [];
      if (f.day) h += '<div class="card" style="margin-top:12px"><h3>' + f.day + ' 내역 <button class="btn sm" data-a="calday" data-day="">닫기</button></h3>' + (list.length ? '<div class="list">' + list.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)).map(t => txRow(t)).join('') + '</div>' : empty('이 날은 거래가 없어요')) + '</div>';
      return h;
    }
    list = list.slice().sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    if (!list.length) return h + '<div class="card">' + empty('조건에 맞는 거래가 없어요', '', !txs().length ? sampleBtn : '') + '</div>';
    let out = '<div class="card" style="padding-top:6px">', lastDay = '', n = 0;
    const dayTot = {};
    list.forEach(t => { const k = dayOf(t.occurred_at); dayTot[k] = dayTot[k] || 0; if (t.type === 'expense') dayTot[k] -= t.amount; else if (t.type === 'income') dayTot[k] += t.amount; });
    for (const t of list) {
      if (n >= f.limit) break; n++;
      const k = dayOf(t.occurred_at);
      if (k !== lastDay) { if (lastDay) out += '</div>'; const d = new Date(t.occurred_at); out += '<div class="dayhead"><span>' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + dowName(d.getDay()) + ')</span><span class="num">' + (dayTot[k] ? (dayTot[k] > 0 ? '+' : '-') + won(Math.abs(dayTot[k])) : '') + '</span></div><div class="list">'; lastDay = k; }
      out += txRow(t);
    }
    out += '</div>';
    if (list.length > n) out += '<div style="text-align:center;padding:10px"><button class="btn sm" data-a="more">더 보기 (' + (list.length - n) + '건)</button></div>';
    return h + out + '</div>';
  }

  // ---------- 통계 ----------
  function viewStats() {
    const yr = st.stat === 'year';
    const list = yr ? inYear(st.year) : inMonth(st.ym), s = sums(list);
    const ex = catTotals(list, 'expense'), inc = catTotals(list, 'income'), exTotal = s.expense;
    let h = '<div class="pagehead"><h1>통계</h1>' + monthNav(yr ? 'year' : 'month') + '<span class="sp"></span><div class="seg neutral"><button class="' + (!yr ? 'on' : '') + '" data-a="statkind" data-v="month">월</button><button class="' + (yr ? 'on' : '') + '" data-a="statkind" data-v="year">연</button></div></div>';
    h += '<div class="grid g4"><div class="card kpi"><h3>수입</h3><div class="v num up">' + won(s.income) + '</div></div><div class="card kpi"><h3>지출</h3><div class="v num">' + won(s.expense) + '</div></div><div class="card kpi"><h3>투자</h3><div class="v num" style="color:var(--v)">' + won(s.invest) + '</div></div><div class="card kpi"><h3>저축률</h3><div class="v num">' + (s.income ? s.rate + '%' : '-') + '</div><div class="s">(수입-지출-투자)/수입</div></div></div>';
    h += '<div class="grid g2" style="margin-top:12px"><div class="card"><h3>지출 카테고리</h3>' + (ex.length ? '<div class="donutwrap">' + donut(ex.map(c => ({ label: c.k, value: c.v, color: catColor(c.k) })), comp(exTotal), '총 지출') + '<div class="catlist">' + ex.map(c => '<button class="catrow" data-a="catgo" data-cat="' + esc(c.k) + '"><b style="background:' + catColor(c.k) + '"></b><span class="n">' + esc(c.k) + '</span><span class="p num">' + pct(c.v, exTotal) + '%</span><span class="amt num">' + won(c.v) + '</span></button>').join('') + '</div></div>' : empty('지출 기록이 없어요')) + '</div>';
    // 최근 추이
    const groups = [];
    if (yr) for (let m = 1; m <= 12; m++) { const q = sums(inMonth(st.year + '-' + pad(m))); groups.push({ label: m + '월', values: [q.income, q.expense, q.invest] }); }
    else for (let i = 5; i >= 0; i--) { const k = shiftYm(st.ym, -i), q = sums(inMonth(k)); groups.push({ label: Number(k.split('-')[1]) + '월', values: [q.income, q.expense, q.invest], hl: i === 0 }); }
    h += '<div class="card"><h3><span>' + (yr ? '월별 흐름' : '최근 6개월 흐름') + '</span></h3>' + barsChart(groups, ['var(--c0)', 'var(--c4)', 'var(--c1)'], { labels: !yr }) + '<div class="legend"><span><b style="background:var(--c0)"></b>수입</span><span><b style="background:var(--c4)"></b>지출</span><span><b style="background:var(--c1)"></b>투자</span></div></div></div>';
    // 가맹점 TOP / 요일
    const mm = {}; list.forEach(t => { if (t.type === 'expense') { const k = t.merchant || '(없음)'; mm[k] = mm[k] || { v: 0, n: 0 }; mm[k].v += t.amount; mm[k].n++; } });
    const tm = Object.entries(mm).sort((a, b) => b[1].v - a[1].v).slice(0, 8);
    const wd = [0, 0, 0, 0, 0, 0, 0], wdn = [0, 0, 0, 0, 0, 0, 0];
    list.forEach(t => { if (t.type === 'expense') { const w = new Date(t.occurred_at).getDay(); wd[w] += t.amount; } });
    const wg = [1, 2, 3, 4, 5, 6, 0].map(i => ({ label: dowName(i), values: [wd[i]] }));
    h += '<div class="grid g2" style="margin-top:12px"><div class="card"><h3>많이 쓴 곳 TOP 8</h3>' + (tm.length ? hbars(tm.map(([k, v]) => ({ label: k, value: v.v, max: tm[0][1].v, text: won(v.v) + ' (' + v.n + '회)', color: 'var(--c2)' }))) : empty('데이터가 없어요')) + '</div>'
      + '<div class="card"><h3>요일별 지출</h3>' + barsChart(wg, ['var(--c3)'], { h: 150 }) + '</div></div>';
    if (!yr) {
      const dim = daysIn(st.ym), de = new Array(dim).fill(0); list.forEach(t => { if (t.type === 'expense') de[new Date(t.occurred_at).getDate() - 1] += t.amount; });
      const dg = de.map((v, i) => ({ label: (i + 1) % 5 === 0 || i === 0 ? String(i + 1) : '', values: [v] }));
      h += '<div class="card" style="margin-top:12px"><h3>일별 지출</h3>' + barsChart(dg, ['var(--c0)'], { h: 150 }) + '</div>';
      const bud = Object.entries(S.data.budgets);
      h += '<div class="card" style="margin-top:12px"><h3><span>예산 대비 지출</span><button class="btn sm" data-a="settings">예산 설정</button></h3>' + (bud.length ? hbars(bud.map(([k, v]) => { const used = (ex.find(c => c.k === k) || { v: 0 }).v; return { label: k, value: used, max: v, text: won(used) + ' / ' + won(v) + ' (' + pct(used, v) + '%)', over: used > v, color: catColor(k) }; })) : '<div class="hint">설정에서 카테고리별 월 예산을 정하면 사용률이 여기에 표시돼요.</div>') + '</div>';
    }
    if (inc.length) h += '<div class="card" style="margin-top:12px"><h3>수입 구성</h3>' + hbars(inc.map(c => ({ label: c.k, value: c.v, max: inc[0].v, text: won(c.v), color: catColor(c.k) }))) + '</div>';
    return h;
  }

  // ---------- 결산 ----------
  function viewReport() {
    const yr = st.rep === 'year';
    let h = '<div class="pagehead"><h1>결산</h1>' + monthNav(yr ? 'year' : 'month') + '<span class="sp"></span><div class="seg neutral"><button class="' + (!yr ? 'on' : '') + '" data-a="repkind" data-v="month">월간</button><button class="' + (yr ? 'on' : '') + '" data-a="repkind" data-v="year">연간</button></div><button class="btn sm noprint" data-a="print">인쇄·PDF</button></div>';
    if (yr) return h + yearReport();
    const ym = st.ym, list = inMonth(ym), s = sums(list), pm = shiftYm(ym, -1), pl = inMonth(pm), ps = sums(pl);
    if (!list.length) return h + '<div class="card">' + empty('이 달 기록이 없어요', '거래를 등록하면 자동으로 결산이 만들어져요.', !txs().length ? sampleBtn : '') + '</div>';
    const ex = catTotals(list, 'expense'), pex = catTotals(pl, 'expense'), pmap = Object.fromEntries(pex.map(c => [c.k, c.v]));
    const m = Number(ym.split('-')[1]);
    const lines = [];
    let head = m + '월에는 수입 <b class="num up">' + won(s.income) + '</b>, 지출 <b class="num">' + won(s.expense) + '</b>, 투자 <b class="num" style="color:var(--v)">' + won(s.invest) + '</b>이었고 <b class="num ' + (s.net < 0 ? 'dn' : 'up') + '">' + won(s.net) + '</b>이 ' + (s.net < 0 ? '부족했어요' : '남았어요') + (s.income ? ' (저축률 ' + s.rate + '%).' : '.');
    if (ps.expense) { const d = Math.round((s.expense - ps.expense) / ps.expense * 100); lines.push('지출은 전월(' + won(ps.expense) + ')보다 <b class="' + (d > 0 ? 'dn' : 'up') + '">' + Math.abs(d) + '% ' + (d > 0 ? '늘었어요' : d < 0 ? '줄었어요' : '같아요') + '</b>.'); }
    if (ex.length) lines.push('가장 큰 지출은 <b>' + esc(ex[0].k) + '</b> ' + won(ex[0].v) + ' (지출의 ' + pct(ex[0].v, s.expense) + '%)이에요.');
    const grow = ex.map(c => ({ k: c.k, d: c.v - (pmap[c.k] || 0) })).filter(c => pmap[c.k] != null).sort((a, b) => b.d - a.d)[0];
    if (grow && grow.d > 0) lines.push('전월보다 가장 많이 늘어난 항목은 <b>' + esc(grow.k) + '</b> (+' + won(grow.d) + ')이에요.');
    const dayMap = {}; list.forEach(t => { if (t.type === 'expense') { const k = dayOf(t.occurred_at); dayMap[k] = (dayMap[k] || 0) + t.amount; } });
    const topDay = Object.entries(dayMap).sort((a, b) => b[1] - a[1])[0];
    if (topDay) lines.push('가장 많이 쓴 날은 <b>' + Number(topDay[0].slice(8)) + '일</b> (' + won(topDay[1]) + ')이에요. 하루 평균 지출은 ' + won(s.expense / (ym === curYm() ? new Date().getDate() : daysIn(ym))) + '이에요.');
    const big = list.filter(t => t.type === 'expense').sort((a, b) => b.amount - a.amount)[0];
    if (big) lines.push('가장 큰 단건 지출은 <b>' + esc(big.merchant) + '</b> ' + won(big.amount) + '이에요.');
    const overs = Object.entries(S.data.budgets).filter(([k, v]) => ((ex.find(c => c.k === k) || { v: 0 }).v) > v);
    if (Object.keys(S.data.budgets).length) lines.push(overs.length ? '예산을 넘긴 항목: <b class="dn">' + overs.map(([k]) => esc(k)).join(', ') + '</b>.' : '설정한 예산을 모두 지켰어요.');
    const auto = list.filter(t => ['sms', 'receipt', 'extension', 'share'].includes(t.source)).length;
    if (auto) lines.push('자동 인식으로 등록한 건은 ' + auto + '건(' + pct(auto, list.length) + '%)이고, 확인이 필요한 건은 ' + list.filter(t => t.needs_review).length + '건이에요.');
    h += '<div class="card"><div class="bigmsg">' + head + '</div><ul class="note" style="margin:12px 0 0;padding-left:28px">' + lines.map(l => '<li>' + l + '</li>').join('') + '</ul></div>';
    const cats = ALLCATS.filter(c => P.CATS.expense.includes(c));
    const rows = cats.map(c => ({ k: c, v: (ex.find(x => x.k === c) || { v: 0 }).v, p: pmap[c] || 0, b: S.data.budgets[c] || 0 })).filter(r => r.v || r.p || r.b).sort((a, b) => b.v - a.v);
    h += '<div class="card scroll-x" style="margin-top:12px"><h3>지출 카테고리 결산</h3><table class="t"><thead><tr><th>카테고리</th><th>이번 달</th><th>비중</th><th>전월</th><th>증감</th><th>예산</th></tr></thead><tbody>' + rows.map(r => { const d = r.v - r.p; return '<tr><td>' + esc(r.k) + '</td><td class="num">' + won(r.v) + '</td><td class="num">' + pct(r.v, s.expense) + '%</td><td class="num muted">' + (r.p ? won(r.p) : '-') + '</td><td class="num ' + (d > 0 ? 'dn' : d < 0 ? 'up' : '') + '">' + (r.p || r.v ? (d > 0 ? '+' : '') + won(d) : '-') + '</td><td class="num ' + (r.b && r.v > r.b ? 'dn' : '') + '">' + (r.b ? won(r.b) + ' (' + pct(r.v, r.b) + '%)' : '-') + '</td></tr>'; }).join('') + '<tr><td><b>합계</b></td><td class="num"><b>' + won(s.expense) + '</b></td><td></td><td class="num muted">' + won(ps.expense) + '</td><td class="num">' + (s.expense - ps.expense > 0 ? '+' : '') + won(s.expense - ps.expense) + '</td><td class="num">' + (Object.keys(S.data.budgets).length ? won(Object.values(S.data.budgets).reduce((a, b) => a + b, 0)) : '-') + '</td></tr></tbody></table></div>';
    const inc = catTotals(list, 'income'), iv = catTotals(list, 'invest');
    h += '<div class="grid g2" style="margin-top:12px"><div class="card"><h3>수입 내역</h3>' + (inc.length ? inc.map(c => '<div class="rulerow"><span>' + esc(c.k) + '</span><b class="num up">' + won(c.v) + '</b></div>').join('') : '<div class="hint">수입 기록이 없어요</div>') + '</div><div class="card"><h3>투자 납입</h3>' + (iv.length ? iv.map(c => '<div class="rulerow"><span>' + esc(c.k) + '</span><b class="num" style="color:var(--v)">' + won(c.v) + '</b></div>').join('') : '<div class="hint">투자 기록이 없어요</div>') + '</div></div>';
    return h;
  }
  function yearReport() {
    const y = st.year; let rows = '', tot = { income: 0, expense: 0, invest: 0, net: 0 }, best = null, worst = null;
    for (let m = 1; m <= 12; m++) {
      const q = sums(inMonth(y + '-' + pad(m)));
      if (!q.n) continue;
      ['income', 'expense', 'invest', 'net'].forEach(k => tot[k] += q[k]);
      if (!best || q.net > best.q.net) best = { m, q }; if (!worst || q.expense > worst.q.expense) worst = { m, q };
      rows += '<tr><td>' + m + '월</td><td class="num up">' + won(q.income) + '</td><td class="num">' + won(q.expense) + '</td><td class="num" style="color:var(--v)">' + won(q.invest) + '</td><td class="num ' + (q.net < 0 ? 'dn' : '') + '">' + won(q.net) + '</td><td class="num">' + (q.income ? q.rate + '%' : '-') + '</td></tr>';
    }
    if (!rows) return '<div class="card">' + empty(y + '년 기록이 없어요') + '</div>';
    const list = inYear(y), ex = catTotals(list, 'expense');
    let h = '<div class="card"><div class="bigmsg">' + y + '년 한 해 수입 <b class="num up">' + won(tot.income) + '</b>, 지출 <b class="num">' + won(tot.expense) + '</b>, 투자 <b class="num" style="color:var(--v)">' + won(tot.invest) + '</b>, 남은 돈 <b class="num">' + won(tot.net) + '</b>이에요' + (tot.income ? ' (저축률 ' + Math.round(tot.net / tot.income * 100) + '%).' : '.') + '</div><ul class="note" style="margin:12px 0 0;padding-left:28px">'
      + (best ? '<li>가장 많이 남긴 달은 <b>' + best.m + '월</b> (' + won(best.q.net) + ')이에요.</li>' : '') + (worst ? '<li>지출이 가장 컸던 달은 <b>' + worst.m + '월</b> (' + won(worst.q.expense) + ')이에요.</li>' : '') + (ex[0] ? '<li>연간 최대 지출 항목은 <b>' + esc(ex[0].k) + '</b> ' + won(ex[0].v) + ' (' + pct(ex[0].v, tot.expense) + '%)이에요.</li>' : '') + '</ul></div>';
    h += '<div class="card scroll-x" style="margin-top:12px"><h3>월별 결산</h3><table class="t"><thead><tr><th>월</th><th>수입</th><th>지출</th><th>투자</th><th>남은 돈</th><th>저축률</th></tr></thead><tbody>' + rows + '<tr><td><b>합계</b></td><td class="num up"><b>' + won(tot.income) + '</b></td><td class="num"><b>' + won(tot.expense) + '</b></td><td class="num" style="color:var(--v)"><b>' + won(tot.invest) + '</b></td><td class="num"><b>' + won(tot.net) + '</b></td><td class="num">' + (tot.income ? Math.round(tot.net / tot.income * 100) + '%' : '-') + '</td></tr></tbody></table></div>';
    h += '<div class="card" style="margin-top:12px"><h3>지출 카테고리 (연간)</h3>' + hbars(ex.map(c => ({ label: c.k, value: c.v, max: ex[0].v, text: won(c.v) + ' (' + pct(c.v, tot.expense) + '%)', color: catColor(c.k) }))) + '</div>';
    return h;
  }

  // ---------- 투자 ----------
  const usdkrw = () => Number(S.data.settings.usdkrw) || 1400;
  function holdingTotals() {
    let value = 0, cost = 0;
    for (const h of S.data.holdings) { const r = h.currency === 'USD' ? usdkrw() : 1; value += h.qty * (h.cur_price || h.avg_price) * r; cost += h.qty * h.avg_price * r; }
    return { count: S.data.holdings.length, valueKrw: value, cost, pl: value - cost, plRate: cost ? (value - cost) / cost * 100 : 0 };
  }
  function viewInvest() {
    const hs = S.data.holdings, t = holdingTotals();
    let h = '<div class="pagehead"><h1>투자</h1><span class="sp"></span><button class="btn pri sm" data-a="holding-open">+ 종목 추가</button></div>';
    h += '<div class="grid g4"><div class="card kpi pri"><h3>평가금액</h3><div class="v num">' + won(t.valueKrw) + '</div><div class="s">USD는 1달러 = ' + usdkrw().toLocaleString('ko-KR') + '원 기준</div></div><div class="card kpi"><h3>투자원금</h3><div class="v num">' + won(t.cost) + '</div></div><div class="card kpi"><h3>평가손익</h3><div class="v num ' + (t.pl >= 0 ? 'up' : 'dn') + '">' + (t.pl >= 0 ? '+' : '') + won(t.pl) + '</div><div class="s">' + t.plRate.toFixed(1) + '%</div></div><div class="card kpi"><h3>환율 (USD→KRW)</h3><div style="margin-top:4px"><input class="num" style="background:var(--surface2);border:1px solid var(--line);border-radius:8px;padding:6px 8px;width:100%" inputmode="numeric" value="' + usdkrw() + '" data-bind="usdkrw"></div></div></div>';
    if (!hs.length) h += '<div class="card" style="margin-top:12px">' + empty('보유 종목이 없어요', '종목을 직접 등록하면 평가금액과 손익을 계산해요. 증권사·시세 연동은 다음 단계에서 이 화면에 붙일 수 있어요.') + '</div>';
    else {
      const items = hs.map(x => ({ label: x.ticker, value: x.qty * (x.cur_price || x.avg_price) * (x.currency === 'USD' ? usdkrw() : 1), color: '' })).sort((a, b) => b.value - a.value).map((x, i) => Object.assign(x, { color: 'var(--c' + (i % 11) + ')' }));
      h += '<div class="grid g32" style="margin-top:12px"><div class="card scroll-x"><h3>보유 종목</h3><table class="t"><thead><tr><th>종목</th><th>수량</th><th>평균단가</th><th>현재가</th><th>평가손익</th></tr></thead><tbody>' + hs.map(x => { const cur = x.cur_price || x.avg_price, pl = (cur - x.avg_price) * x.qty, r = x.avg_price ? (cur / x.avg_price - 1) * 100 : 0, cs = x.currency === 'USD' ? '$' : ''; return '<tr style="cursor:pointer" data-a="holding-open" data-id="' + x.id + '"><td><b>' + esc(x.ticker) + '</b><div class="tiny muted">' + esc(x.name) + '</div></td><td class="num">' + x.qty.toLocaleString('ko-KR') + '</td><td class="num">' + cs + x.avg_price.toLocaleString('ko-KR') + '</td><td class="num">' + cs + cur.toLocaleString('ko-KR') + '</td><td class="num ' + (pl >= 0 ? 'up' : 'dn') + '">' + (pl >= 0 ? '+' : '') + cs + Math.round(pl).toLocaleString('ko-KR') + '<div class="tiny">' + r.toFixed(1) + '%</div></td></tr>'; }).join('') + '</tbody></table></div><div class="card"><h3>자산 배분</h3><div class="donutwrap" style="justify-content:center">' + donut(items, comp(t.valueKrw), '평가금액') + '<div class="catlist">' + items.map(i => '<div class="catrow"><b style="background:' + i.color + '"></b><span class="n">' + esc(i.label) + '</span><span class="p num">' + pct(i.value, t.valueKrw) + '%</span></div>').join('') + '</div></div></div></div>';
    }
    const groups = []; for (let i = 5; i >= 0; i--) { const k = shiftYm(curYm(), -i), q = sums(inMonth(k)); groups.push({ label: Number(k.split('-')[1]) + '월', values: [q.invest], hl: i === 0 }); }
    const recent = txs().filter(x => x.type === 'invest').sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 6);
    h += '<div class="grid g2" style="margin-top:12px"><div class="card"><h3>월별 투자 납입 (가계부 연동)</h3>' + barsChart(groups, ['var(--c1)'], { labels: true, h: 150 }) + '</div><div class="card"><h3>최근 투자 거래</h3>' + (recent.length ? '<div class="list">' + recent.map(x => txRow(x, { date: true })).join('') + '</div>' : '<div class="hint">거래 등록 시 유형을 "투자"로 고르거나, 증권사 출금 문자를 넣으면 이곳에 모여요.</div>') + '</div></div>';
    return h;
  }

  // ---------- 렌더 ----------
  const TABS = [['home', '홈', 'home'], ['tx', '거래', 'list'], ['stats', '통계', 'pie'], ['report', '결산', 'doc'], ['invest', '투자', 'trend']];
  function render() {
    const v = $('#view'); if (!v) return;
    const keep = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.bind;
    const caret = keep && document.activeElement.selectionStart;
    v.innerHTML = ({ home: viewHome, tx: viewTx, stats: viewStats, report: viewReport, invest: viewInvest })[st.tab]();
    $('#nav').innerHTML = TABS.map(t => '<button class="' + (st.tab === t[0] ? 'on' : '') + '" data-a="tab" data-tab="' + t[0] + '">' + t[1] + '</button>').join('');
    $('#tabbar').innerHTML = TABS.map(t => '<button class="' + (st.tab === t[0] ? 'on' : '') + '" data-a="tab" data-tab="' + t[0] + '">' + icon(t[2]) + t[1] + '</button>').join('');
    const sy = $('#sync'); sy.className = 'sync ' + S.status.state; sy.innerHTML = '<i></i><span>' + (S.status.state === 'ok' ? '동기화됨' : S.status.state === 'syncing' ? '동기화 중' : S.status.state === 'error' ? '동기화 오류' : '이 기기에만 저장') + '</span>';
    if (keep) { const el = v.querySelector('[data-bind="' + keep + '"]'); if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch (e) { } } }
  }

  // ---------- 토스트 ----------
  function toast(msg, actionLabel, fn, ms) {
    const box = $('#toasts'), el = document.createElement('div'); el.className = 'toast';
    el.innerHTML = '<span>' + msg + '</span>' + (actionLabel ? '<button>' + actionLabel + '</button>' : '');
    if (actionLabel) el.querySelector('button').onclick = () => { fn(); el.remove(); };
    box.appendChild(el); setTimeout(() => el.remove(), ms || 6000);
  }

  // ---------- 등록 로직 ----------
  function isDup(item) {
    const t0 = new Date(item.occurred_at).getTime();
    return txs().some(x => x.amount === item.amount && x.type === item.type && Math.abs(new Date(x.occurred_at).getTime() - t0) <= 120000 && (x.merchant === item.merchant || (x.raw_text && item.raw_text && x.raw_text === item.raw_text)));
  }
  function registerItems(items, quiet) {
    const added = []; let dup = 0;
    for (const it of items) { if (isDup(it)) { dup++; continue; } added.push(S.addTx(it)); }
    if (added.length) {
      const ym = ymOf(added[0].occurred_at); if (ym !== st.ym) st.ym = ym;
      const f = added[0], rev = added.filter(x => x.needs_review).length;
      if (!quiet) toast((added.length === 1 ? esc(f.merchant) + ' ' + (f.type === 'income' ? '+' : '-') + won(f.amount) + ' · ' + esc(f.category) + ' 등록' : added.length + '건 등록 (' + esc(f.merchant) + ' 외)') + (rev ? ' · 확인 필요 ' + rev + '건' : ''), '실행 취소', () => added.forEach(x => S.removeTx(x.id)));
    }
    if (dup && !quiet) toast('이미 등록된 ' + dup + '건은 건너뛰었어요');
    return { added, dup };
  }
  function processText(text, source) {
    const r = P.parseMessages(text, { rules: S.data.rules, source });
    if (!r.items.length) return { ok: false, skipped: r.skipped };
    registerItems(r.items); return { ok: true, n: r.items.length };
  }

  // ---------- 시트 ----------
  function openSheet(s) { if (s.kind === 'add' && !s.draft) s.draft = newDraft(); sh = s; renderSheet(); try { history.pushState({ sheet: 1 }, ''); } catch (e) { } }
  function closeSheet() { if (history.state && history.state.sheet) history.back(); else doClose(); }
  function doClose() { sh = null; $('#overlay').innerHTML = ''; }
  window.addEventListener('popstate', () => { if (sh) doClose(); });
  const catOptions = (type, sel) => P.CATS[type].map(c => '<option' + (c === sel ? ' selected' : '') + '>' + c + '</option>').join('');

  function txFormHtml(d, editing) {
    return '<div class="field"><label>유형</label><div class="seg" style="align-self:flex-start">' + Object.keys(TYPES).map(k => '<button class="' + (d.type === k ? 'on' : '') + '" data-a="f-type" data-v="' + k + '">' + TYPES[k] + '</button>').join('') + '</div></div>'
      + '<div class="row2"><div class="field"><label>금액</label><input id="f-amount" inputmode="numeric" placeholder="0" value="' + (d.amount ? Number(d.amount).toLocaleString('ko-KR') : '') + '"></div><div class="field"><label>일시</label><input id="f-date" type="datetime-local" value="' + toLocalInput(d.occurred_at) + '"></div></div>'
      + '<div class="field"><label>가맹점 / 내용</label><input id="f-merchant" list="merchants" autocomplete="off" placeholder="예: 스타벅스" value="' + esc(d.merchant) + '"><datalist id="merchants">' + [...new Set(txs().slice(-300).map(t => t.merchant))].slice(-60).map(m => '<option value="' + esc(m) + '">').join('') + '</datalist></div>'
      + '<div class="row2"><div class="field"><label>카테고리</label><select id="f-cat">' + catOptions(d.type, d.category) + '</select></div><div class="field"><label>결제수단 / 계좌</label><input id="f-account" placeholder="예: 신한카드" value="' + esc(d.account) + '"></div></div>'
      + '<div class="field"><label>메모</label><input id="f-memo" value="' + esc(d.memo) + '"></div>'
      + (d.type !== 'income' || true ? '<div class="field" id="rulebox"><label style="display:flex;gap:6px;align-items:center;font-weight:500"><input type="checkbox" id="f-rule" style="width:auto"' + (editing ? ' checked' : '') + '> 이 가맹점은 앞으로 이 카테고리로 자동 분류</label><input id="f-rulekw" placeholder="인식할 키워드 (예: 스타벅스)" value="' + esc(ruleKeyword(d.merchant)) + '"></div>' : '');
  }
  const ruleKeyword = m => { const w = String(m || '').replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] || ''; return w.length >= 2 && !/미확인/.test(w) ? w : ''; };
  function readForm(d) {
    const g = id => { const e = $('#' + id); return e ? e.value : undefined; };
    if (g('f-amount') !== undefined) d.amount = parseInt(String(g('f-amount')).replace(/[^\d]/g, ''), 10) || 0;
    if (g('f-date')) d.occurred_at = fromLocalInput(g('f-date'));
    if (g('f-merchant') !== undefined) d.merchant = g('f-merchant').trim();
    if (g('f-cat')) d.category = g('f-cat');
    if (g('f-account') !== undefined) d.account = g('f-account').trim();
    if (g('f-memo') !== undefined) d.memo = g('f-memo').trim();
    return d;
  }
  function saveRuleFromForm(d, origCat) {
    const chk = $('#f-rule'), kw = $('#f-rulekw') && $('#f-rulekw').value.trim();
    if (chk && chk.checked && kw && (origCat == null || origCat !== d.category) && d.category !== '기타' && d.category !== '기타수입') S.addRule(kw, d.category, d.type);
  }

  function renderSheet() {
    if (!sh) return;
    let body = '', title = '', wide = false;
    if (sh.kind === 'add') {
      title = '빠른 입력';
      body += '<div class="seg" style="margin-bottom:12px;width:100%">' + [['text', '문자·알림'], ['receipt', '영수증 사진'], ['manual', '직접 입력']].map(x => '<button style="flex:1" class="' + (sh.mode === x[0] ? 'on' : '') + '" data-a="mode" data-v="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>';
      if (sh.mode === 'text') body += '<div class="field"><label>결제 문자, 카드 앱 알림, 입금 문자를 그대로 붙여넣으세요 (여러 건 가능)</label><textarea id="paste" placeholder="[Web발신]\n신한카드(1234)승인 홍길동 5,800원 일시불 11/18 12:30 스타벅스">' + esc(sh.text || '') + '</textarea></div><div id="perr" class="small dn" style="min-height:18px"></div><div class="rowflex"><button class="btn pri" data-a="parse" style="flex:1">분석해서 자동 등록</button><button class="btn" data-a="example">예시</button></div><p class="hint">금액, 가맹점, 날짜, 카드, 카테고리를 인식해서 바로 등록해요. 확신이 낮은 건은 "확인 필요"로 표시돼요.</p>';
      else if (sh.mode === 'receipt') {
        const r = sh.receipt;
        body += '<label class="drop" id="drop" style="display:block;cursor:pointer">' + (r && r.url ? '<img src="' + r.url + '" alt="영수증">' : '') + '<div>' + (r && r.url ? '다른 사진 선택' : '영수증 사진을 끌어놓거나 눌러서 촬영·선택') + '<div class="tiny" style="margin-top:4px">Ctrl+V 로 붙여넣기도 돼요</div></div><input type="file" id="file" accept="image/*" hidden></label>';
        if (r && r.busy) body += '<div class="progress"><i style="width:' + Math.round((r.progress || 0) * 100) + '%"></i></div><div class="small muted" id="ocrmsg">' + esc(r.msg || '글자 인식 중...') + '</div>';
        if (r && r.error) body += '<div class="small dn" style="margin-top:8px">' + esc(r.error) + '</div>';
        if (r && r.draft) {
          body += '<div style="margin-top:12px"><div class="hint" style="margin-bottom:8px">인식한 내용이에요. 틀린 곳이 있으면 고친 뒤 등록하세요.</div>' + txFormHtml(r.draft, false) + '<button class="btn pri block" data-a="receipt-save">등록</button><details><summary>인식된 원문 보기</summary><pre class="raw">' + esc(r.text) + '</pre></details></div>';
        }
      } else body += txFormHtml(sh.draft, false) + '<button class="btn pri block" data-a="manual-save">등록</button>';
    } else if (sh.kind === 'edit') {
      title = '거래 수정';
      body += txFormHtml(sh.draft, true) + '<div class="rowflex"><button class="btn pri" style="flex:1" data-a="edit-save">저장</button><button class="btn danger" data-a="edit-del">삭제</button></div>' + (sh.draft.raw_text ? '<details><summary>원본 문자·인식 텍스트</summary><pre class="raw">' + esc(sh.draft.raw_text) + '</pre></details>' : '');
    } else if (sh.kind === 'holding') {
      title = sh.draft.id ? '종목 수정' : '종목 추가';
      const d = sh.draft;
      body += '<div class="row2"><div class="field"><label>티커 / 종목코드</label><input id="h-ticker" placeholder="VOO" value="' + esc(d.ticker) + '"></div><div class="field"><label>종목명</label><input id="h-name" placeholder="뱅가드 S&P500" value="' + esc(d.name) + '"></div></div><div class="row2"><div class="field"><label>통화</label><select id="h-cur"><option' + (d.currency === 'KRW' ? ' selected' : '') + '>KRW</option><option' + (d.currency === 'USD' ? ' selected' : '') + '>USD</option></select></div><div class="field"><label>수량</label><input id="h-qty" inputmode="decimal" value="' + (d.qty || '') + '"></div></div><div class="row2"><div class="field"><label>평균 매수단가</label><input id="h-avg" inputmode="decimal" value="' + (d.avg_price || '') + '"></div><div class="field"><label>현재가</label><input id="h-cur-price" inputmode="decimal" value="' + (d.cur_price || '') + '"></div></div><div class="field"><label>메모</label><input id="h-memo" value="' + esc(d.memo) + '"></div><div class="rowflex"><button class="btn pri" style="flex:1" data-a="holding-save">저장</button>' + (d.id ? '<button class="btn danger" data-a="holding-del">삭제</button>' : '') + '</div>';
    } else if (sh.kind === 'settings') { title = '설정'; body = settingsHtml(); wide = true; }
    $('#overlay').innerHTML = '<div class="overlay" data-a="bg"><div class="sheet' + (wide ? ' wide' : '') + '" role="dialog" aria-label="' + title + '"><div class="grab"></div><div class="head"><h2>' + title + '</h2><button class="iconbtn" data-a="close" aria-label="닫기">' + icon('x') + '</button></div>' + body + '</div></div>';
    const fa = $('#f-amount'); if (fa) fa.addEventListener('input', () => { const n = parseInt(fa.value.replace(/[^\d]/g, ''), 10); fa.value = n ? n.toLocaleString('ko-KR') : ''; });
    const fm = $('#f-merchant'); if (fm) fm.addEventListener('change', () => autoCategory());
    const fi = $('#file'); if (fi) fi.addEventListener('change', () => { if (fi.files[0]) handleImage(fi.files[0]); });
    const dr = $('#drop'); if (dr) { ['dragover', 'dragenter'].forEach(ev => dr.addEventListener(ev, e => { e.preventDefault(); dr.classList.add('over'); })); ['dragleave', 'drop'].forEach(ev => dr.addEventListener(ev, e => { e.preventDefault(); dr.classList.remove('over'); })); dr.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) handleImage(f); }); }
  }
  function currentDraft() { return sh.kind === 'add' ? (sh.mode === 'receipt' ? sh.receipt && sh.receipt.draft : sh.draft) : sh.draft; }
  function autoCategory() {
    const d = currentDraft(); if (!d) return; readForm(d);
    const kw = ruleKeyword(d.merchant); const k = $('#f-rulekw'); if (k && !k.dataset.touched) k.value = kw;
    if (!d.merchant) return;
    const r = P.categorize(d.merchant, d.type, S.data.rules);
    if (r.type === d.type && r.category && !(r.category === '기타')) { d.category = r.category; const sel = $('#f-cat'); if (sel) sel.value = r.category; }
  }
  const newDraft = () => ({ type: 'expense', amount: 0, occurred_at: new Date().toISOString(), merchant: '', category: '기타', account: '', memo: '', source: 'manual', needs_review: false });

  function settingsHtml() {
    const u = S.user, th = S.data.settings.theme || 'auto';
    const ex = P.CATS.expense.filter(c => c !== '기타').concat(['기타']);
    return '<div class="settings-sec"><h4>계정 · 동기화</h4>' + (u ? '<div class="small">로그인: <b>' + esc(u.email) + '</b></div><div class="rowflex" style="margin-top:8px"><button class="btn sm" data-a="sync">지금 동기화</button><button class="btn sm" data-a="logout">로그아웃</button></div><div class="hint" style="margin-top:6px">' + esc(S.status.msg) + '</div>' : '<div class="hint" style="margin-bottom:8px">로그인하면 PC·휴대폰 어디서든 같은 기록을 보고, 크롬 확장 프로그램에서 보낸 내용도 한곳에 모여요. 이메일로 받은 링크를 누르면 로그인돼요(비밀번호 없음). 로그인 전 기록은 처음 로그인할 때 계정으로 올라가요.</div><div class="rowflex"><input id="login-email" type="email" placeholder="이메일" value="cjever24h@naver.com" style="flex:1;min-width:180px;background:var(--surface2);border:1px solid var(--line);border-radius:10px;padding:9px 12px"><button class="btn pri" data-a="login">로그인 링크 받기</button></div><div id="login-msg" class="small" style="margin-top:6px"></div>') + '</div>'
      + '<div class="settings-sec"><h4>화면</h4><div class="seg">' + [['auto', '자동'], ['dark', '다크'], ['light', '라이트']].map(x => '<button class="' + (th === x[0] ? 'on' : '') + '" data-a="theme" data-v="' + x[0] + '">' + x[1] + '</button>').join('') + '</div></div>'
      + '<div class="settings-sec"><h4>월 예산 (카테고리별, 원)</h4>' + ex.map(c => '<div class="budrow"><span class="small">' + c + '</span><input inputmode="numeric" data-bud="' + c + '" placeholder="미설정" value="' + (S.data.budgets[c] ? S.data.budgets[c].toLocaleString('ko-KR') : '') + '"></div>').join('') + '</div>'
      + '<div class="settings-sec"><h4>자동 분류 규칙 (내가 가르친 것)</h4>' + (S.data.rules.length ? S.data.rules.map(r => '<div class="rulerow"><span>' + esc(r.keyword) + ' → <b>' + esc(r.category) + '</b></span><button class="btn sm" data-a="rule-del" data-k="' + esc(r.keyword) + '">삭제</button></div>').join('') : '<div class="hint">거래를 수정해서 카테고리를 바꾸면 이곳에 규칙이 쌓여요.</div>') + '</div>'
      + '<div class="settings-sec"><h4>자동 입력 연결</h4><ul class="hint" style="padding-left:18px;margin:0"><li><b>크롬 확장 프로그램</b>: 웹페이지에서 결제 내역을 드래그 후 우클릭 → "가계부에 보내기". 영수증 이미지는 이미지 우클릭으로 보내요. <a href="ledger-extension.zip" download>확장 프로그램 받기 (zip)</a> → 압축을 풀고 chrome://extensions 에서 개발자 모드 → "압축해제된 확장 프로그램 로드".</li><li><b>휴대폰</b>: 홈 화면에 앱을 설치하면(공유 → 홈 화면에 추가) 문자·알림을 복사해 "문자·알림" 탭에 붙여넣거나, 안드로이드에서는 공유 메뉴로 바로 보낼 수 있어요.</li></ul>' + (deferredInstall ? '<div style="margin-top:8px"><button class="btn sm" data-a="install">앱 설치</button></div>' : '') + '</div>'
      + '<div class="settings-sec"><h4>데이터</h4><div class="rowflex"><button class="btn sm" data-a="export-json">백업(JSON)</button><button class="btn sm" data-a="export-csv">CSV 내보내기</button><label class="btn sm">백업 불러오기<input type="file" id="imp" accept=".json,application/json" hidden></label><button class="btn sm" data-a="sample">예시 데이터 넣기</button><button class="btn sm" data-a="sample-clear">예시 데이터 지우기</button><button class="btn sm danger" data-a="clear">전체 삭제</button></div></div>';
  }
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; });

  // ---------- OCR ----------
  function loadScript(src) { return new Promise((res, rej) => { if (document.querySelector('script[src="' + src + '"]')) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('불러오기 실패')); document.head.appendChild(s); }); }
  async function prepImage(file) {
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const max = 1900, sc = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
    const id = x.getImageData(0, 0, c.width, c.height), p = id.data;
    for (let i = 0; i < p.length; i += 4) { let g = (p[i] * .3 + p[i + 1] * .59 + p[i + 2] * .11); g = Math.max(0, Math.min(255, (g - 128) * 1.35 + 128)); p[i] = p[i + 1] = p[i + 2] = g; }
    x.putImageData(id, 0, 0);
    return { url, canvas: c };
  }
  async function handleImage(file) {
    if (!sh || sh.kind !== 'add') openSheet({ kind: 'add', mode: 'receipt' });
    sh.mode = 'receipt';
    const r = sh.receipt = { busy: true, progress: 0.02, msg: '이미지 준비 중...' };
    try {
      const prep = await prepImage(file); r.url = prep.url; renderSheet();
      r.msg = '인식 엔진 불러오는 중... (처음 한 번만 오래 걸려요)'; updateProgress(r);
      await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
      const worker = await Tesseract.createWorker('kor+eng', 1, { logger: m => { if (m.status) { r.msg = ({ 'loading tesseract core': '엔진 준비 중...', 'loading language traineddata': '한글 데이터 내려받는 중...', 'initializing api': '준비 중...', 'recognizing text': '글자 인식 중...' })[m.status] || m.status; r.progress = Math.max(r.progress, (m.progress || 0) * 0.9 + 0.05); updateProgress(r); } } });
      const { data } = await worker.recognize(prep.canvas);
      await worker.terminate();
      r.text = data.text || ''; r.busy = false;
      if (!sh) return;
      const draft = P.parseReceipt(r.text, { rules: S.data.rules });
      r.draft = draft;
      if (!r.text.trim()) r.error = '글자를 인식하지 못했어요. 더 밝고 선명한 사진으로 다시 시도하거나 직접 입력해 주세요.';
    } catch (e) {
      console.error(e); r.busy = false; r.error = '이미지 인식에 실패했어요: ' + (e.message || e) + ' (인터넷 연결을 확인하거나 직접 입력해 주세요)';
      r.draft = Object.assign(newDraft(), { source: 'receipt', needs_review: true });
    }
    if (sh) renderSheet();
  }
  function updateProgress(r) { const p = $('.progress i'), m = $('#ocrmsg'); if (p) p.style.width = Math.round(r.progress * 100) + '%'; if (m) m.textContent = r.msg; }

  // ---------- 이벤트 ----------
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-a]'); if (!el) return;
    const a = el.dataset.a;
    if (a === 'bg') { if (e.target === el) closeSheet(); return; }
    switch (a) {
      case 'tab': st.tab = el.dataset.tab; st.f.day = null; render(); window.scrollTo(0, 0); break;
      case 'prev': case 'next': { const d = a === 'prev' ? -1 : 1; const yr = (st.tab === 'stats' && st.stat === 'year') || (st.tab === 'report' && st.rep === 'year'); if (yr) st.year += d; else { st.ym = shiftYm(st.ym, d); st.f.day = null; } render(); break; }
      case 'txview': st.f.view = el.dataset.v; render(); break;
      case 'statkind': st.stat = el.dataset.v; render(); break;
      case 'repkind': st.rep = el.dataset.v; render(); break;
      case 'calday': st.f.day = el.dataset.day || null; render(); break;
      case 'more': st.f.limit += 120; render(); break;
      case 'catgo': st.tab = 'tx'; st.f.cat = el.dataset.cat; st.f.type = 'all'; st.f.view = 'list'; if (st.stat === 'year') { /* 연 통계는 현재 월 기준으로 이동 */ } render(); window.scrollTo(0, 0); break;
      case 'print': window.print(); break;
      case 'open-add': openSheet({ kind: 'add', mode: el.dataset.mode || 'text', draft: newDraft() }); break;
      case 'close': closeSheet(); break;
      case 'mode': { if (sh.mode === 'text') sh.text = ($('#paste') || {}).value; else if (sh.mode === 'manual') readForm(sh.draft); sh.mode = el.dataset.v; renderSheet(); break; }
      case 'example': { const ta = $('#paste'); ta.value = '[Web발신]\n신한카드(1234)승인 홍길동 5,800원 일시불 ' + pad(new Date().getMonth() + 1) + '/' + pad(new Date().getDate()) + ' 12:30 스타벅스 강남R점\n\n[Web발신]\n[KB국민카드] ' + pad(new Date().getMonth() + 1) + '/' + pad(new Date().getDate()) + ' 19:02 32,900원 쿠팡 승인(일시불)'; break; }
      case 'parse': { const text = ($('#paste') || {}).value || ''; const r = processText(text, 'sms'); if (r.ok) closeSheet(); else { sh.text = text; $('#perr').textContent = text.trim() ? '금액(예: 5,800원)을 찾지 못했어요. 문자 전체를 복사했는지 확인하거나 직접 입력 탭을 이용해 주세요.' : '붙여넣을 내용을 입력해 주세요.'; } break; }
      case 'f-type': { const d = currentDraft(); readForm(d); d.type = el.dataset.v; d.category = P.CATS[d.type].includes(d.category) ? d.category : P.CATS[d.type][P.CATS[d.type].length - 1]; renderSheet(); break; }
      case 'manual-save': { const d = readForm(sh.draft); if (!d.amount) { toast('금액을 입력해 주세요'); break; } if (!d.merchant) d.merchant = d.category; saveRuleFromForm(d, null); registerItems([Object.assign({}, d)]); closeSheet(); break; }
      case 'receipt-save': { const d = readForm(sh.receipt.draft); if (!d.amount) { toast('금액을 입력해 주세요'); break; } d.needs_review = false; saveRuleFromForm(d, null); registerItems([Object.assign({}, d)]); closeSheet(); break; }
      case 'tx-open': { const t = txs().find(x => x.id === el.dataset.id); if (t) openSheet({ kind: 'edit', id: t.id, draft: Object.assign({}, t), orig: t.category }); break; }
      case 'tx-ok': e.stopPropagation(); S.updateTx(el.dataset.id, { needs_review: false }); break;
      case 'edit-save': { const d = readForm(sh.draft); if (!d.amount) { toast('금액을 입력해 주세요'); break; } saveRuleFromForm(d, sh.orig); S.updateTx(sh.id, { type: d.type, amount: d.amount, occurred_at: d.occurred_at, merchant: d.merchant, category: d.category, account: d.account, memo: d.memo, needs_review: false }); closeSheet(); toast('저장했어요'); break; }
      case 'edit-del': { const row = S.removeTx(sh.id); closeSheet(); if (row) toast('삭제했어요', '되돌리기', () => S.restoreTx(row)); break; }
      case 'holding-open': { const h = S.data.holdings.find(x => x.id === el.dataset.id); openSheet({ kind: 'holding', draft: h ? Object.assign({}, h) : { ticker: '', name: '', currency: 'KRW', qty: '', avg_price: '', cur_price: '', memo: '' } }); break; }
      case 'holding-save': { const g = id => $('#' + id).value.trim(); const d = Object.assign(sh.draft, { ticker: g('h-ticker').toUpperCase(), name: g('h-name'), currency: g('h-cur'), qty: g('h-qty'), avg_price: g('h-avg'), cur_price: g('h-cur-price'), memo: g('h-memo') }); if (!d.ticker) { toast('티커를 입력해 주세요'); break; } S.saveHolding(d); closeSheet(); break; }
      case 'holding-del': { if (confirm('이 종목을 삭제할까요?')) { S.removeHolding(sh.draft.id); closeSheet(); } break; }
      case 'settings': if (sh) { sh = { kind: 'settings' }; renderSheet(); } else openSheet({ kind: 'settings' }); break;
      case 'theme': S.setSetting('theme', el.dataset.v); applyTheme(); renderSheet(); break;
      case 'login': { const em = $('#login-email').value.trim(), msg = $('#login-msg'); if (!em) { msg.textContent = '이메일을 입력해 주세요'; break; } msg.textContent = '보내는 중...'; try { await S.signIn(em); msg.className = 'small up'; msg.textContent = em + ' 로 로그인 링크를 보냈어요. 메일의 링크를 이 기기에서 열어 주세요.'; } catch (err) { msg.className = 'small dn'; msg.textContent = '실패: ' + (err.message || err); } break; }
      case 'logout': await S.signOut(); renderSheet(); break;
      case 'sync': { const ok = await S.fullSync(); toast(ok ? '동기화했어요' : '동기화에 실패했어요'); if (sh && sh.kind === 'settings') renderSheet(); break; }
      case 'rule-del': S.removeRule(el.dataset.k); renderSheet(); break;
      case 'export-json': download('ledger-backup-' + dayOf(new Date().toISOString()) + '.json', S.exportJson(), 'application/json'); break;
      case 'export-csv': { const rows = [['날짜', '유형', '금액', '가맹점', '카테고리', '결제수단', '메모', '출처']].concat(txs().slice().sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)).map(t => [toLocalInput(t.occurred_at).replace('T', ' '), TYPES[t.type], t.amount, t.merchant, t.category, t.account, t.memo, SRC[t.source] || t.source])); download('ledger-' + dayOf(new Date().toISOString()) + '.csv', '\ufeff' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n'), 'text/csv'); break; }
      case 'sample': loadSample(); if (sh) closeSheet(); break;
      case 'sample-clear': { txs().filter(t => t.source === 'sample').forEach(t => S.removeTx(t.id)); toast('예시 데이터를 지웠어요'); break; }
      case 'clear': if (confirm('모든 거래·예산·규칙·종목을 삭제할까요? (로그인 상태면 계정 데이터도 삭제돼요)')) { S.clearAll(); toast('전체 삭제했어요'); closeSheet(); } break;
      case 'install': if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; } break;
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && sh) closeSheet();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.tx[role=button]')) { e.preventDefault(); e.target.click(); }
  });
  document.addEventListener('input', e => {
    const b = e.target.dataset && e.target.dataset.bind;
    if (b && e.isComposing) return;
    if (b) { if (b === 'usdkrw') { S.setSetting('usdkrw', parseInt(e.target.value.replace(/[^\d]/g, ''), 10) || 1400); render(); return; } st.f[b] = e.target.value; st.f.limit = 120; render(); }
    if (e.target.id === 'f-rulekw') e.target.dataset.touched = '1';
    if (e.target.dataset && e.target.dataset.bud != null) { const n = parseInt(e.target.value.replace(/[^\d]/g, ''), 10) || 0; e.target.value = n ? n.toLocaleString('ko-KR') : ''; clearTimeout(e.target._t); e.target._t = setTimeout(() => S.setBudget(e.target.dataset.bud, n), 500); }
  });
  document.addEventListener('compositionend', e => { const b = e.target.dataset && e.target.dataset.bind; if (b === 'q') { st.f.q = e.target.value; st.f.limit = 120; render(); } });
  document.addEventListener('change', e => {
    if (e.target.id === 'imp' && e.target.files[0]) { const f = e.target.files[0]; f.text().then(t => { try { const n = S.importJson(t); toast(n + '건을 불러왔어요'); } catch (err) { toast('불러오기 실패: ' + err.message); } }); }
    const b = e.target.dataset && e.target.dataset.bind; if (b && e.target.tagName === 'SELECT') { st.f[b] = e.target.value; render(); }
  });
  document.addEventListener('paste', e => {
    const items = (e.clipboardData && e.clipboardData.files) || [];
    for (const f of items) if (f.type.startsWith('image/')) { e.preventDefault(); handleImage(f); return; }
  });
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

  // ---------- 예시 데이터 ----------
  function loadSample() {
    const now = new Date(), rnd = (a, b) => Math.round((a + Math.random() * (b - a)) / 100) * 100;
    const defs = [['스타벅스 강남R점', '카페·간식', 4500, 6500, 'expense'], ['배달의민족', '식비', 14000, 26000, 'expense'], ['GS25 역삼점', '식비', 2500, 9000, 'expense'], ['티머니 지하철', '교통', 1450, 2900, 'expense'], ['카카오T 택시', '교통', 6000, 16000, 'expense'], ['쿠팡', '쇼핑', 12000, 48000, 'expense'], ['올리브영', '쇼핑', 9000, 35000, 'expense'], ['교보문고', '교육·도서', 14000, 28000, 'expense'], ['넷플릭스', '문화·여가', 17000, 17000, 'expense'], ['이마트', '식비', 25000, 80000, 'expense'], ['약국', '의료·운동', 3000, 12000, 'expense'], ['런닝화 스포츠', '의료·운동', 50000, 90000, 'expense']];
    let n = 0;
    for (let mo = 0; mo < 3; mo++) {
      const base = new Date(now.getFullYear(), now.getMonth() - mo, 1), dim = mo === 0 ? now.getDate() : daysIn(ymOf(base.toISOString()));
      const mk = (day, h, merchant, cat, amount, type, src) => { const d = new Date(base.getFullYear(), base.getMonth(), Math.min(day, dim), h, (n * 7) % 60); if (d > now) return; S.addTx({ occurred_at: d.toISOString(), type, amount, merchant, category: cat, account: type === 'expense' ? (n % 2 ? '신한카드(1234)' : '국민카드(5678)') : '', source: src || 'sample', raw_text: null, needs_review: false }); n++; };
      mk(25, 9, '(주)더원 급여', '급여', 3200000, 'income'); mk(3, 10, '관리비', '주거·통신', 185000, 'expense'); mk(5, 10, 'SKT 통신요금', '주거·통신', 62000, 'expense'); mk(10, 12, '토스증권 ETF 적립', '주식·ETF', 500000, 'invest'); mk(15, 12, '연금저축 납입', '연금·적금', 300000, 'invest');
      for (let d = 1; d <= dim; d++) { const c = 1 + Math.floor(Math.random() * 2); for (let k = 0; k < c; k++) { if (Math.random() < .35) continue; const x = defs[Math.floor(Math.random() * defs.length)]; mk(d, 8 + Math.floor(Math.random() * 13), x[0], x[1], rnd(x[2], x[3]), x[4], Math.random() < .5 ? 'sms' : 'sample'); } }
    }
    S.addTx({ occurred_at: new Date().toISOString(), type: 'expense', amount: 7300, merchant: '(가맹점 미확인)', category: '기타', account: '', source: 'sms', needs_review: true, raw_text: '예시: 가맹점을 인식하지 못한 문자' });
    if (!S.data.holdings.length) { S.saveHolding({ ticker: 'VOO', name: 'Vanguard S&P 500 ETF', currency: 'USD', qty: 6, avg_price: 480, cur_price: 520 }); S.saveHolding({ ticker: '069500', name: 'KODEX 200', currency: 'KRW', qty: 40, avg_price: 34000, cur_price: 36200 }); }
    toast('예시 데이터를 넣었어요');
  }

  // ---------- 테마 ----------
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  function applyTheme() { const t = S.data.settings.theme || 'auto'; const eff = t === 'auto' ? (mq.matches ? 'light' : 'dark') : t; document.documentElement.dataset.theme = eff; const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = eff === 'dark' ? '#0a0f1c' : '#f2f5fa'; }
  mq.addEventListener && mq.addEventListener('change', applyTheme);

  // ---------- 외부 입력 (확장 프로그램 / 공유) ----------
  window.addEventListener('message', async e => {
    if (e.source !== window || !e.data || e.data.type !== 'ledger-ext') return;
    const d = e.data;
    if (d.text) { const r = processText(d.text, 'extension'); if (!r.ok) openSheet({ kind: 'add', mode: 'text', text: d.text, draft: newDraft() }); }
    if (d.image) { try { const blob = await (await fetch(d.image)).blob(); handleImage(new File([blob], 'receipt.png', { type: blob.type || 'image/png' })); } catch (err) { toast('이미지를 불러오지 못했어요'); } }
  });
  function readShared() {
    const p = new URLSearchParams(location.search); const text = [p.get('title'), p.get('text')].filter(Boolean).join('\n');
    if (text) { history.replaceState(null, '', location.pathname); const r = processText(text, 'share'); if (!r.ok) openSheet({ kind: 'add', mode: 'text', text, draft: newDraft() }); }
  }

  // ---------- 시작 ----------
  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(); render(); readShared();
    S.init().then(() => render());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) S.maybePull(); });
    $('#sync').addEventListener('click', () => { openSheet({ kind: 'settings' }); });
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
    window.__ledger = { st, S, P };
  });
})();
