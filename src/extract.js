// 找货大师 · 商品提取引擎：隐藏窗口加载平台搜索页 → 提取商品 → 返回结构化结果
const { BrowserWindow, session } = require('electron');
const lib = require('./extract-lib');
const { EXTRACT_FN, walkJson, tryParseJson, collectPriceMap, finalizeItems } = lib;

const LOGIN_RE = /(passport|login|signin|mlogin|plogin|mini_login|sso)[./?]|\/login\.html?|login\.taobao|login\.tmall|login\.jd/i;
const BLOCK_RE = /验证码|安全验证|滑块|拖动滑块|人机验证|身份核实|访问受限|访问被拒绝|请求过于频繁|请完成验证|captcha|verify|punish|risk_handler|Forbidden|Access Denied|Attention Required/i;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const within = (p, ms, v) => Promise.race([p, sleep(ms).then(() => v)]);

// 把页面提取脚本与 JSON 遍历一起注入（EXTRACT_FN 依赖同文件导出的纯函数）
function injectExtract(cfg, limit) {
  return `(() => {
    const parsePrice = ${lib.parsePrice.toString()};
    const parseSales = ${lib.parseSales.toString()};
    const isJunkTitle = ${lib.isJunkTitle.toString()};
    const isJunkImage = ${lib.isJunkImage.toString()};
    const firstStr = ${lib.firstStr.toString()};
    const productUrlFrom = ${lib.productUrlFrom.toString()};
    const pickId = ${lib.pickId.toString()};
    const pickTitle = ${lib.pickTitle.toString()};
    const pickImage = ${lib.pickImage.toString()};
    const pickPrice = ${lib.pickPrice.toString()};
    const pickPriceText = ${lib.pickPriceText.toString()};
    const pickShop = ${lib.pickShop.toString()};
    const pickSales = ${lib.pickSales.toString()};
    const walkJson = ${lib.walkJson.toString()};
    const collectPriceMap = ${lib.collectPriceMap.toString()};
    const finalizeItems = ${lib.finalizeItems.toString()};
    const tryParseJson = ${lib.tryParseJson.toString()};
    return (${EXTRACT_FN.toString()})(${JSON.stringify(cfg || null)}, ${limit || 60});
  })()`;
}

function looksLikeApi(url, mime) {
  if (/\.(png|jpe?g|gif|webp|svg|ico|css|woff2?|ttf|mp4|mp3|m4s)(\?|$)/i.test(url)) return false;
  if (/json|javascript|text\/plain/i.test(mime || '')) return true;
  return /search|mtop|ajax|\/api|goods|product|item|ware|offer|sku|list|sycm|h5api|h5stk|jumbo|render|query/i.test(url || '');
}

// 仅在隐藏提取窗口上挂调试器拦截 XHR/fetch JSON；用完立即卸掉，不影响用户可见窗口。
function attachNetworkCapture(wc) {
  const dbg = wc.debugger;
  const roots = [];
  const pending = new Map();
  let attachedHere = false;
  const onMsg = async (_e, method, params) => {
    try {
      if (method === 'Network.responseReceived' && params && params.response) {
        const url = params.response.url || '';
        const mime = (params.response.mimeType || '') + ' ' + ((params.response.headers && (params.response.headers['content-type'] || params.response.headers['Content-Type'])) || '');
        if (looksLikeApi(url, mime) && /XHR|Fetch|Document|Other/i.test(params.type || 'XHR')) pending.set(params.requestId, { url, mime });
      }
      if (method === 'Network.loadingFinished' && params && pending.has(params.requestId)) {
        const meta = pending.get(params.requestId); pending.delete(params.requestId);
        try {
          const body = await dbg.sendCommand('Network.getResponseBody', { requestId: params.requestId });
          let text = body.body || '';
          if (body.base64Encoded) text = Buffer.from(text, 'base64').toString('utf8');
          const json = tryParseJson(text);
          if (json) roots.push({ url: meta.url, data: json });
        } catch {}
      }
    } catch {}
  };
  return {
    async start() {
      try {
        if (!dbg.isAttached()) { dbg.attach('1.3'); attachedHere = true; }
        dbg.on('message', onMsg);
        await dbg.sendCommand('Network.enable', { maxResourceBufferSize: 5 * 1024 * 1024, maxTotalBufferSize: 20 * 1024 * 1024 });
      } catch (e) { /* 调试器不可用时退回 DOM/内嵌 JSON */ }
    },
    roots: () => roots,
    async stop() {
      try { dbg.removeListener('message', onMsg); } catch {}
      if (attachedHere) try { dbg.detach(); } catch {}
    }
  };
}

