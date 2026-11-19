'use strict';
/* 找货大师 v3 · 原生统一结果视图（window.ww 由 preload 注入） */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let P = [], data = { history: [], favorites: [] }, settings = {}, UA = {};
let mode = 'text', cat = 'all', view = 'card', imageFile = null, loginMap = {};
let selected = new Set();
const results = new Map();        // platformId -> { status, items, url, ms, cached, msg }
const cache = new Map();          // key -> { t, r }
const compare = new Map();        // key -> item
let seq = 0, lastQuery = '', searchStart = 0;
const HOT = ['保温杯', '蓝牙耳机', '连衣裙', '手机壳', '收纳盒', '儿童玩具', '义乌小商品', '数据线'];

/* ---------- 基础 ---------- */
const enabled = () => P.filter(p => p.enabled !== false);
const CATS = { general: '综合', content: '内容', vertical: '垂直', local: '本地', secondhand: '二手', crossborder: '跨境', wholesale: '批发', retail: '综合' };
const catOf = p => (!p.category || p.category === 'retail') ? 'general' : p.category;
let ind = '';
const inCat = p => (cat === 'all' || catOf(p) === cat) && (cat !== 'wholesale' || !ind || p.industry === ind);
const byId = id => P.find(p => p.id === id);
const isMobile = p => (p.accessMode === 'mobile' || p.accessMode === 'desktop' ? p.accessMode : (settings.accessMode || 'mobile')) === 'mobile';
const homeOf = p => isMobile(p) && p.mobileHome || p.home;
const loginOf = p => isMobile(p) && p.mobileLogin || p.login || homeOf(p);
const tplOf = p => isMobile(p) && p.mobileSearch || p.search;
const fill = (tpl, q) => tpl.replace(/\{q(?::(\w+))?\}/g, (_, enc) => ww.encode(q, enc || 'utf8'));
let belts = [], belt = null; fetch('belts.json').then(r => r.json()).then(j => { belts = j; }).catch(() => {});
const BELT_B2B = ['1688', 'aicaigou', 'gongchang', 'mic', 'hc360'];
const beltCity = b => b.kw || '';
const beltQ = (p, q) => belt && beltCity(belt) && !belt.sites.includes(p.id) && q && !q.startsWith(beltCity(belt)) ? beltCity(belt) + ' ' + q : q;
const searchUrl = (p, q) => tplOf(p) ? fill(tplOf(p), beltQ(p, q)) : null;
const uaOf = p => isMobile(p) ? UA.mobile : UA.desktop;
const partOf = p => 'persist:' + (p.partition || p.id);
const itemKey = it => it.platform + '|' + (it.link || it.title);
const money = v => v == null ? '面议' : '¥' + fmtPrice(v);
const fmtPrice = n => n == null ? '—' : (n >= 10000 ? (n / 10000).toFixed(2) + '万' : (Math.round(n * 100) / 100).toString());
const saveSettings = () => ww.setSettings(settings);
const saveData = () => ww.setData(data);
function toast(msg, type = 'info', ms = 2600) {
  const icons = { success: 'ri-checkbox-circle-fill', error: 'ri-error-warning-fill', info: 'ri-information-fill', warn: 'ri-alert-fill' };
  const t = document.createElement('div'); t.className = 'toast ' + type;
  t.innerHTML = `<i class="${icons[type]}"></i><span>${esc(msg)}</span>`;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 220); }, ms);
}
const status = t => { $('#statusText').textContent = t; };
function avatar(p, cls = 'avatar') {
  if (!p) return '';
  if (p.logo) return `<span class="${cls} logo"><img src="${esc(p.logo)}" alt="" draggable="false"></span>`;
  return `<span class="${cls}" style="background:${esc(p.color || '#888')}">${esc((p.name || '?').slice(0, 1))}</span>`;
}
document.addEventListener('error', e => { // 图标加载失败 → 文字色块
  const img = e.target; if (img.tagName !== 'IMG') return;
  const box = img.closest('.avatar.logo'); if (box) { box.classList.remove('logo'); box.style.background = '#8f959e'; img.replaceWith(document.createTextNode('·')); return; }
  if (img.closest('.thumb')) img.replaceWith(Object.assign(document.createElement('div'), { className: 'noimg', innerHTML: '<i class="ri-image-line"></i>' }));
}, true);
document.addEventListener('mouseover', e => {
  const el = e.target.closest('[data-tip]'); const tt = $('#tooltip');
  if (!el) { tt.hidden = true; return; }
  tt.textContent = el.dataset.tip; tt.hidden = false;
  const r = el.getBoundingClientRect(); const w = tt.offsetWidth;
  tt.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
  tt.style.top = (r.bottom + 6 + 28 > innerHeight ? r.top - 30 : r.bottom + 6) + 'px';
});
document.addEventListener('mousedown', () => { $('#tooltip').hidden = true; });

/* ---------- 主题 ---------- */
function applyTheme() {
  const t = settings.theme || 'light';
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.body.classList.toggle('dark', dark); document.body.classList.toggle('light', !dark);
  $('#btnTheme i').className = dark ? 'ri-sun-line' : 'ri-moon-line';
  $$('#themeSeg button').forEach(b => b.classList.toggle('active', b.dataset.theme === t));
}
function setTheme(t) { settings.theme = t; applyTheme(); saveSettings(); }

