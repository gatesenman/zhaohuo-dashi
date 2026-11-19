// 找货大师 · 商品提取引擎：隐藏窗口加载平台搜索页 → 提取商品 → 返回结构化结果
const { BrowserWindow, session } = require('electron');

// 通用启发式提取脚本（在页面内执行）。cfg 为平台可选的 CSS 选择器配置。
const EXTRACT_FN = function (cfg, limit) {
  const abs = u => { try { return u ? new URL(u, location.href).href : ''; } catch { return ''; } };
  const txt = el => (el ? (el.innerText || el.textContent || '') : '').replace(/\s+/g, ' ').trim();
  const imgSrc = img => {
    if (!img) return '';
    const c = [img.currentSrc, img.getAttribute('data-src'), img.getAttribute('data-ks-lazyload'), img.getAttribute('data-original'), img.getAttribute('data-lazy-img'), img.getAttribute('data-lazyload'), img.getAttribute('src'),
      (img.getAttribute('srcset') || img.getAttribute('data-srcset') || '').split(/\s|,/)[0]].find(s => s && !/^data:image\/(gif|svg)/.test(s) && !/blank|placeholder|loading|grey\.gif|1x1/.test(s));
    return abs(c);
  };
  const bgImg = el => { const m = /url\(["']?([^"')]+)/.exec(getComputedStyle(el).backgroundImage || ''); return m ? abs(m[1]) : ''; };
  const PRICE = /[¥￥]\s*(\d{1,7}(?:\.\d{1,2})?)/;
  const PRICE2 = /(\d{1,7}(?:\.\d{1,2})?)\s*元/;
  const SALES = /((?:\d+(?:\.\d+)?\s*[万wW]\+?|(?<![\d.])\d+\+?))\s*(?:人付款|人收货|人已买|人买过|件已售|已售|销量|人评价|条评价|成交|笔成交|人想要|评价)|(?:已售|销量|月销|成交|已拼|总销量)\s*[:：]?\s*((?:\d+(?:\.\d+)?\s*[万wW]\+?|\d+\+?))(?![\d.])/;
  const parsePrice = s => { s = (s || '').replace(/\s+/g, ''); let m = PRICE.exec(s) || PRICE2.exec(s); if (m) return parseFloat(m[1]); m = /US\s?\$\s*(\d{1,6}(?:\.\d{1,2})?)/.exec(s); return m ? Math.round(parseFloat(m[1]) * 710) / 100 : null; };
  const parseSales = s => { const m = SALES.exec(s || ''); if (!m) return null; const v = (m[1] || m[2]).replace(/\s|\+/g, ''); const n = parseFloat(v) * (/[万wW]/.test(v) ? 10000 : 1); return isNaN(n) ? null : { n, text: m[0].trim() }; };
  const visibleImg = img => { const r = img.getBoundingClientRect(); return r.width >= 50 && r.height >= 50; };
  const out = [];
  const seen = new Set();
  const push = it => {
    if (!it.title || it.title.length < 4 || (it.price == null && !it.priceText) || !it.link) return;
    // 3.6：过滤二维码/APP 推广等垃圾卡片（世界工厂网、中国制造网常见）
    if (/二维码|扫码|扫一扫|微信扫|手机版|下载\s*APP|APP\s*下载|关注公众号|官方微信|小程序|在线客服|免费注册|立即登录/i.test(it.title)) return;
    if (/qr[_-]?code|erweima|ewm|\/qr[\/_.]|wxcode|weixin|wechat|app[_-]?down/i.test(it.image || '')) return;
    if (it.image && /^https?:\/\/[^/]+\/?$/.test(it.image)) return;
    if (it.price != null && (it.price <= 0 || it.price > 5e7)) return;
    const k = it.link.split('#')[0] + '|' + it.title.slice(0, 20); if (seen.has(k)) return; seen.add(k); out.push(it);
  };
  const fromCard = (card, sel = {}) => {
    const q = s => (s ? card.querySelector(s) : null);
    const imgs = [...card.querySelectorAll('img')].filter(visibleImg);
    const img = q(sel.image) || imgs.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
    const as = card.tagName === 'A' ? [card, ...card.querySelectorAll('a[href]')] : [...card.querySelectorAll('a[href]')];
    const dl = [card, ...card.querySelectorAll('[data-href],[data-url],[data-link]')].map(e => e.getAttribute && (e.getAttribute('data-href') || e.getAttribute('data-url') || e.getAttribute('data-link'))).find(Boolean);
    // 3.7：按“像商品详情页”打分选链接，避免选中店铺/展厅/列表链接（如中国制造网 showroom）
    const lsc = a => { const h = a.getAttribute('href') || ''; if (!h || /^(javascript|#)/i.test(h)) return -9; let s = 0;
      if (/item|detail|offer|\/prod|goods|\/p\/|sku|\/dp\/|gongying|supply\/|\/show\/|product\/|id=/i.test(h)) s += 5;
      if (/\d{6,}/.test(h)) s += 1;
      if (/showroom|shop|store|company|corp|list|search|category|\/s\?|login|cart|im\.|chat|tel:|mailto:/i.test(h)) s -= 4;
      if (img && a.contains(img)) s += 1; if (a.textContent && a.textContent.trim().length >= 6) s += 1; return s; };
    const link = q(sel.link) || [...as].sort((a, b) => lsc(b) - lsc(a)).find(a => lsc(a) > -9);
    const full = txt(card);
    let title = sel.title ? txt(q(sel.title)) : '';
    if (!title) {
      const cands = [img && img.alt, ...as.map(a => a.title), ...[...card.querySelectorAll('[title]')].map(e => e.title)].filter(Boolean);
      const lines = (card.innerText || '').split('\n').map(s => s.trim()).filter(s => s.length >= 6 && s.length <= 140 && !PRICE.test(s) && !/^[\d.¥￥\s+万]+$/.test(s) && !SALES.test(s));
      const bad = s => /^[\u4e00-\u9fa5]{2,6}[:：]/.test(s) || /(有限公司|有限责任公司|商行|经营部)$/.test(s) || /^(进店|找相似|加入购物车|立即购买)/.test(s);
      const good = arr => arr.filter(s => s && s.length >= 6 && s.length <= 140 && !bad(s));
      const named = good([...card.querySelectorAll('[class*=title] , [class*=name], [class*=Title], h3, h4')].filter(e => !/shop|store|company|co-name/i.test(e.className)).map(e => e.getAttribute('title') || txt(e)));
      title = named.sort((a, b) => b.length - a.length)[0] || good(cands).sort((a, b) => b.length - a.length)[0] || good(lines).sort((a, b) => b.length - a.length)[0] || '';
    }
    const price = parsePrice(sel.price ? txt(q(sel.price)) : full) ?? parsePrice(full);
    const priceText = price == null && /面议|询价|电议/.test(full) ? '面议' : '';
    const sales = parseSales(sel.sales ? txt(q(sel.sales)) : full);
    let shop = sel.shop ? txt(q(sel.shop)) : '';
    if (!shop) { const se = card.querySelector('[class*=shop],[class*=Shop],[class*=store],[class*=Store],[class*=seller],[class*=company],[class*=Company]'); shop = se ? txt(se).split(/\s{2,}|\n/)[0] : ''; }
    if (!shop) { const m = /([\u4e00-\u9fa5A-Za-z0-9·]{2,20}(?:旗舰店|专卖店|专营店|官方店|商行|公司|厂|店|批发部|档口))/.exec(full); shop = m ? m[1] : ''; }
    const wi = String((window.__wwI = (window.__wwI || 0) + 1)); card.setAttribute('data-ww-i', wi);
    return { wi, title: title.slice(0, 140), price, sales: sales ? sales.text : '', salesNum: sales ? sales.n : 0, shop: shop.slice(0, 40), image: img ? imgSrc(img) : bgImg(card), priceText, link: abs(link ? link.getAttribute('href') : (dl || (card.closest('a[href]') || {}).href || location.href)), noLink: !link && !dl };
  };
  // 1) 平台专用选择器
  if (cfg && cfg.item) { for (const card of document.querySelectorAll(cfg.item)) { push(fromCard(card, cfg)); if (out.length >= limit) break; } }
  // 2) 通用启发式：价格叶子节点 → 向上找到同时包含图片和链接的最小“卡片”
  if (out.length < 3) {
    const cards = new Set();
    const leaves = [...document.querySelectorAll('body *')].filter(el => {
      if (el.children.length > 3) return false;
      const t = (el.textContent || '').trim(); if (!t || t.length > 30) return false;
      return /[¥￥]/.test(t) || /price|Price|jiage/.test(el.className || '') && /\d|面议/.test(t);
    }).slice(0, 1500);
    for (const leaf of leaves) {
      let el = leaf;
      for (let i = 0; i < 9 && el && el !== document.body; i++, el = el.parentElement) {
        const r = el.getBoundingClientRect();
        if (r.width > innerWidth * 0.98 && r.height > 900) break;
        if ([...el.querySelectorAll('img')].some(visibleImg) && (el.tagName === 'A' || el.querySelector('a[href]') || el.closest('a[href]') || /^(LI)$/.test(el.tagName) || /item|card|goods|product/i.test(el.className || ''))) {
          if ((el.innerText || '').length < 800) cards.add(el);
          break;
        }
      }
    }
    // 去掉包含其他卡片的外层容器（保留最小卡片）
    const arr = [...cards].filter(c => ![...cards].some(o => o !== c && c.contains(o)));
    for (const c of arr) { push(fromCard(c)); if (out.length >= limit) break; }
  }
  const text = (document.body ? document.body.innerText : '').slice(0, 3000);
  return { items: out.slice(0, limit), url: location.href, title: document.title, text, h: document.documentElement.scrollHeight };
};

const LOGIN_RE = /(passport|login|signin|mlogin|plogin|mini_login|sso)[./?]/i;
const BLOCK_RE = /验证码|安全验证|滑块|拖动滑块|人机验证|身份核实|访问受限|访问被拒绝|请求过于频繁|captcha|verify|punish|risk_handler|Forbidden|Access Denied|Attention Required/i;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const within = (p, ms, v) => Promise.race([p, sleep(ms).then(() => v)]);

class Extractor {
  constructor() { this.wins = new Map(); this.running = 0; this.queue = []; this.max = 6; }
  async slot() { if (this.running < this.max) { this.running++; return; } await new Promise(r => this.queue.push(r)); this.running++; }
  release() { this.running--; const n = this.queue.shift(); if (n) n(); }
  win(key, partition, ua, mobile) {
    let w = this.wins.get(key);
    if (w && !w.isDestroyed()) return w;
    w = new BrowserWindow({ show: false, width: mobile ? 414 : 1366, height: mobile ? 896 : 2200, webPreferences: { partition, offscreen: false, backgroundThrottling: false, images: true, sandbox: true } });
    w.webContents.setAudioMuted(true);
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.wins.set(key, w); return w;
  }
  // 3.7：卡片没有 href（京东/苏宁/严选移动页用点击事件跳转）——在原搜索页里点击该卡片，截获跳转地址
  async resolve({ id, mobile, wi }) {
    const w = this.wins.get(id + (mobile ? ':m' : ':d')); if (!w || w.isDestroyed()) return null;
    const wc = w.webContents; const start = wc.getURL(); let got = null;
    const grab = u => { if (!got && u && /^https?:/.test(u) && u.split('#')[0] !== start.split('#')[0]) got = u; };
    const onNav = (ev, u) => { const url = typeof u === 'string' ? u : ev.url; if (/^https?:/.test(url) && url !== start) { grab(url); ev.preventDefault(); } };
    const onInPage = (_e, u) => grab(u);
    wc.on('will-navigate', onNav); wc.on('did-navigate-in-page', onInPage); wc.on('did-navigate', onInPage);
    const prevOpen = d => { grab(d.url); return { action: 'deny' }; }; wc.setWindowOpenHandler(prevOpen);
    try {
      await wc.executeJavaScript(`(() => { const c = document.querySelector('[data-ww-i="${String(wi).replace(/\D/g, '')}"]'); if (!c) return false; c.scrollIntoView({ block: 'center' }); const t = c.querySelector('img') || c; ['mousedown','mouseup','click'].forEach(n => t.dispatchEvent(new MouseEvent(n, { bubbles: true, cancelable: true, view: window }))); if (t.click) {} return true; })()`).catch(() => false);
      for (let i = 0; i < 30 && !got; i++) await sleep(200);
    } finally {
      wc.removeListener('will-navigate', onNav); wc.removeListener('did-navigate-in-page', onInPage); wc.removeListener('did-navigate', onInPage);
      wc.setWindowOpenHandler(() => ({ action: 'deny' }));
      if (got && wc.getURL() !== start) { try { wc.goBack(); } catch {} }
    }
    return got;
  }
  // job: { id, url, partition, ua, mobile, extractor, limit, timeout, upload: {file, trigger, triggerText} }
  async run(job, onStage) {
    await this.slot();
    const hard = (job.hardTimeout || 60000) + (job.upload ? 60000 : 0);
    const key = job.id + (job.mobile ? ':m' : ':d');
    const r = await within(this._run(job, onStage, key), hard, null);
    if (r) { this.release(); return r; }
    const w = this.wins.get(key); let tu = job.url, tt = '';
    if (w && !w.isDestroyed()) { try { tu = w.webContents.getURL() || tu; tt = await within(w.webContents.executeJavaScript('document.title + " :: " + (document.body ? document.body.innerText.replace(/\\s+/g, " ").slice(0, 150) : "")'), 2000, ''); if (process.env.WW_E2E) require('fs').writeFileSync(require('path').join(process.env.WW_E2E, 'snap-' + job.id + '.png'), (await within(w.webContents.capturePage(), 3000, null))?.toPNG() || Buffer.alloc(0)); } catch {} w.destroy(); }
    this.wins.delete(key);
    this.release();
    return { status: 'timeout', msg: '平台响应太慢，已跳过 ' + (tt || ''), items: [], ms: hard, url: tu };
  }
  async _run(job, onStage, key) {
    const w = this.win(key, job.partition, job.ua, job.mobile);
    const wc = w.webContents;
    const t0 = Date.now();
    try {
      wc.setUserAgent(job.ua);
      onStage && onStage('loading');
      let failed = null;
      const onFail = (_e, code, desc, _u, main) => { if (main && code !== -3) failed = { code, desc }; };
      wc.on('did-fail-load', onFail);
      await Promise.race([wc.loadURL(job.url).catch(() => {}), sleep(job.timeout || 25000)]);
      wc.removeListener('did-fail-load', onFail);
      if (failed) return { status: 'error', code: failed.code, msg: failed.desc, url: wc.getURL(), ms: Date.now() - t0, items: [] };
      if (job.typeQ) { onStage && onStage('typing'); await sleep(2500); await typeSearch(wc, job.typeQ); }
      if (job.upload) {
        onStage && onStage('uploading');
        const up = await within(job.upload(wc), 30000, { ok: false, msg: '上传图片超时' });
        if (!up.ok) return { status: 'error', msg: up.msg, url: wc.getURL(), ms: Date.now() - t0, items: [] };
        await sleep(6000);
      }
      onStage && onStage('extracting');
      let res = null;
      // 滚动触发懒加载，多次尝试提取，直到稳定
      for (let i = 0; i < (job.upload ? 2 : 4); i++) {
        await sleep(i === 0 ? 1800 : 1200);
        await within(wc.executeJavaScript(`window.scrollTo(0, ${(i + 1) * (job.mobile ? 1600 : 1400)});`).catch(() => {}), 3000);
        await sleep(500);
        await within(wc.executeJavaScript('window.scrollTo(0, 0)').catch(() => {}), 3000);
        res = await Promise.race([wc.executeJavaScript(`(${EXTRACT_FN.toString()})(${JSON.stringify(job.extractor || null)}, ${job.limit || 60})`).catch(e => ({ items: [], err: e.message })), sleep(8000).then(() => ({ items: [], err: 'timeout' }))]);
        if (res.items && res.items.length >= 10) break;
      }
      // 3.6：对“搜不到就显示默认列表”的站点（如一亩田）做相关性过滤：标题须包含关键词的任一双字片段
      if (job.relevant && job.q && res.items) { const qq = String(job.q).replace(/\s+/g, ''); const grams = qq.length < 2 ? [qq] : [...qq].slice(0, -1).map((c, i) => c + qq[i + 1]); res.items = res.items.filter(x => grams.some(g => (x.title || '').includes(g))); }
      const url = wc.getURL();
      let status = 'ok';
      if (!res.items || !res.items.length) {
        if (LOGIN_RE.test(url)) status = 'login';
        else if (BLOCK_RE.test(url + ' ' + (res.title || '') + ' ' + (res.text || '').slice(0, 400))) status = 'blocked';
        else status = 'empty';
      }
      let snap; if (status !== 'ok' && process.env.WW_E2E) { try { const f = require('path').join(process.env.WW_E2E, 'snap-' + job.id + '.png'); require('fs').writeFileSync(f, (await wc.capturePage()).toPNG()); snap = f; } catch {} }
      return { status, items: (res.items || []).map(x => ({ ...x, platform: job.id })), url, title: res.title, ms: Date.now() - t0, msg: status === 'ok' ? undefined : ('[' + (res.title || '').slice(0, 30) + '] ' + (res.text || '').replace(/\s+/g, ' ').slice(0, 160)), snap };
    } catch (e) {
      return { status: 'error', msg: e.message, items: [], ms: Date.now() - t0 };
    }
  }
  // 预热：空闲时提前打开平台首页，建立连接、加载 Cookie，首次搜索更快
  async warm(jobs) {
    for (const j of jobs) {
      const key = j.id + (j.mobile ? ':m' : ':d'); if (this.wins.has(key) || this.running >= 2) continue;
      const w = this.win(key, j.partition, j.ua, j.mobile); w.webContents.setUserAgent(j.ua);
      await within(w.webContents.loadURL(j.url).catch(() => {}), 15000);
    }
  }
  closeAll() { for (const w of this.wins.values()) if (!w.isDestroyed()) w.destroy(); this.wins.clear(); }
}

// 3.7：没有搜索 URL 的网站——打开首页，找到搜索框输入关键词并回车（必要时先点“搜索”入口）
const FIND_INPUT = `(() => { const vis = e => { const r = e.getBoundingClientRect(); return r.width > 20 && r.height > 8 && getComputedStyle(e).visibility !== 'hidden'; };
  const ins = [...document.querySelectorAll('input:not([type=hidden]):not([type=password]):not([type=checkbox]):not([type=radio]), textarea')].filter(vis);
  const sc = e => (/search|keyword|kw|query|^q$|word|sousuo|so/i.test((e.name||'')+' '+(e.id||'')+' '+(e.className||'')) ? 2 : 0) + (/搜|search|找/i.test(e.placeholder||'') ? 3 : 0) + (e.type === 'search' ? 3 : 0);
  ins.sort((a, b) => sc(b) - sc(a)); const i = ins[0]; if (i && sc(i) > 0) { i.scrollIntoView({block:'center'}); i.focus(); i.click(); return 'input'; }
  const t = [...document.querySelectorAll('a,div,span,button,i')].filter(vis).find(e => /search|sousuo/i.test(e.className + ' ' + (e.id||'')) || /^\s*(搜索|搜一搜|搜商品|搜你想要的.*)\s*$/.test(e.textContent || '') && e.children.length < 3);
  if (t) { t.click(); return 'clicked'; } return 'none'; })()`;
async function typeSearch(wc, q) {
  let r = await wc.executeJavaScript(FIND_INPUT).catch(() => 'none');
  if (r === 'clicked') { await sleep(2500); r = await wc.executeJavaScript(FIND_INPUT).catch(() => 'none'); }
  if (r !== 'input') return false;
  await wc.executeJavaScript(`(() => { const i = document.activeElement; if (i && 'value' in i) { const s = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(i), 'value').set; s.call(i, ''); i.dispatchEvent(new Event('input', {bubbles:true})); } })()`).catch(() => {});
  const u0 = wc.getURL(); wc.focus(); await wc.insertText(q); await sleep(500);
  for (const type of ['keyDown', 'char', 'keyUp']) wc.sendInputEvent({ type, keyCode: 'Enter' });
  await sleep(1500);
  if (wc.getURL() === u0) await wc.executeJavaScript(`(() => { const b = [...document.querySelectorAll('button,a,span,div,i,input[type=submit]')].find(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (/^\\s*(搜索|搜 索|搜)\\s*$/.test(e.textContent || e.value || '') && e.children.length < 2); }); if (b) b.click(); return !!b; })()`).catch(() => {});
  await sleep(4000); return true;
}
module.exports = { typeSearch, Extractor, EXTRACT_FN, LOGIN_RE };