function mergeItems(base, extra, limit) {
  const out = (base || []).slice();
  const seen = new Set(out.map(it => (it.link || '') + '|' + String(it.title || '').slice(0, 20) + '|' + (it.price ?? it.priceText ?? '')));
  for (const it of extra || []) {
    if (out.length >= (limit || 60)) break;
    const k = (it.link || '') + '|' + String(it.title || '').slice(0, 20) + '|' + (it.price ?? it.priceText ?? '');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

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
    const r = await within(this._run(job, onStage, key, Date.now() + hard - 4000), hard, null);
    if (r) { this.release(); return r; }
    const w = this.wins.get(key); let tu = job.url, tt = '';
    if (w && !w.isDestroyed()) { try { tu = w.webContents.getURL() || tu; tt = await within(w.webContents.executeJavaScript('document.title + " :: " + (document.body ? document.body.innerText.replace(/\\s+/g, " ").slice(0, 150) : "")'), 2000, ''); if (process.env.WW_E2E) require('fs').writeFileSync(require('path').join(process.env.WW_E2E, 'snap-' + job.id + '.png'), (await within(w.webContents.capturePage(), 3000, null))?.toPNG() || Buffer.alloc(0)); } catch {} w.destroy(); }
    this.wins.delete(key);
    this.release();
    return { status: 'timeout', msg: '平台响应太慢，已跳过 ' + (tt || ''), items: [], ms: hard, url: tu };
  }
  async _run(job, onStage, key, deadline) {
    const w = this.win(key, job.partition, job.ua, job.mobile);
    const wc = w.webContents;
    const t0 = Date.now();
    const remain = () => Math.max(0, deadline - Date.now());
    const cap = attachNetworkCapture(wc);
    try {
      wc.setUserAgent(job.ua);
      onStage && onStage('loading');
      let failed = null;
      const onFail = (_e, code, desc, _u, main) => { if (main && code !== -3) failed = { code, desc }; };
      wc.on('did-fail-load', onFail);
      await cap.start();
      await Promise.race([wc.loadURL(job.url).catch(() => {}), sleep(Math.min(job.timeout || 25000, remain()))]);
      wc.removeListener('did-fail-load', onFail);
      if (failed) { await cap.stop(); return { status: 'error', code: failed.code, msg: failed.desc, url: wc.getURL(), ms: Date.now() - t0, items: [] }; }
      if (job.typeQ) { onStage && onStage('typing'); await sleep(Math.min(2500, remain())); await typeSearch(wc, job.typeQ); }
      if (job.upload) {
        onStage && onStage('uploading');
        const up = await within(job.upload(wc), 30000, { ok: false, msg: '上传图片超时' });
        if (!up.ok) { await cap.stop(); return { status: 'error', msg: up.msg, url: wc.getURL(), ms: Date.now() - t0, items: [] }; }
        await sleep(Math.min(6000, remain()));
      }
      onStage && onStage('extracting');
      // 抖音/快手网页搜索默认综合或视频 Tab，点「商品」再抽（公开指南仍用 type=general + 点 Tab）
      await this._clickGoodsTab(wc);
      await this._waitForContent(wc, Math.min(16000, Math.max(0, remain() - 8000)), job.mobile);
      let res = { items: [] };
      const doExtract = async () => {
        const page = await Promise.race([
          wc.executeJavaScript(injectExtract(job.extractor || null, job.limit || 60)).catch(e => ({ items: [], err: e.message })),
          sleep(8000).then(() => ({ items: [], err: 'timeout' }))
        ]);
        let items = (page && page.items) || [];
        const host = (() => { try { return new URL(wc.getURL() || job.url || '').hostname; } catch { return ''; } })();
        const netItems = [];
        const priceMap = {};
        for (const r of cap.roots()) {
          try { netItems.push(...walkJson(r.data, host, job.limit || 60)); collectPriceMap(r.data, priceMap); } catch {}
        }
        items = finalizeItems(mergeItems(items, netItems, (job.limit || 60) * 2), priceMap, job.limit || 60);
        return { ...(page || {}), items };
      };
      res = await doExtract();
      // 不足 3 条时再滚一次、再抽一到两轮（不突破总时限）
      for (let i = 0; i < 2 && (res.items || []).length < 3 && remain() > 5000; i++) {
        await this._scrollBurst(wc, job.mobile);
        await sleep(Math.min(2000, remain()));
        const again = await doExtract();
        if ((again.items || []).length > (res.items || []).length) res = again;
      }
      await cap.stop();
      // 3.6：对“搜不到就显示默认列表”的站点（如一亩田）做相关性过滤：标题须包含关键词的任一双字片段
      if (job.relevant && job.q && res.items) { const qq = String(job.q).replace(/\s+/g, ''); const grams = qq.length < 2 ? [qq] : [...qq].slice(0, -1).map((c, i) => c + qq[i + 1]); res.items = res.items.filter(x => grams.some(g => (x.title || '').includes(g))); }
      const url = wc.getURL();
      let status = 'ok';
      if (!res.items || !res.items.length) {
        const blob = url + ' ' + (res.title || '') + ' ' + (res.text || '').slice(0, 400);
        if (LOGIN_RE.test(url) || /请(?:先)?登录|登录后|立即登录/.test(res.text || '')) status = 'login';
        else if (BLOCK_RE.test(blob)) status = 'blocked';
        else status = 'empty';
      }
      let snap; if (status !== 'ok' && process.env.WW_E2E) { try { const f = require('path').join(process.env.WW_E2E, 'snap-' + job.id + '.png'); require('fs').writeFileSync(f, (await wc.capturePage()).toPNG()); snap = f; } catch {} }
      return { status, items: (res.items || []).map(x => ({ ...x, platform: job.id })), url, title: res.title, ms: Date.now() - t0, msg: status === 'ok' ? undefined : ('[' + (res.title || '').slice(0, 30) + '] ' + (res.text || '').replace(/\s+/g, ' ').slice(0, 160)), snap };
    } catch (e) {
      try { await cap.stop(); } catch {}
      return { status: 'error', msg: e.message, items: [], ms: Date.now() - t0 };
    }
  }
  async _clickGoodsTab(wc) {
    try {
      const hit = await within(wc.executeJavaScript(`(() => {
        const host = location.hostname || '';
        if (!/douyin\\.com|kuaishou\\.com/.test(host)) return false;
        const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const t = [...document.querySelectorAll('a,div,span,button,li')].filter(vis).find(e => /^\\s*商品\\s*$/.test((e.innerText || e.textContent || '').trim()) && e.children.length < 4);
        if (t) { t.click(); return true; }
        return false;
      })()`).catch(() => false), 3000, false);
      if (hit) await sleep(2000);
    } catch {}
  }
  async _scrollBurst(wc, mobile) {
    const step = mobile ? 1600 : 1400;
    await within(wc.executeJavaScript(`window.scrollTo(0, ${step});`).catch(() => {}), 3000);
    await sleep(400);
    await within(wc.executeJavaScript(`window.scrollTo(0, ${step * 2});`).catch(() => {}), 3000);
    await sleep(400);
    await within(wc.executeJavaScript('window.scrollTo(0, 0)').catch(() => {}), 3000);
  }
  // 等到价格/卡片/内嵌 JSON 出现，或达到上限。期间滚动以触发懒加载。
  async _waitForContent(wc, budget, mobile) {
    const t0 = Date.now();
    let i = 0;
    while (Date.now() - t0 < budget) {
      const ready = await within(wc.executeJavaScript(`(() => {
        const t = document.body ? document.body.innerText : '';
        if (/[¥￥]|面议|询价|电议|&yen;|\\\\u00a5/.test(t)) return 'price';
        if (window.__NEXT_DATA__ || window.__INITIAL_STATE__ || window.g_page_config || window.__INITIAL_DATA__ || window.rawData) return 'json';
        if (document.querySelectorAll('[class*=pro-item],[class*=gl-item],[class*=goodsCard],[class*=Card--],#search_nature_rg li,img').length > 8) return 'dom';
        return '';
      })()`).catch(() => ''), 3000, '');
      if (ready === 'price' || ready === 'json' || (ready === 'dom' && i >= 1)) {
        // 再略滚一次让懒图加载
        await this._scrollBurst(wc, mobile);
        return ready;
      }
      await this._scrollBurst(wc, mobile);
      await sleep(800);
      i++;
    }
    await this._scrollBurst(wc, mobile);
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

// 3.7 / 3.8：没有搜索 URL 的网站——打开首页，找到搜索框输入关键词并回车（必要时先点“搜索”入口）
const FIND_INPUT = `(() => { const vis = e => { const r = e.getBoundingClientRect(); return r.width > 20 && r.height > 8 && getComputedStyle(e).visibility !== 'hidden'; };
  const ins = [...document.querySelectorAll('input:not([type=hidden]):not([type=password]):not([type=checkbox]):not([type=radio]), textarea')].filter(vis);
  const sc = e => (/search|keyword|kw|query|^q$|word|sousuo|so/i.test((e.name||'')+' '+(e.id||'')+' '+(e.className||'')) ? 2 : 0) + (/搜|search|找|想买|想要|找货|货源|输入商品|搜搜/i.test(e.placeholder||'') ? 3 : 0) + (e.type === 'search' ? 3 : 0) + (e.getAttribute('enterkeyhint') === 'search' ? 2 : 0);
  ins.sort((a, b) => sc(b) - sc(a)); const i = ins[0]; if (i && sc(i) > 0) { i.scrollIntoView({block:'center'}); i.focus(); i.click(); return 'input'; }
  const t = [...document.querySelectorAll('a,div,span,button,i')].filter(vis).find(e => /search|sousuo/i.test(e.className + ' ' + (e.id||'')) || /^\\s*(搜索|搜一搜|搜商品|搜你想要的.*|想买点什么.*)\\s*$/.test(e.textContent || '') && e.children.length < 3);
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
module.exports = { typeSearch, Extractor, EXTRACT_FN, LOGIN_RE, walkJson, injectExtract };