/* ---------- 侧栏 ---------- */
const capOk = p => mode === 'image' ? p.capabilities?.image === true : true;
function stateIcon(r) {
  if (!r) return '';
  if (r.status === 'loading') return '<span class="pstate"><i class="ri-loader-4-line spin-i"></i></span>';
  if (r.status === 'ok') return `<span class="pstate ok">${r.items.length}</span>`;
  if (r.status === 'login') return '<span class="pstate warn" data-tip="需要登录"><i class="ri-lock-line"></i></span>';
  if (r.status === 'blocked') return '<span class="pstate warn" data-tip="需要验证"><i class="ri-shield-keyhole-line"></i></span>';
  if (r.status === 'manual') return '<span class="pstate" data-tip="该平台不支持直接搜索"><i class="ri-hand-coin-line"></i></span>';
  if (r.status === 'empty') return '<span class="pstate">0</span>';
  return '<span class="pstate err" data-tip="加载失败"><i class="ri-error-warning-line"></i></span>';
}
function renderPlatforms() {
  const ul = $('#platformList'); ul.innerHTML = '';
  let bar = document.getElementById('indBar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'indBar'; bar.className = 'ind-bar'; ul.parentNode.insertBefore(bar, ul); bar.onclick = e => { const b = e.target.closest('[data-ind]'); if (!b) return; ind = b.dataset.ind; renderPlatforms(); }; }
  const inds = [...new Set(enabled().filter(p => catOf(p) === 'wholesale').map(p => p.industry || '综合'))];
  bar.style.display = cat === 'wholesale' ? '' : 'none';
  bar.innerHTML = ['', ...inds].map(x => `<button data-ind="${esc(x)}" class="${ind === x ? 'active' : ''}">${esc(x || '全部行业')}</button>`).join('');
  const list = enabled().filter(inCat);
  for (const p of list) {
    const ok = capOk(p);
    const li = document.createElement('li');
    li.className = 'plat' + (ok ? '' : ' disabled'); li.dataset.id = p.id;
    li.title = ok ? (p.industry ? '【' + p.industry + '】' : '') + (p.note || '') + (p.needLogin ? '（搜索需登录）' : '') : '该平台不支持以图搜货';
    const login = loginMap[p.id];
    li.innerHTML = `<span class="chk ${selected.has(p.id) && ok ? 'on' : ''}"><i class="ri-check-line"></i></span>${avatar(p)}
      <span class="pname">${esc(p.name)}</span>${cat === 'all' ? `<span class="cat-badge c-${catOf(p)}">${CATS[catOf(p)]}</span>` : ''}
      ${stateIcon(results.get(p.id))}
      ${login === null || login === undefined ? '' : `<span class="lstat ${login ? 'on' : ''}" data-tip="${login ? '已登录 · 点击可退出' : '未登录 · 点击登录'}"><i class="${login ? 'ri-user-follow-line' : 'ri-login-circle-line'}"></i></span>`}`;
    li.onclick = e => {
      if (e.target.closest('.lstat')) return loginAction(p);
      if (!ok) return;
      selected.has(p.id) ? selected.delete(p.id) : selected.add(p.id); settings.selected = [...selected]; saveSettings(); renderPlatforms();
    };
    ul.appendChild(li);
  }
  $('#selCount').textContent = `${list.filter(p => selected.has(p.id) && capOk(p)).length}/${list.length}`;
  $('#favCount').textContent = data.favorites.length || '';
}
async function loginAction(p, force) {
  if (loginMap[p.id] && !force) {
    if (!confirm(`退出「${p.name}」的登录，并清除这个平台在本机的浏览数据？`)) return;
    await ww.logout(p.id); refreshLogin(); toast(`已退出${p.name}`, 'success'); return;
  }
  toast(`已打开${p.name}登录窗口，登录完成后关闭窗口即可`, 'info', 4000);
  await ww.openLogin({ url: loginOf(p), partition: partOf(p), ua: uaOf(p), title: `登录 ${p.name}`, mobile: isMobile(p) });
  await refreshLogin();
  if (loginMap[p.id]) toast(`${p.name}登录成功，已保存`, 'success');
  if (lastQuery && results.has(p.id)) runOne(p, lastQuery, seq, true);
}
async function refreshLogin() {
  loginMap = await ww.loginStatus(); renderPlatforms();
  const vals = enabled().map(p => loginMap[p.id]).filter(v => v !== null && v !== undefined);
  $('#loginSummary').innerHTML = `<i class="ri-shield-user-line"></i>已登录 ${vals.filter(Boolean).length} 个平台`;
  if (!$('#modal').hidden) renderAccounts();
}

/* ---------- 搜索 ---------- */
function setMode(m) {
  mode = m; $$('#modes button').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  $('#q').placeholder = m === 'text' ? '输入商品名称，回车同时搜索所有已选平台' : '粘贴、拖入或点右侧相机选择图片，回车找同款';
  renderPlatforms();
}
function setImage(f) {
  imageFile = f; $('#imgChip').hidden = !f;
  if (f) { $('#imgPreview').src = 'file://' + f.replace(/\\/g, '/'); $('#imgName').textContent = f.split(/[\\/]/).pop().slice(0, 14); setMode('image'); }
}
const targets = () => enabled().filter(p => inCat(p) && selected.has(p.id) && capOk(p));
async function search(force = false) {
  const q = $('#q').value.trim();
  const ts = targets();
  hideSuggest();
  if (!ts.length) return toast(mode === 'image' ? '已选平台都不支持以图搜货，请勾选淘宝、天猫或 1688' : '请先在左侧勾选要搜索的平台', 'warn');
  if (mode === 'text' && !q) { $('#q').focus(); return toast('请输入要找的商品', 'warn'); }
  if (mode === 'image' && !imageFile) { toast('请先选择、粘贴或拖入一张图片', 'warn'); return $('#pickImg').click(); }
  firstAt = 0; const my = ++seq; lastQuery = mode === 'image' ? '图片:' + imageFile : q; searchStart = Date.now();
  results.clear(); compare.clear(); updateCompareBar();
  for (const p of ts) results.set(p.id, { status: 'loading', items: [] });
  addHistory(mode === 'image' ? { mode, q: '图片 · ' + imageFile.split(/[\\/]/).pop(), file: imageFile } : { mode, q });
  renderAll(true);
  await Promise.all(ts.map(p => runOne(p, mode === 'image' ? null : q, my, force)));
  if (my !== seq) return;
  const all = [...results.values()];
  const n = all.reduce((a, r) => a + r.items.length, 0);
  status(`找到 ${n} 件商品 · ${all.filter(r => r.status === 'ok').length}/${all.filter(r => r.status !== 'manual').length} 个平台有结果${all.some(r => r.status === 'manual') ? ` · ${all.filter(r => r.status === 'manual').length} 个需手动打开` : ''} · 首批结果 ${firstAt ? ((firstAt - searchStart) / 1000).toFixed(1) + ' 秒' : '—'} · 全部完成 ${((Date.now() - searchStart) / 1000).toFixed(1)} 秒`);
  renderAll();
}
async function runOne(p, q, my, force) {
  let url = q != null ? searchUrl(p, q) : null; let typeQ = null;
  if (q != null && !url && homeOf(p) && p.typeSearch !== false) { url = homeOf(p); typeQ = q; } // 3.7：无搜索 URL 的站点自动在首页搜索框输入
  const ck = `${p.id}|${isMobile(p) ? 'm' : 'd'}|${q}`;
  if (q != null && !url) { results.set(p.id, { status: 'manual', items: [], url: homeOf(p) }); renderAll(); return; }
  const ttl = +(settings.cacheMin ?? 30) * 60000;
  if (q != null && !force && ttl && cache.has(ck) && Date.now() - cache.get(ck).t < ttl) {
    results.set(p.id, { ...cache.get(ck).r, cached: true }); renderAll(); return;
  }
  results.set(p.id, { status: 'loading', items: [] }); renderAll();
  const job = { id: p.id, url, partition: partOf(p), ua: uaOf(p), mobile: isMobile(p), extractor: p.extractor || null, q, typeQ, relevant: !!p.relevant, limit: +(settings.limit || 40), timeout: 25000, hardTimeout: +(settings.platTimeout || 45) * 1000 };
  let r;
  try {
    // 3.7：每平台总时限（含排队），到时给出明确状态，不再一直“正在搜索…”
    const capMs = 150000 + (job.typeQ ? 30000 : 0);
    r = q != null ? await Promise.race([ww.extract(job), new Promise(res => setTimeout(() => res({ status: 'timeout', items: [], msg: '超过 ' + Math.round(capMs / 1000) + ' 秒未返回（网络慢或页面卡住）' }), capMs))])
      : await ww.extractImage({ ...job, url: p.imageSearch?.url || p.home, mobile: false, ua: UA.desktop, file: imageFile });
  } catch (e) { r = { status: 'error', items: [], msg: e.message }; }
  if (my !== seq) return;
  results.set(p.id, r);
  if (q != null && r.status === 'ok') cache.set(ck, { t: Date.now(), r });
  renderAll();
}
function addHistory(h) { data.history = [h, ...data.history.filter(x => x.q !== h.q)].slice(0, 50); saveData(); }

/* ---------- 进度条 ---------- */
function chipHtml(p, r) {
  const map = {
    loading: ['ri-loader-4-line st', '正在搜索…', ''],
    ok: ['ri-checkbox-circle-fill st', `<b>${r.items.length}</b> 件${r.cached ? ' <span class="cache">缓存</span>' : ''}`, 'ok'],
    empty: ['ri-inbox-line st', '没有找到商品', 'warn', '<button data-act="raw">查看原页</button>' + (p.loginCookie && p.loginCookie.names && p.loginCookie.names.length ? '<button data-act="login">登录后重试</button>' : '')],
    login: ['ri-lock-line st', '需要登录', 'warn', '<button data-act="login">去登录</button>'],
    blocked: ['ri-shield-keyhole-line st', '需要安全验证', 'warn', '<button data-act="raw">去验证</button>'],
    manual: ['ri-hand-coin-line st', '不支持直接搜索', 'warn', '<button data-act="manual">打开网站</button>'],
    timeout: ['ri-timer-line st', '响应太慢，已跳过', 'err', '<button data-act="retry">重试</button>'],
    error: ['ri-error-warning-line st', r.msg && /timeout|超时/i.test(r.msg) ? '响应超时' : '打不开', 'err', '<button data-act="retry">重试</button>'],
  }[r.status] || ['ri-question-line st', r.status, ''];
  return `<div class="pchip ${r.status === 'loading' ? 'loading' : map[2]}" data-id="${p.id}" title="${esc(r.url || '')}">${avatar(p)}<span>${esc(p.name)}</span><i class="${map[0]}"></i><span>${map[1]}</span>${map[3] || ''}</div>`;
}
function renderProgress() {
  const box = $('#progress');
  if (!results.size) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = [...results.entries()].map(([id, r]) => chipHtml(byId(id), r)).join('');
}
$('#progress').onclick = e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const p = byId(b.closest('.pchip').dataset.id), r = results.get(p.id), act = b.dataset.act;
  if (act === 'retry') runOne(p, mode === 'image' ? null : $('#q').value.trim(), seq, true);
  if (act === 'login') loginAction(p, r && (r.status === 'login' || r.status === 'empty')); // 3.7：搜索时遇到登录墙，直接打开可见登录窗口，关闭后自动重搜
  if (act === 'raw') openRaw(p, r.url || searchUrl(p, $('#q').value.trim()) || homeOf(p), r.status === 'blocked' ? '完成安全验证后，点击“完成，重新获取”' : '这是平台原始页面，如果能看到商品，可以把问题反馈给我们改进识别');
  if (act === 'manual') { ww.copy($('#q').value.trim()); openRaw(p, homeOf(p), '该平台没有公开的搜索链接，关键词已复制，可在页面搜索框中粘贴（Ctrl+V）'); }
};

/* ---------- 结果 ---------- */
function allItems() {
  const out = [];
  for (const [id, r] of results) for (const it of r.items || []) out.push({ ...it, platform: id });
  return out;
}
function filtered() {
  let items = allItems();
  const min = parseFloat($('#fMin').value), max = parseFloat($('#fMax').value), fp = $('#fPlat').value;
  if (!isNaN(min)) items = items.filter(i => i.price != null && i.price >= min);
  if (!isNaN(max)) items = items.filter(i => i.price != null && i.price <= max);
  if (fp) items = items.filter(i => i.platform === fp);
  const s = $('#sort').value;
  const order = P.map(p => p.id);
  if (s === 'price-asc') items.sort((a, b) => (a.price ?? 1e12) - (b.price ?? 1e12));
  if (s === 'price-desc') items.sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
  if (s === 'sales') items.sort((a, b) => (b.salesNum || 0) - (a.salesNum || 0));
  if (s === 'platform') items.sort((a, b) => order.indexOf(a.platform) - order.indexOf(b.platform));
  if (s === 'default') { // 各平台轮流穿插，避免某平台霸屏
    const by = new Map(); for (const it of items) { if (!by.has(it.platform)) by.set(it.platform, []); by.get(it.platform).push(it); }
    const lists = [...by.values()]; items = [];
    for (let i = 0; lists.some(l => l[i]); i++) for (const l of lists) if (l[i]) items.push(l[i]);
  }
  if ($('#fGroup').checked) items = group(items);
  return items;
}
// 相似商品合并：标题字二元组 Jaccard 相似度 ≥ 0.5 归为一组，组内展示最低价
function grams(t) { t = (t || '').toLowerCase().replace(/[\s【】\[\]()（）,，。.!！、/|+\-_:：]/g, ''); const g = new Set(); for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2)); return g; }
function sim(a, b) { let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n || 1); }
function group(items) {
  const groups = [];
  for (const it of items.slice(0, 600)) {
    const g = grams(it.title); let hit = null;
    for (const gr of groups) if (sim(g, gr.g) >= 0.5) { hit = gr; break; }
    if (hit) hit.items.push(it); else groups.push({ g, items: [it] });
  }
  return groups.map(gr => {
    const sorted = gr.items.slice().sort((a, b) => (a.price ?? 1e12) - (b.price ?? 1e12));
    return { ...sorted[0], groupSize: gr.items.length, groupMax: sorted[sorted.length - 1].price, groupPlats: [...new Set(gr.items.map(i => i.platform))] };
  });
}
function skeleton(n = 12) { return Array.from({ length: n }, () => '<div class="sk"><div class="a"></div><div class="b"></div><div class="c"></div></div>').join(''); }
const isFav = it => data.favorites.some(f => itemKey(f) === itemKey(it));
function cardHtml(it, i, minPrice) {
  const p = byId(it.platform) || { name: it.platform };
  const k = itemKey(it);
  const lowest = it.price != null && it.price === minPrice;
  const ws = p.category === 'wholesale';
  return `<div class="card-item" tabindex="0" data-i="${i}">
    <div class="thumb">${it.image ? `<img src="${esc(it.image)}" loading="lazy" referrerpolicy="no-referrer" alt="">` : '<div class="noimg"><i class="ri-image-line"></i></div>'}
      <span class="pbadge ${ws ? 'ws' : ''}">${avatar(p)}${esc(p.name)}</span>
      <div class="card-acts"><button class="ca ${isFav(it) ? 'on' : ''}" data-act="fav" data-tip="收藏"><i class="${isFav(it) ? 'ri-star-fill' : 'ri-star-line'}"></i></button>
        <button class="ca ${compare.has(k) ? 'cmp-on' : ''}" data-act="cmp" data-tip="加入对比"><i class="ri-scales-3-line"></i></button>
        <button class="ca" data-act="copy" data-tip="复制链接"><i class="ri-link"></i></button>
        ${it.image ? '<button class="ca" data-act="same" data-tip="用这张图找同款"><i class="ri-camera-lens-line"></i></button>' : ''}</div>
      ${lowest ? '<span class="lowest">全网最低</span>' : ''}</div>
    <div class="cbody"><div class="ctitle" title="${esc(it.title)}">${esc(it.title)}</div>
      <div class="cprice"><b>${it.price == null ? '<em class="ask">面议</em>' : '<small>¥</small>' + fmtPrice(it.price)}</b>${it.groupSize > 1 ? `<span class="group-more">${it.groupSize} 个相似 · 最高 ${money(it.groupMax)}</span>` : `<span>${esc(it.sales || '')}</span>`}</div>
      <div class="cshop">${it.shop ? `<i class="ri-store-2-line"></i>${esc(it.shop)}` : '&nbsp;'}</div></div></div>`;
}
let shown = []; let firstAt = 0;
function renderResults(loadingOnly) {
  const list = $('#list');
  const anyLoading = [...results.values()].some(r => r.status === 'loading');
  shown = filtered();
  $('#empty').hidden = results.size > 0;
  $('#resbar').hidden = !results.size;
  $('#resCount').textContent = shown.length;
  const tot = allItems().length;
  $('#resMeta').textContent = `件商品${shown.length !== tot ? `（共 ${tot} 件，已筛选）` : ''}${anyLoading ? ' · 还在加载更多平台…' : ''}`;
  const priced = shown.filter(x => x.price != null && x.price > 0);
  const best = priced.length ? priced.reduce((a, b) => (b.price < a.price ? b : a)) : null;
  const bd = $('#bestDeal');
  if (best) { const bp = byId(best.platform) || {}; bd.hidden = false; bd.innerHTML = `<i class="ri-price-tag-3-line"></i>最低 <b>${money(best.price)}</b><span>${esc(bp.name || '')}</span>`; bd.onclick = () => openDetail(best); bd.title = best.title; }
  else bd.hidden = true;
  if (!firstAt && tot) firstAt = Date.now();
  list.className = view;
  if (!shown.length) {
    if (anyLoading) { list.className = 'card'; list.innerHTML = skeleton(); return; }
    if (results.size) {
      const all = [...results.values()];
      const need = all.filter(r => r.status === 'login' || r.status === 'blocked').length;
      list.className = '';
      list.innerHTML = `<div class="notice"><i class="ri-search-eye-line"></i><div><b>${tot ? '没有符合筛选条件的商品' : '这次没有找到商品'}</b><p>${tot ? '试试放宽价格区间或选择“全部平台”。' : need ? `有 ${need} 个平台需要登录或安全验证，点击上方对应平台的“去登录 / 去验证”后会自动重新获取。` : '换个关键词试试，或在左侧多勾选几个平台。'}</p></div></div>`;
    }
    return;
  }
  const minPrice = Math.min(...shown.map(i => i.price ?? Infinity));
  if (view === 'table') {
    list.innerHTML = `<table class="rt"><thead><tr><th></th><th data-s="default">商品</th><th data-s="price-asc">价格</th><th data-s="sales">销量</th><th>店铺</th><th data-s="platform">平台</th><th></th></tr></thead><tbody>${shown.map((it, i) => {
      const p = byId(it.platform) || { name: it.platform };
      return `<tr data-i="${i}" class="card-row"><td>${it.image ? `<img src="${esc(it.image)}" loading="lazy" referrerpolicy="no-referrer" alt="">` : ''}</td><td><div class="tt" title="${esc(it.title)}">${esc(it.title)}</div></td><td class="pp">${money(it.price)}</td><td>${esc(it.sales || '—')}</td><td>${esc(it.shop || '—')}</td><td><span class="plt">${avatar(p)}${esc(p.name)}</span></td>
        <td class="ops"><button class="icon-btn sm" data-act="fav" data-tip="收藏"><i class="${isFav(it) ? 'ri-star-fill' : 'ri-star-line'}"></i></button><button class="icon-btn sm" data-act="cmp" data-tip="对比"><i class="ri-scales-3-line"></i></button><button class="icon-btn sm" data-act="copy" data-tip="复制链接"><i class="ri-link"></i></button></td></tr>`; }).join('')}</tbody></table>`;
  } else list.innerHTML = shown.map((it, i) => cardHtml(it, i, minPrice)).join('') + (anyLoading ? skeleton(4) : '');
}
function renderAll() {
  renderProgress(); renderPlatforms(); renderResults();
  const opts = '<option value="">全部平台</option>' + [...results.keys()].map(id => byId(id)).filter(Boolean).map(p => `<option value="${p.id}">${esc(p.name)}（${results.get(p.id).items.length}）</option>`).join('');
  const v = $('#fPlat').value; $('#fPlat').innerHTML = opts; $('#fPlat').value = v;
}
$('#list').onclick = e => {
  const host = e.target.closest('[data-i]'); if (!host) return;
  const it = shown[+host.dataset.i]; const b = e.target.closest('[data-act]');
  if (b) {
    e.stopPropagation(); const a = b.dataset.act;
    if (a === 'fav') { toggleFav(it); renderResults(); }
    if (a === 'cmp') { toggleCompare(it); renderResults(); }
    if (a === 'copy') { ww.copy(it.link); toast('链接已复制', 'success'); }
    if (a === 'same') findSame(it);
    return;
  }
  openDetail(it);
};
$('#list').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.i) openDetail(shown[+e.target.dataset.i]); });
$('#list').addEventListener('click', e => { const th = e.target.closest('th[data-s]'); if (th) { $('#sort').value = th.dataset.s; renderResults(); } });
async function findSame(it) {
  toast('正在用商品图找同款…', 'info');
  const p = byId(it.platform) || {};
  const f = await ww.imageFromUrl(it.image, partOf(p));
  if (!f) return toast('图片下载失败，可以右键保存图片后拖进来搜索', 'warn');
  setImage(f);
  const img = enabled().filter(x => x.capabilities && x.capabilities.image);
  if (!img.length) return toast('没有支持以图搜货的平台', 'warn');
  if (cat !== 'all') document.querySelector('#catSeg [data-cat="all"]').click();
  selected = new Set([...selected, ...img.map(x => x.id)]); renderPlatforms();
  return search();
}
async function openDetail(it) {
  const p = byId(it.platform);
  if ((it.noLink || !it.link) && it.wi && ww.resolveLink) { const u = await ww.resolveLink({ id: it.platform, mobile: p ? isMobile(p) : false, wi: it.wi }).catch(() => null); if (u) { it.link = u; it.noLink = false; } }
  if (settings.detail === 'browser') return ww.openExternal(it.link);
  ww.openDetail({ url: it.link, partition: p ? partOf(p) : undefined, ua: p ? uaOf(p) : UA.desktop, title: `${p ? p.name + ' · ' : ''}${it.title}`, mobile: p ? isMobile(p) : false });
}
function toggleFav(it) {
  const k = itemKey(it);
  if (isFav(it)) { data.favorites = data.favorites.filter(f => itemKey(f) !== k); toast('已取消收藏'); }
  else { data.favorites.unshift({ ...it, groupSize: undefined, savedAt: Date.now(), q: lastQuery }); toast('已收藏', 'success'); }
  saveData(); renderPlatforms();
}
function toggleCompare(it) {
  const k = itemKey(it);
  if (compare.has(k)) compare.delete(k);
  else { if (compare.size >= 4) return toast('最多同时对比 4 件商品', 'warn'); compare.set(k, it); }
  updateCompareBar();
}
function updateCompareBar() { $('#comparebar').hidden = !compare.size; $('#cmpText').textContent = `已选 ${compare.size} 件商品`; }
$('#cmpClear').onclick = () => { compare.clear(); updateCompareBar(); renderResults(); };
$('#cmpOpen').onclick = () => {
  const items = [...compare.values()]; if (items.length < 2) return toast('至少选择 2 件商品再对比', 'warn');
  const min = Math.min(...items.map(i => i.price ?? Infinity));
  $('#cmpBody').innerHTML = `<div class="cmp-grid" style="grid-template-columns:repeat(${items.length},1fr)">${items.map(it => { const p = byId(it.platform) || {};
    return `<div class="col"><img src="${esc(it.image || '')}" referrerpolicy="no-referrer" alt=""><div class="row">${esc(it.title)}</div>
      <div class="row"><b>价格</b><span class="${it.price === min ? 'best' : ''}">${money(it.price)}${it.price === min ? ' · 最低' : ''}</span></div>
      <div class="row"><b>销量</b>${esc(it.sales || '—')}</div><div class="row"><b>店铺</b>${esc(it.shop || '—')}</div>
      <div class="row"><b>平台</b><span class="plt">${avatar(p)} ${esc(p.name || '')}${' · ' + CATS[catOf(p)]}</span></div>
      <div class="row"><button class="btn primary" data-link="${esc(it.link)}" data-pid="${esc(it.platform)}"><i class="ri-external-link-line"></i>查看商品</button></div></div>`; }).join('')}</div>`;
  $('#cmpDlg').hidden = false;
};
$('#cmpBody').onclick = e => { const b = e.target.closest('[data-link]'); if (b) openDetail({ link: b.dataset.link, platform: b.dataset.pid, title: '' }); };

/* ---------- 原网页（高级） ---------- */
let rawCtx = null;
function openRaw(p, url, sub) {
  rawCtx = p;
  $('#rawLogo').innerHTML = avatar(p); $('#rawTitle').textContent = `${p.name} · 原始页面`; $('#rawSub').textContent = sub || '';
  const body = $('#rawBody'); body.innerHTML = ''; body.classList.toggle('mobile', isMobile(p));
  const wv = document.createElement('webview');
  wv.setAttribute('partition', partOf(p)); wv.setAttribute('useragent', uaOf(p)); wv.setAttribute('src', url);
  body.appendChild(wv); $('#raw').hidden = false; rawCtx.url = url; rawCtx.wv = wv;
}
$('#rawDone').onclick = () => { const p = rawCtx; closeOverlays(); if (p && lastQuery) runOne(p, mode === 'image' ? null : $('#q').value.trim(), seq, true); refreshLogin(); };
$('#rawExternal').onclick = () => { if (rawCtx) ww.openExternal(rawCtx.wv?.getURL?.() || rawCtx.url); };
function closeOverlays() { $$('.overlay').forEach(o => o.hidden = true); $('#rawBody').innerHTML = ''; }
$$('[data-close]').forEach(b => b.onclick = closeOverlays);
$$('.overlay').forEach(o => o.addEventListener('mousedown', e => { if (e.target === o && o.id !== 'editor') closeOverlays(); }));

/* ---------- 收藏 / 历史 抽屉 ---------- */
function openDrawer(kind) {
  $('#drawer .drawer').classList.remove('wide');
  $('#drawerTitle').textContent = kind === 'fav' ? `我的收藏（${data.favorites.length}）` : '搜索历史';
  const body = $('#drawerBody');
  if (kind === 'fav') {
    body.innerHTML = data.favorites.length ? data.favorites.map((f, i) => { const p = byId(f.platform) || {};
      return `<div class="d-item" data-i="${i}"><img src="${esc(f.image || '')}" referrerpolicy="no-referrer" alt=""><div class="m"><div>${esc(f.title)}</div><small>${esc(p.name || '')}${f.shop ? ' · ' + esc(f.shop) : ''}</small></div><span class="p">${money(f.price)}</span><button class="icon-btn sm" data-del="${i}" data-tip="移除"><i class="ri-close-line"></i></button></div>`; }).join('')
      : '<div class="d-empty"><i class="ri-star-line"></i>还没有收藏的商品<br>在商品卡片上点星标即可收藏</div>';
    body.onclick = e => { const d = e.target.closest('[data-del]'); if (d) { data.favorites.splice(+d.dataset.del, 1); saveData(); openDrawer('fav'); renderPlatforms(); return; } const r = e.target.closest('[data-i]'); if (r) openDetail(data.favorites[+r.dataset.i]); };
  } else {
    body.innerHTML = data.history.length ? data.history.map((h, i) => `<div class="d-item" data-i="${i}"><i class="${h.mode === 'image' ? 'ri-image-line' : 'ri-history-line'}"></i><div class="m"><div>${esc(h.q)}</div></div><button class="icon-btn sm" data-del="${i}" data-tip="删除"><i class="ri-close-line"></i></button></div>`).join('')
      : '<div class="d-empty"><i class="ri-history-line"></i>还没有搜索记录</div>';
    body.onclick = e => { const d = e.target.closest('[data-del]'); if (d) { data.history.splice(+d.dataset.del, 1); saveData(); openDrawer('hist'); return; } const r = e.target.closest('[data-i]'); if (r) { const h = data.history[+r.dataset.i]; closeOverlays(); if (h.file) setImage(h.file); else { setMode('text'); $('#q').value = h.q; } search(); } };
  }
  $('#drawer').hidden = false;
}
const beltLabel = b => b.kind === '农业集群' ? b.name : (b.county && b.city && !b.county.startsWith(b.city) && b.city !== b.name ? `${b.city}·${b.name}` : b.name);
function setBelt(b) {
  belt = b; $('#beltName').textContent = b ? b.name : '';
  if (b) { const ids = [...new Set([...BELT_B2B, ...b.sites])].filter(id => byId(id)); P.forEach(p => { if (ids.includes(p.id)) p.enabled = true; }); selected = new Set(ids); toast(`产业带：${beltLabel(b)} · ${b.industry}，已选 ${ids.length} 个平台${beltCity(b) ? `（综合 B2B 平台关键词前自动加“${beltCity(b)}”）` : ''}`, 'success'); settings.selected = [...selected]; saveSettings(); }
  renderPlatforms(); const c = document.getElementById('beltChip'); if (c) c.remove();
  if (b) { const chip = document.createElement('span'); chip.id = 'beltChip'; chip.className = 'belt-chip'; chip.innerHTML = `<i class="ri-map-pin-2-fill"></i>${esc(b.name)} · ${esc(b.industry.split('/')[0])}<i class="ri-close-line x"></i>`; chip.title = `${b.province} ${beltLabel(b)} · ${b.industry}（${b.src}）`; chip.onclick = () => setBelt(null); $('#q').parentNode.appendChild(chip); }
}
// v3.5：大数据量产业带目录 —— 省份树 + 品类/类型筛选 + 搜索（防抖、分页渲染，只重绘列表）
const BF = { q: '', prov: '', cat: '', kind: '', limit: 120 };
const BELT_CATS = ['服装', '鞋包', '纺织家纺', '小商品工艺', '家具家居', '电子电气', '机械五金', '材料化工', '食品农产', '医药健康'];
const BELT_KINDS = [['', '全部'], ['批发/电商产业带', '批发/电商'], ['制造业集群', '制造业集群'], ['农业集群', '农业集群']];
let beltIdx = null;
function beltIndex() { if (!beltIdx || beltIdx.n !== belts.length) { beltIdx = { n: belts.length, txt: belts.map(b => (b.name + b.city + b.county + b.province + b.industry + b.market + b.kw).toLowerCase()) }; } return beltIdx; }
function beltFilter(skip) {
  const idx = beltIndex(); const terms = BF.q.trim().toLowerCase().split(/\s+/).filter(Boolean); const out = [];
  for (let i = 0; i < belts.length; i++) { const b = belts[i];
    if (skip !== 'prov' && BF.prov && b.province !== BF.prov) continue; if (skip !== 'cat' && BF.cat && b.cat !== BF.cat) continue; if (BF.kind && b.kind !== BF.kind) continue;
    if (terms.length && !terms.every(t => idx.txt[i].includes(t))) continue; out.push(b); }
  return out;
}
function beltRow(b) {
  return `<div class="d-item belt ${belt && belt.id === b.id ? 'on' : ''}" data-belt="${b.id}"><i class="${b.kind === '农业集群' ? 'ri-plant-line' : b.kind === '制造业集群' ? 'ri-building-2-line' : 'ri-store-2-line'}"></i><div class="m"><div>${esc(beltLabel(b))} <small>${esc(b.province)}${b.county && b.county !== b.name ? ' · ' + esc(b.county) : ''}</small></div><small>${esc(b.industry)} · ${esc(b.market)}</small></div><span class="belt-n">${b.sites.length ? b.sites.slice(0, 4).map(id => byId(id) ? avatar(byId(id)) : '').join('') : '<em>1688/爱采购</em>'}</span></div>`;
}
function renderBeltList() {
  const list = beltFilter(); const provAll = beltFilter('prov'); const pc = {}; provAll.forEach(b => pc[b.province] = (pc[b.province] || 0) + 1);
  const catAll = beltFilter('cat'); const cc = {}; catAll.forEach(b => cc[b.cat] = (cc[b.cat] || 0) + 1);
  const PV = ['北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江', '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '广西', '海南', '重庆', '四川', '贵州', '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆'];
  $('#beltProv').innerHTML = `<div class="bp ${BF.prov ? '' : 'on'}" data-prov="">全国<b>${provAll.length}</b></div>` + PV.map(p => `<div class="bp ${BF.prov === p ? 'on' : ''} ${pc[p] ? '' : 'zero'}" data-prov="${p}">${p}<b>${pc[p] || 0}</b></div>`).join('');
  $('#beltCats').innerHTML = `<span class="bc ${BF.cat ? '' : 'on'}" data-cat="">全部品类</span>` + BELT_CATS.map(c => `<span class="bc ${BF.cat === c ? 'on' : ''}" data-cat="${c}">${c}<i>${cc[c] || 0}</i></span>`).join('');
  $('#beltCount').textContent = `${list.length} 个产业带`;
  BF.list = list; const el = $('#beltList');
  if (!list.length) { el.innerHTML = '<div class="d-empty"><i class="ri-map-pin-line"></i>没有匹配的产业带，可换个关键词或清除筛选</div>'; return; }
  el.innerHTML = `<div class="belt-vs" style="height:${list.length * BELT_RH}px"><div class="belt-vw"></div></div>`; BF.vr = ''; beltPaint();
  if (!el._vs) { el._vs = 1; el.addEventListener('scroll', () => requestAnimationFrame(beltPaint), { passive: true }); }
}
const BELT_RH = 54;
function beltPaint() {
  const el = $('#beltList'); const w = el && el.querySelector('.belt-vw'); if (!w || !BF.list) return;
  const a = Math.max(0, Math.floor(el.scrollTop / BELT_RH) - 10), z = Math.min(BF.list.length, a + Math.ceil((el.clientHeight || 600) / BELT_RH) + 20);
  const k = a + ':' + z + ':' + (belt ? belt.id : ''); if (BF.vr === k) return; BF.vr = k;
  w.style.transform = `translateY(${a * BELT_RH}px)`; w.innerHTML = BF.list.slice(a, z).map(beltRow).join('');
}
function openBelts(filter) {
  if (typeof filter === 'string') BF.q = filter; BF.limit = 120;
  $('#drawerTitle').textContent = `产业带找货（${belts.length} 个产业带 · 31 省）`;
  $('#drawer .drawer').classList.add('wide');
  $('#drawerBody').innerHTML = `<div class="belt-top"><div class="belt-search"><i class="ri-search-line"></i><input id="beltQ" placeholder="搜地名、品类或市场，如 袜子、灯具、义乌、轴承" value="${esc(BF.q)}"></div>
    <div class="belt-kinds">${BELT_KINDS.map(([k, l]) => `<span class="bk ${BF.kind === k ? 'on' : ''}" data-kind="${k}">${l}</span>`).join('')}<em id="beltCount"></em></div><div class="belt-cats" id="beltCats"></div>` +
    (belt ? `<div class="belt-cur">当前：<b>${esc(beltLabel(belt))}</b> · ${esc(belt.industry)} <button data-clear>取消产业带</button></div>` : '') + `</div>
    <div class="belt-body"><div class="belt-prov-tree" id="beltProv"></div><div class="belt-list" id="beltList"></div></div>
    <div class="belt-tip">点产业带即可限定：自动勾选当地专业货源站 + 1688、百度爱采购、世界工厂网等，并在综合 B2B 平台关键词前加上地名。数据来源：工信部中小企业特色产业集群（2022–2025）与国家先进制造业集群（2022、2024），农业农村部优势特色产业集群（2020–2023）、农业产业强镇（2018–2021、2023）、国家现代农业产业园（2021、2023）、第十一批一村一品示范村镇及2021年十亿元镇/亿元村，1688 产业带/淘宝村与专业市场，详见《产业带研究.md》。</div>`;
  renderBeltList();
  let tm; const inp = $('#beltQ'); inp.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { BF.q = inp.value; BF.limit = 120; renderBeltList(); }, 120); };
  $('#drawerBody').onclick = e => {
    const t = e.target;
    if (t.closest('[data-clear]')) { setBelt(null); return openBelts(); }
    const pv = t.closest('[data-prov]'); if (pv) { BF.prov = pv.dataset.prov; BF.limit = 120; renderBeltList(); $('#beltList').scrollTop = 0; return; }
    const ct = t.closest('[data-cat]'); if (ct) { BF.cat = ct.dataset.cat; BF.limit = 120; renderBeltList(); return; }
    const kd = t.closest('[data-kind]'); if (kd) { BF.kind = kd.dataset.kind; $$('.bk').forEach(x => x.classList.toggle('on', x === kd)); renderBeltList(); return; }
    if (t.closest('[data-more]')) { BF.limit += 200; renderBeltList(); return; }
    const r = t.closest('[data-belt]'); if (r) { setBelt(belts.find(b => b.id === r.dataset.belt)); closeOverlays(); }
  };
  $('#drawer').hidden = false;
}
$('#openBelts').onclick = () => openBelts();
$('#openFavs').onclick = () => openDrawer('fav');
$('#openHistory').onclick = () => openDrawer('hist');

/* ---------- 搜索建议 ---------- */
let sugIdx = -1;
function showSuggest() {
  const v = $('#q').value.trim(); const ul = $('#suggest');
  const items = data.history.filter(h => h.mode === 'text' && (!v || h.q.includes(v)) && h.q !== v).slice(0, 8);
  if (!items.length || mode !== 'text') return hideSuggest();
  sugIdx = -1;
  ul.innerHTML = items.map(h => `<li data-q="${esc(h.q)}"><i class="ri-history-line"></i><span>${v ? esc(h.q).replace(esc(v), `<b>${esc(v)}</b>`) : esc(h.q)}</span><small>回车搜索</small></li>`).join('');
  ul.hidden = false;
}
function hideSuggest() { $('#suggest').hidden = true; sugIdx = -1; }
$('#suggest').onmousedown = e => { const li = e.target.closest('li'); if (li) { e.preventDefault(); $('#q').value = li.dataset.q; search(); } };
$('#q').addEventListener('focus', showSuggest);
$('#q').addEventListener('input', showSuggest);
$('#q').addEventListener('blur', () => setTimeout(hideSuggest, 120));
$('#q').addEventListener('keydown', e => {
  const lis = $$('#suggest li');
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !$('#suggest').hidden && lis.length) {
    e.preventDefault(); sugIdx = (sugIdx + (e.key === 'ArrowDown' ? 1 : -1) + lis.length) % lis.length;
    lis.forEach((l, i) => l.classList.toggle('on', i === sugIdx)); $('#q').value = lis[sugIdx].dataset.q; return;
  }
  if (e.key === 'Enter') search(e.shiftKey);
  if (e.key === 'Escape') { hideSuggest(); $('#q').blur(); }
});

/* ---------- 导出 ---------- */
function exportRows() {
  return shown.map(it => { const p = byId(it.platform) || {}; return { 平台: p.name || it.platform, 类型: CATS[catOf(p)], 标题: it.title, 价格: it.price ?? '', 销量: it.sales || '', 店铺: it.shop || '', 链接: it.link, 图片: it.image || '' }; });
}
async function doExport(kind) {
  const rows = exportRows(); if (!rows.length) return toast('没有可导出的结果', 'warn');
  const cols = Object.keys(rows[0]); const name = `找货大师-${(lastQuery || '结果').replace(/[\\/:*?"<>|]/g, '').slice(0, 20)}-${new Date().toISOString().slice(0, 10)}`;
  let content, ext;
  if (kind === 'csv') { ext = 'csv'; content = '\ufeff' + [cols.join(','), ...rows.map(r => cols.map(c => `"${String(r[c]).replace(/"/g, '""')}"`).join(','))].join('\r\n'); }
  else {
    ext = 'xls'; const x = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
    content = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#FFF1EB" ss:Pattern="Solid"/></Style></Styles><Worksheet ss:Name="找货结果"><Table>${cols.map(() => '<Column ss:Width="120"/>').join('')}<Row>${cols.map(c => `<Cell ss:StyleID="h"><Data ss:Type="String">${x(c)}</Data></Cell>`).join('')}</Row>${rows.map(r => `<Row>${cols.map(c => `<Cell><Data ss:Type="${c === '价格' && r[c] !== '' ? 'Number' : 'String'}">${x(r[c])}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet></Workbook>`;
  }
  const f = await ww.saveFile(name + '.' + ext, content);
  if (f) toast(`已导出 ${rows.length} 条到 ${f}`, 'success', 4000);
  return { f, n: rows.length, len: content.length };
}
$('#exportBtn').onclick = e => { e.stopPropagation(); $('#exportMenu').hidden = !$('#exportMenu').hidden; };
$('#exportMenu').onclick = e => { const b = e.target.closest('[data-exp]'); if (b) { $('#exportMenu').hidden = true; doExport(b.dataset.exp); } };
document.addEventListener('click', () => { $('#exportMenu').hidden = true; });

/* ---------- 设置 / 平台管理 ---------- */
function openSettings(page = 'general') {
  hideSuggest();
  $('#modal').hidden = false; showPage(page);
  $$('#accessSeg button').forEach(b => b.classList.toggle('active', b.dataset.am === (settings.accessMode || 'mobile')));
  $('#setDetail').value = settings.detail || 'popup'; $('#setCache').value = String(settings.cacheMin ?? 30); $('#setTimeout').value = String(settings.platTimeout || 45);
  $('#setConc').value = String(settings.conc || 6); $('#setLimit').value = String(settings.limit || 40);
  applyTheme();
}
function showPage(page) {
  $$('.dlg-side button').forEach(b => b.classList.toggle('active', b.dataset.sp === page));
  $$('.dlg-body section').forEach(s => s.hidden = s.dataset.page !== page);
  if (page === 'platforms') renderManager(); if (page === 'accounts') renderAccounts();
}
const capTag = (label, v) => `<span class="cap ${v === true ? 'y' : v ? 'm' : ''}">${label}</span>`;
function renderManager() {
  const ul = $('#pmList'); ul.innerHTML = '';
  P.forEach((p, i) => {
    const li = document.createElement('li'); li.draggable = true;
    li.innerHTML = `<i class="ri-draggable grip"></i>${avatar(p)}<div class="pm-info"><b>${esc(p.name)}</b> <span class="cat-badge c-${catOf(p)}">${CATS[catOf(p)]}</span>${p.industry ? ` <span class="tag">${esc(p.industry)}</span>` : ''}${p.needLogin ? ' <span class="tag">需登录</span>' : ''}${p.builtin ? '' : ' <span class="tag">自定义</span>'}<div>${esc(tplOf(p) || '没有搜索链接，需在网站内手动搜索')}</div></div>
      <div class="caps">${capTag('文字', !!tplOf(p))}${capTag('图片', p.capabilities?.image === true)}${p.extractor?.item ? capTag('专用规则', true) : ''}</div>
      <select class="am-sel" data-tip="访问方式"><option value="follow">跟随全局</option><option value="mobile">移动端</option><option value="desktop">电脑端</option></select>
      <input type="checkbox" class="switch" ${p.enabled !== false ? 'checked' : ''} data-tip="显示 / 隐藏">
      <button class="icon-btn" data-a="edit" data-tip="编辑"><i class="ri-edit-line"></i></button>
      <button class="icon-btn" data-a="del" data-tip="删除"><i class="ri-delete-bin-6-line"></i></button>`;
    li.querySelector('.switch').onchange = e => { p.enabled = e.target.checked; persistPlatforms(); };
    const am = li.querySelector('.am-sel'); am.value = p.accessMode || 'follow'; am.onchange = () => { p.accessMode = am.value; persistPlatforms(); };
    li.querySelector('[data-a=edit]').onclick = () => openEditor(p);
    li.querySelector('[data-a=del]').onclick = () => { if (confirm(`删除平台「${p.name}」？`)) { P.splice(i, 1); persistPlatforms(); toast(`已删除${p.name}`, 'success'); } };
    li.ondragstart = e => { li.classList.add('dragging'); e.dataTransfer.setData('text/x-ww', i); };
    li.ondragend = () => li.classList.remove('dragging');
    li.ondragover = e => { e.preventDefault(); li.classList.add('over'); };
    li.ondragleave = () => li.classList.remove('over');
    li.ondrop = e => { e.preventDefault(); e.stopPropagation(); const from = +e.dataTransfer.getData('text/x-ww'); const [m] = P.splice(from, 1); P.splice(i, 0, m); persistPlatforms(); };
    ul.appendChild(li);
  });
}
function renderAccounts() {
  const ul = $('#accList'); ul.innerHTML = '';
  for (const p of enabled()) {
    const s = loginMap[p.id];
    const li = document.createElement('li');
    li.innerHTML = `${avatar(p)}<div class="pm-info"><b>${esc(p.name)}</b><div>${s === null || s === undefined ? '无法自动识别登录状态' : s ? '已登录' : '未登录'}</div></div>
      <button class="btn">${s ? '<i class="ri-logout-box-r-line"></i>退出登录' : '<i class="ri-login-box-line"></i>登录'}</button>`;
    li.querySelector('.btn').onclick = () => loginAction(p);
    ul.appendChild(li);
  }
}
async function persistPlatforms() {
  await ww.setPlatforms(P);
  for (const id of [...selected]) if (!byId(id)) selected.delete(id);
  renderManager(); renderPlatforms(); refreshLogin();
}
let editing = null, pendingLogo = null;
function showLogo() { $('#logoPreview').innerHTML = pendingLogo ? `<img src="${esc(pendingLogo)}" alt="">` : '<i class="ri-image-line"></i>'; }
function openEditor(p) {
  editing = p || null; const f = $('#pform');
  $('#pformTitle').textContent = p ? `编辑平台 · ${p.name}` : '添加平台'; $('#pformErr').textContent = '';
  const v = p || { color: '#ff5c28', category: 'general', capabilities: { text: true, image: false } };
  const set = (n, x) => { f.elements[n].value = x ?? ''; };
  set('name', v.name); set('id', v.id); set('color', v.color || '#ff5c28'); set('home', v.home); set('search', v.search); set('login', v.login);
  set('mobileHome', v.mobileHome); set('mobileSearch', v.mobileSearch); set('mobileLogin', v.mobileLogin); set('accessMode', v.accessMode || 'follow'); set('category', catOf(v));
  set('cookieDomain', v.loginCookie?.domain); set('cookieNames', (v.loginCookie?.names || []).join(',')); set('partition', p && p.partition !== p.id ? p.partition : '');
  set('image', String(v.capabilities?.image === true)); set('imageUrl', v.imageSearch?.url); set('note', v.note);
  const ex = v.extractor || {}; set('exItem', ex.item); set('exTitle', ex.title); set('exPrice', ex.price); set('exImage', ex.image); set('exLink', ex.link); set('exShop', ex.shop); set('exSales', ex.sales);
  pendingLogo = v.logo || null; showLogo();
  f.elements.id.readOnly = !!p;
  $('#editor').hidden = false; f.elements.name.focus();
}
function readForm() {
  const e = $('#pform').elements, g = n => e[n].value.trim();
  const id = g('id');
  const base = editing ? JSON.parse(JSON.stringify(editing)) : { builtin: false, enabled: true };
  const ex = { item: g('exItem'), title: g('exTitle'), price: g('exPrice'), image: g('exImage'), link: g('exLink'), shop: g('exShop'), sales: g('exSales') };
  return Object.assign(base, {
    id, name: g('name'), color: e.color.value, logo: pendingLogo, category: e.category.value, home: g('home'), search: g('search') || null, login: g('login') || g('home'),
    mobileHome: g('mobileHome') || null, mobileSearch: g('mobileSearch') || null, mobileLogin: g('mobileLogin') || null, accessMode: e.accessMode.value,
    loginCookie: { domain: g('cookieDomain'), names: g('cookieNames').split(/[,，\s]+/).filter(Boolean) },
    partition: g('partition') || id, note: g('note'),
    capabilities: { text: g('search') || g('mobileSearch') ? true : 'manual', image: e.image.value === 'true', ai: false },
    imageSearch: e.image.value === 'true' || g('imageUrl') ? Object.assign(base.imageSearch || {}, { url: g('imageUrl') || g('home') }) : null,
    extractor: ex.item ? ex : null,
  });
}
function validate(p) {
  if (!p.name) return '请填写名称';
  if (!/^[a-z0-9_-]+$/.test(p.id)) return 'ID 只能包含小写字母、数字、- 和 _';
  if (!editing && byId(p.id)) return '这个 ID 已经被使用';
  try { new URL(p.home); } catch { return '首页 URL 格式不正确'; }
  for (const k of ['search', 'mobileSearch']) if (p[k]) { if (!/\{q(:\w+)?\}/.test(p[k])) return (k === 'search' ? '' : '移动端') + '搜索 URL 模板需要包含 {q}'; try { new URL(fill(p[k], 'test')); } catch { return '搜索 URL 格式不正确'; } }
  return '';
}
$('#pform').onsubmit = e => {
  e.preventDefault(); const p = readForm(); const err = validate(p);
  if (err) return $('#pformErr').textContent = err;
  if (editing) P[P.indexOf(editing)] = p; else { P.push(p); selected.add(p.id); }
  if (!p.logo) ww.fetchFavicon(p.home).then(d => { const x = byId(p.id); if (d && x && !x.logo) { x.logo = d; persistPlatforms(); } }).catch(() => {});
  persistPlatforms(); $('#editor').hidden = true; toast(editing ? '平台已更新' : `已添加${p.name}`, 'success');
};
$('#pformTest').onclick = async () => {
  const p = readForm(); const err = validate(p); if (err) return $('#pformErr').textContent = err;
  if (!p.search && !p.mobileSearch) return $('#pformErr').textContent = '请先填写搜索 URL 模板';
  $('#pformErr').textContent = '正在试搜“保温杯”…';
  const r = await ww.extract({ id: p.id, url: fill(tplOf(p) || p.search, '保温杯'), partition: 'persist:' + (p.partition || p.id), ua: uaOf(p), mobile: isMobile(p), extractor: readForm().extractor, limit: 10, timeout: 20000 });
  $('#pformErr').textContent = r.status === 'ok' ? `识别到 ${r.items.length} 件商品，例如：${r.items[0].title.slice(0, 20)} ¥${r.items[0].price}` : `没有识别到商品（${({ login: '需要登录', blocked: '需要验证', empty: '页面无商品', error: '打不开' })[r.status] || r.status}）`;
};
$('#logoFetch').onclick = async () => {
  const home = $('#pform').elements.home.value.trim(); if (!home) return $('#pformErr').textContent = '请先填写首页 URL';
  const b = $('#logoFetch'); b.disabled = true; b.innerHTML = '<i class="ri-loader-4-line spin-i"></i>获取中';
  const d = await ww.fetchFavicon(home).catch(() => null);
  b.disabled = false; b.innerHTML = '<i class="ri-download-cloud-2-line"></i>自动获取';
  if (d) { pendingLogo = d; showLogo(); toast('已获取官网图标', 'success'); } else toast('没有获取到图标，将显示文字图标，也可以上传图片', 'warn');
};
$('#logoUpload').onclick = async () => { const d = await ww.pickLogo(); if (d) { pendingLogo = d; showLogo(); } };
$('#logoClear').onclick = () => { pendingLogo = null; showLogo(); };
$('#pmAdd').onclick = () => openEditor(null);
$('#pmExport').onclick = async () => { const f = await ww.exportPlatforms(); if (f) toast('已导出到 ' + f, 'success'); };
$('#pmImport').onclick = async () => {
  try {
    const list = await ww.importPlatforms(); if (!list) return;
    if (!Array.isArray(list)) throw new Error('文件格式不正确');
    let n = 0; for (const x of list) { if (!x.id || !x.name || !x.home) continue; const i = P.findIndex(p => p.id === x.id); if (i >= 0) P[i] = x; else P.push(x); n++; }
    persistPlatforms(); toast(`已导入 ${n} 个平台`, 'success');
  } catch (e) { toast('导入失败：' + e.message, 'error'); }
};
$('#pmReset').onclick = async () => { if (!confirm('恢复默认平台列表？自定义的平台会被删除。')) return; P = await ww.resetPlatforms(); persistPlatforms(); toast('已恢复默认', 'success'); };

/* ---------- 事件 ---------- */
$$('[data-win]').forEach(b => b.onclick = () => ww.win(b.dataset.win));
ww.onWinState(m => { $('#maxIcon').className = m ? 'ri-checkbox-multiple-blank-line' : 'ri-checkbox-blank-line'; });
$('#titlebar').ondblclick = e => { if (e.target.closest('.tb-drag')) ww.win('max'); };
$('#btnTheme').onclick = () => setTheme(document.body.classList.contains('dark') ? 'light' : 'dark');
$('#btnSettings').onclick = () => openSettings();
$('#openManager').onclick = () => openSettings('platforms');
$$('.dlg-side button').forEach(b => b.onclick = () => showPage(b.dataset.sp));
$$('#themeSeg button').forEach(b => b.onclick = () => setTheme(b.dataset.theme));
$$('#accessSeg button').forEach(b => b.onclick = () => { settings.accessMode = b.dataset.am; saveSettings(); $$('#accessSeg button').forEach(x => x.classList.toggle('active', x === b)); renderManager(); toast('默认访问方式：' + (b.dataset.am === 'mobile' ? '移动端' : '电脑端'), 'success'); });
$('#setDetail').onchange = e => { settings.detail = e.target.value; saveSettings(); };
$('#setTimeout').onchange = e => { settings.platTimeout = +e.target.value; saveSettings(); };
$('#setCache').onchange = e => { settings.cacheMin = +e.target.value; saveSettings(); };
$('#setConc').onchange = e => { settings.conc = +e.target.value; saveSettings(); ww.setConcurrency(settings.conc); };
$('#setLimit').onchange = e => { settings.limit = +e.target.value; saveSettings(); };
$('#setClearHistory').onclick = () => { data.history = []; saveData(); toast('历史已清空', 'success'); };
$('#selAll').onclick = () => { enabled().filter(inCat).forEach(p => selected.add(p.id)); settings.selected = [...selected]; saveSettings(); renderPlatforms(); };
$('#selNone').onclick = () => { selected.clear(); settings.selected = []; saveSettings(); renderPlatforms(); };
$('#catSeg').onclick = e => { const b = e.target.closest('[data-cat]'); if (!b) return; cat = b.dataset.cat; settings.cat = cat; saveSettings(); $$('#catSeg button').forEach(x => x.classList.toggle('active', x === b)); renderPlatforms(); };
$('#modes').onclick = e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); };
$('#views').onclick = e => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); };
function setView(v) { view = v; settings.view = v; saveSettings(); $$('#views button').forEach(b => b.classList.toggle('active', b.dataset.view === v)); renderResults(); }
$('#go').onclick = () => search();
$('#pickImg').onclick = async () => { const f = await ww.pickImage(); if (f) setImage(f); };
$('#imgClear').onclick = () => { setImage(null); setMode('text'); };
['#fMin', '#fMax'].forEach(s => $(s).addEventListener('input', () => renderResults()));
['#fPlat', '#sort', '#fGroup'].forEach(s => $(s).addEventListener('change', () => renderResults()));
$('#hotChips').innerHTML = HOT.map(k => `<button class="chip" data-k="${k}">${k}</button>`).join('');
$('#hotChips').onclick = e => { const b = e.target.closest('[data-k]'); if (b) { setMode('text'); $('#q').value = b.dataset.k; search(); } };
document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase(); const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (e.key === 'Escape') { if (!$('#editor').hidden) $('#editor').hidden = true; else closeOverlays(); }
  if ((e.ctrlKey && k === 'k') || (!typing && k === '/')) { e.preventDefault(); $('#q').focus(); $('#q').select(); }
  if (e.ctrlKey && k === ',') { e.preventDefault(); openSettings(); }
  if (e.ctrlKey && k === 'e') { e.preventDefault(); doExport('xls'); }
  if (e.ctrlKey && e.shiftKey && k === 'l') { e.preventDefault(); $('#btnTheme').click(); }
  if (!typing && !e.ctrlKey && ['1', '2', '3'].includes(k)) setView(['card', 'list', 'table'][+k - 1]);
  if (e.altKey && ['1', '2'].includes(k)) { e.preventDefault(); setMode(['text', 'image'][+k - 1]); }
  if (e.key === 'F5') { e.preventDefault(); if (lastQuery) search(true); }
});
document.addEventListener('paste', async e => {
  if (!(e.clipboardData?.items && [...e.clipboardData.items].some(i => i.type.startsWith('image/')))) return;
  e.preventDefault(); const f = await ww.clipboardImage(); if (f) { setImage(f); toast('图片已就绪，回车即可全网找同款', 'success'); }
});
let dragDepth = 0;
const isFileDrag = e => [...(e.dataTransfer?.types || [])].includes('Files');
document.addEventListener('dragenter', e => { if (!isFileDrag(e)) return; e.preventDefault(); dragDepth++; $('#drop').hidden = false; });
document.addEventListener('dragleave', e => { if (!isFileDrag(e)) return; if (--dragDepth <= 0) { dragDepth = 0; $('#drop').hidden = true; } });
document.addEventListener('dragover', e => { if (isFileDrag(e)) e.preventDefault(); });
document.addEventListener('drop', async e => {
  if (!isFileDrag(e)) return; e.preventDefault(); dragDepth = 0; $('#drop').hidden = true;
  const file = e.dataTransfer.files[0]; if (!file || !file.type.startsWith('image/')) return toast('请拖入图片文件', 'warn');
  let p = ww.filePath(file); if (!p) p = await ww.saveImage(await file.arrayBuffer(), file.name.split('.').pop());
  setImage(p); toast('图片已就绪，回车即可全网找同款', 'success');
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
setInterval(refreshLogin, 60000);

/* ---------- 启动 ---------- */
(async () => {
  [P, data, settings, UA] = await Promise.all([ww.getPlatforms(), ww.getData(), ww.getSettings(), ww.ua()]);
  data = Object.assign({ history: [], favorites: [] }, data);
  if (data.favorites.some(f => !f.platform)) data.favorites = data.favorites.filter(f => f.platform); // v2 网页收藏不兼容
  selected = new Set(settings.selected || P.filter(p => p.enabled !== false).map(p => p.id));
  cat = settings.cat || 'all'; $$('#catSeg button').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
  view = settings.view && ['card', 'list', 'table'].includes(settings.view) ? settings.view : 'card';
  $$('#views button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (settings.conc) ww.setConcurrency(settings.conc);
  $('#verTag').textContent = 'v' + ww.version.split('.').slice(0, 2).join('.'); $('#aboutVer').textContent = '找货大师 ' + ww.version;
  applyTheme(); setMode('text'); renderAll(); refreshLogin();
  $('#q').focus();
})();

/* ---------- 端到端测试钩子（仅 WW_E2E 使用） ---------- */
window.__e2e = {
  same: () => findSame(shown.find(x => x.image)), best: () => $('#bestDeal').hidden ? null : $('#bestDeal').textContent,
  text: q => { setMode('text'); $('#q').value = q; return search(); },
  image: f => { setImage(f); return search(); },
  state: () => Object.fromEntries([...results].map(([id, r]) => [id, { status: r.status, n: r.items.length, url: (r.url || '').slice(0, 120), ms: r.ms, cached: !!r.cached, msg: r.msg, sample: r.items.slice(0, 3).map(i => ({ title: i.title.slice(0, 30), price: i.price, priceText: i.priceText, img: !!i.image, link: !!i.link, href: i.link, noLink: !!i.noLink, wi: i.wi, shop: i.shop, sales: i.sales })) }])),
  shownCount: () => shown.length,
  view: v => setView(v), sort: s => { $('#sort').value = s; renderResults(); return shown.slice(0, 5).map(i => i.price); },
  price: (a, b) => { $('#fMin').value = a ?? ''; $('#fMax').value = b ?? ''; renderResults(); return shown.length; },
  group: on => { $('#fGroup').checked = on; renderResults(); return shown.length; },
  plat: id => { $('#fPlat').value = id; renderResults(); return shown.length; },
  ind: x => { ind = x; renderPlatforms(); return document.querySelectorAll('#platformList .plat').length; },
  belts: () => { openBelts(); return belts.length; },
  belt: c => { setBelt(c ? (belts.find(b => b.name === c) || belts.find(b => b.id === c)) : null); closeOverlays(); return [...selected]; },
  beltFilter: f => { Object.assign(BF, { q: '', prov: '', cat: '', kind: '' }, f || {}); if (!$('#beltList')) openBelts(); renderBeltList(); return { count: beltFilter().length, rows: document.querySelectorAll('#beltList .d-item.belt').length }; },
  beltStats: () => { const by = {}; belts.forEach(b => by[b.province] = (by[b.province] || 0) + 1); return { total: belts.length, provinces: Object.keys(by).length, by }; },
  beltUrl: (id, q) => searchUrl(byId(id), q),
  cat: c => { document.querySelector(`#catSeg [data-cat="${c}"]`).click(); },
  select: ids => { selected = new Set(ids); renderPlatforms(); },
  platforms: () => P.map(p => ({ partition: p.partition, id: p.id, name: p.name, category: p.category, industry: p.industry, note: p.note, mode: isMobile(p) ? 'mobile' : 'desktop' })),
  enableAll: () => { P.forEach(p => p.enabled = true); return persistPlatforms(); },
  theme: t => setTheme(t), isDark: () => document.body.classList.contains('dark'),
  settings: page => openSettings(page), close: () => closeOverlays(),
  favFirst: () => { const it = shown.find(x => !isFav(x)); const before = data.favorites.length; if (it) toggleFav(it); renderResults(); return data.favorites.length - before + (it ? 0 : 1) && data.favorites.length; },
  cmpFirst: n => { shown.slice(0, n).forEach(toggleCompare); renderResults(); $('#cmpOpen').click(); return compare.size; },
  export: k => doExport(k),
  drawer: k => openDrawer(k),
  raw: id => { const p = byId(id); openRaw(p, homeOf(p), '测试：原始页面弹窗'); },
  suggest: v => { $('#q').focus(); $('#q').value = v; showSuggest(); return $$('#suggest li').length; },
  platformsFull: () => JSON.parse(JSON.stringify(P)),
  editor: id => openEditor(id ? byId(id) : null),
  addPlatform: v => { openEditor(null); const e = $('#pform').elements; for (const [k, x] of Object.entries(v)) e[k].value = x; $('#pform').requestSubmit(); return $('#pformErr').textContent; },
  setAccess: m => { settings.accessMode = m; saveSettings(); },
  loading: () => { results.clear(); for (const p of targets().slice(0, 8)) results.set(p.id, { status: 'loading', items: [] }); renderAll(); },
  toast: (m, t) => toast(m, t, 8000),
};

document.addEventListener('mousedown', e => { if (!e.target.closest('.searchbox, #suggest')) hideSuggest(); });
new MutationObserver(() => { if (!$('#suggest').hidden && $$('.overlay').some(o => !o.hidden)) hideSuggest(); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });

// v3.1 预热：启动 4 秒后，空闲预加载已选平台首页（每次最多 2 个并行）
setTimeout(() => { try { ww.warm(enabled().filter(p => selected.has(p.id) && searchUrl(p, 'a')).slice(0, 8).map(p => ({ id: p.id, url: homeOf(p), partition: partOf(p), ua: uaOf(p), mobile: isMobile(p) }))); } catch {} }, 4000);

// v3.1 图片加载失败（防盗链 / 过期）时显示占位，避免图裂
document.addEventListener('error', e => { const t = e.target; if (t.tagName === 'IMG' && !t.dataset.f) { t.dataset.f = 1; t.removeAttribute('src'); t.classList.add('broken'); } }, true);
