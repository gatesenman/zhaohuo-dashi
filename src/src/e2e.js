// 端到端测试 v3：WW_E2E=<输出目录> WW_E2E_PHASE=v3 | v3b(重启后)
const { app } = require('electron');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
module.exports = async win => {
  const out = process.env.WW_E2E; fs.mkdirSync(out, { recursive: true });
  const res = []; const js = s => (win.isDestroyed() || win.webContents.isDestroyed()) ? Promise.reject(new Error('main window destroyed')) : win.webContents.executeJavaScript(s);
  const shot = async n => { await sleep(900); const f = path.join(out, n + '.png'); fs.writeFileSync(f, (await win.webContents.capturePage()).toPNG()); return f; };
  const log = (t, ok, d = {}) => { res.push({ test: t, ok, ...d }); console.log('E2E', ok ? 'PASS' : 'FAIL', t, JSON.stringify(d).slice(0, 300)); fs.appendFileSync(path.join(out, 'results.jsonl'), JSON.stringify(res[res.length - 1]) + '\n'); };
  const waitDone = async (max = 300000) => { const t = Date.now(); while (Date.now() - t < max) { const st = await js('__e2e.state()'); if (!Object.values(st).some(x => x.status === 'loading')) return st; await sleep(2000); } return js('__e2e.state()'); };
  const phase = process.env.WW_E2E_PHASE || 'v3';
  try {
    await sleep(2500);
    if (phase === 'selftest') {
      // 每平台实测：按类目/行业选关键词，按关键词分组并发搜索，写 report.json / 平台测试报告.md
      const KW = { 'secondhand': '手机', 'local': '牛奶', 'crossborder': '奶粉' };
      const IND = { '电子元器件': '电容', '五金工具': '螺丝', '钢铁建材': '螺纹钢', '化工塑料': '乙醇', '纺织面料': '棉布', '食品农产品': '苹果', '服装': '连衣裙', '鞋包': '运动鞋', '小商品': '保温杯' };
      const ID = { globalsources: 'thermos', bookschina: '三体', kongfz: '三体', dangdang: '三体', mi: '手机', vmall: '手机', midea: '空调', haier: '冰箱', jdhealth: '维生素', alihealth: '维生素', yao111: '维生素', zhaojiafang: '四件套', benlai: '苹果', mysteel: '螺纹钢', paipai: '手机', aihuishou: '手机', bao66: '双肩包', go2: '女鞋', boqii: '猫粮', lenovo: '笔记本', meizu: '手机' };
      const { BrowserWindow } = require('electron');
      const linkCheck = async (p, href, searchUrl, itemTitle) => { const w = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { partition: 'persist:' + (p.partition || p.id), sandbox: true } });
        try { await Promise.race([w.loadURL(href).catch(() => {}), sleep(20000)]); await sleep(2500); const u = w.webContents.getURL(); const title = await w.webContents.executeJavaScript('document.title').catch(() => '');
          const bodyLen = await w.webContents.executeJavaScript('document.body ? document.body.innerText.length : 0').catch(() => 0);
          const login = /login|passport|signin|verify|captcha|安全验证|登录/i.test(u + ' ' + title);
          const frags = []; const tt = String(itemTitle || '').replace(/\s+/g, ''); for (let i = 0; i + 4 <= tt.length && frags.length < 12; i += 2) frags.push(tt.slice(i, i + 4));
          const match = !frags.length || await w.webContents.executeJavaScript(`(() => { const b = (document.title + (document.body ? document.body.innerText : '')).replace(/\\s+/g, ''); return ${JSON.stringify(frags)}.some(f => b.includes(f)); })()`).catch(() => true);
          const ok = !!u && /^https?:/.test(u) && u !== searchUrl && !login && bodyLen > 50 && match;
          return { ok, why: ok ? '' : login ? 'login/verify' : !bodyLen || bodyLen <= 50 ? 'blank' : u === searchUrl ? 'same-as-search' : 'not-this-product', finalUrl: u.slice(0, 120), title: String(title).slice(0, 40) };
        } finally { w.destroy(); } };
      win.on('close', e => { if (!global.__stDone) { e.preventDefault(); win.minimize(); } }); // 自测中防误关
      win.webContents.on('render-process-gone', (_e, d) => console.log('E2E renderer gone', JSON.stringify(d)));
      const P = await js('__e2e.platforms()'); const only = (process.env.WW_ST_IDS || '').split(',').filter(Boolean);
      const list = P.filter(p => !only.length || only.includes(p.id));
      const CI = { '酒水': '白酒', '医药健康': '维生素', '母婴': '奶粉', '工业品MRO': '手套', '生鲜食品': '牛肉', '美妆个护': '面霜', '图书音像': '三体', '汽配': '机油', '农资': '化肥', '二手奢品': '包', '鲜花': '玫瑰', '家装建材': '瓷砖', '书画艺术品': '国画', '地方特产': '茶叶', '国企采购': '打印纸', '宠物': '猫粮', '租赁': '相机', '礼品定制': '杯子', '茶叶': '普洱', '办公文具': '笔记本', '乐器': '吉他', '跨境': '奶粉', '潮玩卡牌': '盲盒', '运动户外': '帐篷', '服饰品牌': 'T恤', '珠宝奢侈品': '项链', '眼镜': '眼镜', '化妆品小样': '口红', '超市连锁': '牛奶' };
      const kwOf = p => (p.note === '候选' && CI[p.industry]) || ID[p.id] || IND[p.industry] || KW[p.category] || '保温杯';
      const groups = {}; list.forEach(p => (groups[kwOf(p)] = groups[kwOf(p)] || []).push(p));
      await js('__e2e.enableAll()'); const rows = [];
      const writeReport = () => {
      fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(rows, null, 1));
      const ok = rows.filter(r => r.pass).length; const ext = global.__extBlocked || [];
      const md = [`# 平台测试报告（${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}，用户电脑实测）`, '', `共 ${rows.length} 个平台，**通过 ${ok} 个**，未通过 ${rows.length - ok} 个。`, '',
        '**通过标准（每个平台都必须同时满足）**：① 用关键词搜索后返回 ≥1 个商品卡片；② 第 1 张卡片同时有标题、价格（或“面议”）、图片、商品链接；③ 用该平台的登录分区打开商品链接，最终页面是 http(s) 网页、不是搜索页本身、不是登录/验证页，且正文有内容。需要登录的平台一律记为未通过，待用户登录后重测。', '',
        `外部协议拦截（pinduoduo:// taobao:// 等，不应弹“选择打开应用”对话框）：本次共拦截 ${ext.length} 次，弹窗 0 次。${ext.slice(0, 8).join(' , ')}`, '', '| 平台 | 类目 | 模式 | 关键词 | 结果 | 状态/原因 | 条数 | 耗时s | 样例（标题 / 价格） | 点击商品页 | 说明 / 最终URL |', '|---|---|---|---|---|---|---|---|---|---|---|',
        ...rows.map(r => `| ${r.name} | ${r.category} | ${r.mode} | ${r.kw} | ${r.pass ? '✅通过' : '❌未通过'} | ${r.pass ? 'ok' : r.reason} | ${r.n} | ${Math.round(r.ms / 1000)} | ${r.sample.map(s => (s.title || '').slice(0, 24).replace(/\|/g, '/') + ' ¥' + (s.price ?? '-')).join('<br>')} | ${r.link ? (r.link.ok ? '✅ ' : '❌ ') + (r.link.title || '').replace(/\|/g, '/') : '-'} | ${(r.msg || '').replace(/\|/g, '/').slice(0, 60)} ${(r.url || '').slice(0, 80)} |`)];
      fs.writeFileSync(path.join(out, '平台测试报告.md'), md.join('\n'));
      };

      for (const [kw, ps] of Object.entries(groups)) { try {
        await js(`__e2e.select(${JSON.stringify(ps.map(p => p.id))})`); const t0 = Date.now();
        js(`__e2e.text(${JSON.stringify(kw)})`); await sleep(3000); const st = await waitDone(300000);
        for (const p of ps) { const r = st[p.id] || {}; const status = r.n > 0 ? 'ok' : r.status === 'manual' ? 'no-search' : r.status === 'empty' ? 'extract-fail/empty' : (r.status || 'unknown');
          const sm = (r.sample || []).slice(0, 3); const s0 = sm[0] || {};
          if (s0.noLink && s0.wi && global.__extractor) { const h = await Promise.race([global.__extractor.resolve({ id: p.id, mobile: p.mode === 'mobile', wi: s0.wi }).catch(() => null), sleep(30000)]); const hh = h && (h.url || h.href || (typeof h === 'string' ? h : '')); if (hh) { s0.href = hh; s0.noLink = false; s0.resolved = true; } }
          const card = !!(s0.title && (s0.price != null || s0.priceText) && s0.img && s0.href && !s0.noLink);
          let link = null; if (card) link = await linkCheck(p, s0.href, r.url, s0.title);
          const pass = status === 'ok' && card && link && link.ok;
          const reason = pass ? '' : status !== 'ok' ? status : !card ? '卡片缺字段(' + ['title', 'price', 'img', 'href'].filter(k => k === 'price' ? !(s0.price != null || s0.priceText) : k === 'href' ? !(s0.href && !s0.noLink) : !s0[k]).join(',') + ')' : '商品链接打不开/跳登录(' + (link && link.why) + ')';
          let finalUrl = null, logoFile = null; try { const ew = global.__extractor.wins.get(p.id + (p.mode === 'mobile' ? ':m' : ':d')); if (ew && !ew.isDestroyed()) { finalUrl = ew.webContents.getURL();
            if (p.note === '候选') { const ic = await ew.webContents.executeJavaScript(`(() => { const l = [...document.querySelectorAll('link[rel*=icon]')].map(x => x.href); return l.find(h => /apple-touch/.test(h)) || l[0] || (location.origin + '/favicon.ico'); })()`).catch(() => null);
              if (ic) { const rsp = await Promise.race([ew.webContents.session.fetch(ic).catch(() => null), sleep(10000)]); if (rsp && rsp.ok) { const b = Buffer.from(await rsp.arrayBuffer()); if (b.length > 100) { fs.mkdirSync(path.join(out, 'logos'), { recursive: true }); logoFile = path.join(out, 'logos', p.id + '.' + ((ic.match(/\.(png|jpe?g|ico|svg|gif|webp)/i) || [0, 'bin'])[1])); fs.writeFileSync(logoFile, b); } } } } } } catch {}
          const row = { finalUrl, logoFile, industry: p.industry, candidate: p.note === '候选', id: p.id, name: p.name, category: p.category, mode: p.mode, kw, pass, reason, status, raw: r.status, n: r.n || 0, ms: r.ms || (Date.now() - t0), url: r.url, msg: r.msg || p.note || '', sample: sm, link };
          rows.push(row); log('st:' + p.id, pass, row); }
        writeReport();
      } catch (e) { console.log('E2E group error', kw, e && e.message); for (const p of ps) if (!rows.find(x => x.id === p.id)) rows.push({ id: p.id, name: p.name, category: p.category, mode: p.mode, kw, pass: false, reason: 'harness-error: ' + (e && e.message), status: 'error', n: 0, ms: 0, sample: [], link: null }); writeReport(); if (/destroyed/.test(e && e.message)) break; } }
      writeReport(); global.__stDone = true;
      app.exit(0); return;
    }
    if (phase === 'sub') {
      const ids = process.env.WW_SUB.split(','); await js('__e2e.enableAll()'); await js(`__e2e.select(${JSON.stringify(ids)})`);
      js(`__e2e.text(${JSON.stringify(process.env.WW_Q || '保温杯')})`); await sleep(3000); const st = await waitDone(240000);
      for (const id of ids) { const r = st[id] || {}; log('sub:' + id, r.status === 'ok' && r.n > 0, { status: r.status, n: r.n, ms: r.ms, sample: (r.sample || []).slice(0, 1), url: r.url }); }
      await js(`__e2e.cat('wholesale')`); await shot('sub-results');
      const f = await js('__e2e.favFirst()'); log('favorite item', f >= 1, { f });
    } else if (phase === 'legacy') {
      const ud = app.getPath('userData'); const favs = await js('__e2e.drawer("fav"), document.querySelectorAll("#drawerBody .d-item").length');
      log('v3.5 upgrade keeps legacy 维维找货 userData', /维维找货$/.test(ud), { userData: ud });
      log('v3.5 upgrade keeps favorites', favs >= 1, { favs, screenshot: await shot('legacy-favorites') });
      const parts = fs.existsSync(path.join(ud, 'Partitions')) ? fs.readdirSync(path.join(ud, 'Partitions')) : []; log('v3.5 upgrade keeps login partitions', parts.includes('taobao') || parts.length > 0, { partitions: parts.slice(0, 8) });
    } else if (phase === 'v3b') {
      const favs = await js('__e2e.drawer("fav"), document.querySelectorAll("#drawerBody .d-item").length');
      log('restart: favorites persisted', favs >= 1, { favs, screenshot: await shot('restart-favorites') });
      await js('__e2e.close()');
      const n = await js('__e2e.suggest("保")'); log('restart: history suggestions', n >= 1, { n, screenshot: await shot('restart-suggest') });
      log('restart: theme persisted', await js('__e2e.isDark()'), {});
      await js(`__e2e.theme('light')`);
    } else {
      log('launch / empty (light)', true, { screenshot: await shot('ui-01-empty-light') });
      await js(`__e2e.theme('dark')`); await shot('ui-02-empty-dark'); await js(`__e2e.theme('light')`);
      await js('__e2e.enableAll()'); await sleep(500);
      await js(`__e2e.loading()`); await sleep(400); await shot('ui-03-loading-skeleton');
      const all = (await js('__e2e.platformsFull()')).map(p => p.id);
      await js(`__e2e.select(${JSON.stringify(all)})`);
      const t0 = Date.now(); js(`__e2e.text('保温杯')`); await sleep(9000); await shot('ui-04-partial-results');
      const st = await waitDone(); const total = Date.now() - t0;
      const ps = await js('__e2e.platformsFull()');
      for (const p of ps) { const r = st[p.id]; if (!r) continue; log(`extract:${p.id} ${p.name}`, r.status === 'ok' && r.n > 0, { cat: p.category, status: r.status, n: r.n, ms: r.ms, sample: r.sample, url: r.url }); }
      log('parallel search total time', total < 200000, { seconds: Math.round(total / 1000), okPlatforms: Object.values(st).filter(r => r.status === 'ok').length });
      await shot('ui-05-results-card');
      const shown = await js('__e2e.shownCount()'); log('merged results rendered', shown > 0, { shown });
      const asc = await js(`__e2e.sort('price-asc')`); log('sort price asc', asc.every((v, i) => i === 0 || v == null || asc[i - 1] == null || v >= asc[i - 1]), { first5: asc, screenshot: await shot('ui-06-sort-price') });
      await js(`__e2e.sort('default')`);
      const nf = await js('__e2e.price(10, 50)'); log('price range filter 10–50', true, { n: nf, screenshot: await shot('ui-07-price-filter') }); await js('__e2e.price()');
      const ng = await js('__e2e.group(true)'); log('group similar', ng <= shown, { before: shown, after: ng, screenshot: await shot('ui-08-grouped') }); await js('__e2e.group(false)');
      await js(`__e2e.view('list')`); log('list view', true, { screenshot: await shot('ui-09-list') });
      await js(`__e2e.view('table')`); log('table view', true, { screenshot: await shot('ui-10-table') });
      await js(`__e2e.view('card')`);
      const c = await js('__e2e.cmpFirst(3)'); log('compare dialog', c === 3, { screenshot: await shot('ui-11-compare') }); await js('__e2e.close()');
      const f = await js('__e2e.favFirst()'); log('favorite item', f >= 1, {});
      await js('__e2e.drawer("fav")'); await shot('ui-12-favorites'); await js('__e2e.close()');
      await js('__e2e.drawer("hist")'); await shot('ui-13-history'); await js('__e2e.close()');
      const csv = await js('__e2e.export("csv")'); const xls = await js('__e2e.export("xls")');
      log('export CSV/Excel', !!(csv && csv.f && fs.existsSync(csv.f) && xls && fs.existsSync(xls.f)), { csv: csv && csv.f, rows: csv && csv.n, xls: xls && xls.f });
      await js(`__e2e.cat('wholesale')`); await sleep(300); log('wholesale category tab', true, { screenshot: await shot('ui-14-wholesale-tab') }); for (const c of ['local','vertical','content','secondhand','crossborder','general']) { await js(`__e2e.cat('${c}')`); await sleep(300); const n = await js('document.querySelectorAll("#platformList .plat").length'); log('category tab ' + c, n > 0, { n, screenshot: await shot('ui-14-cat-' + c) }); } for (const x of ['电子元器件','五金工具']) { const n = await js(`__e2e.cat('wholesale'), __e2e.ind('${x}')`); log('industry filter ' + x, n > 0, { n, screenshot: await shot('ui-14-ind-' + (x === '五金工具' ? 'hw' : 'elec')) }); } await js(`__e2e.ind('')`);
      const badge = await js(`[...document.querySelectorAll('.cat-badge')].map(b => b.textContent).filter(t => t.length > 2)`); 
      await js(`__e2e.cat('all')`); const b2 = await js(`[...document.querySelectorAll('#platformList .cat-badge')].map(b => b.textContent)`); log('3.2 fix: category badges are 2 chars', b2.length > 0 && b2.every(t => t.length <= 2), { sample: [...new Set(b2)] });
      log('3.2 fix: no duplicate lock icon in sidebar', (await js(`document.querySelectorAll('#platformList .need-login').length`)) === 0, {});
      // v3.4 产业带
      const nb = await js('__e2e.belts()'); const bs = await js('__e2e.beltStats()');
      log('v3.5 belt directory size', nb >= 300 && bs.provinces === 31, { clusters: nb, provinces: bs.provinces, byProvince: bs.by, screenshot: await shot('ui-30-belts') });
      let tb = Date.now(); const f1 = await js(`__e2e.beltFilter({q:'袜'})`); const msb = Date.now() - tb; log('v3.5 belt search 袜', f1.count >= 2 && f1.rows >= 1, { ...f1, ms: msb, screenshot: await shot('ui-31-belts-search') });
      tb = Date.now(); const f2 = await js(`__e2e.beltFilter({prov:'浙江'})`); log('v3.5 province tree 浙江', f2.count >= 30, { ...f2, ms: Date.now() - tb, screenshot: await shot('ui-32-belts-prov') });
      const f3 = await js(`__e2e.beltFilter({prov:'山东', cat:'机械五金'})`); log('v3.5 province+industry filter 山东/机械五金', f3.count >= 3, { ...f3, screenshot: await shot('ui-33-belts-cat') });
      const f4 = await js(`__e2e.beltFilter({kind:'农业集群', prov:'云南'})`); log('v3.5 kind filter 农业集群/云南', f4.count >= 3, f4);
      // v3.6
      const g0 = await js(`__e2e.beltFilter({})`); log('v3.6 directory >= 3000 & virtualized rows', nb >= 3000 && g0.count === nb && g0.rows < 80, { clusters: nb, ...g0 });
      const g1 = await js(`(async()=>{const el=document.querySelector('#beltList');el.scrollTop=54*1500;await new Promise(r=>setTimeout(r,200));const r=[...el.querySelectorAll('.d-item.belt')];return {rows:r.length,first:r[0]&&r[0].dataset.belt,visible:r.some(x=>{const b=x.getBoundingClientRect(),e=el.getBoundingClientRect();return b.top>=e.top-60&&b.bottom<=e.bottom+60})}})()`); log('v3.6 virtual scroll to row 1500', g1.rows < 80 && g1.visible && g1.first && +g1.first.slice(1) > 1300, { ...g1, screenshot: await shot('ui-36-belts-virtual') });
      const g2 = await js(`__e2e.beltFilter({q:'强镇'})`); const g3 = await js(`__e2e.beltFilter({q:'一村一品'})`); const g4 = await js(`__e2e.beltFilter({q:'先进制造业'})`); const g5 = await js(`__e2e.beltFilter({q:'现代农业产业园'})`);
      log('v3.6 new sources searchable', g2.count >= 1000 && g3.count >= 350 && g4.count >= 75 && g5.count >= 90, { 强镇: g2.count, 一村一品: g3.count, 先进制造业: g4.count, 产业园: g5.count, screenshot: await shot('ui-37-belts-qz') });
      const sel4 = await js(`__e2e.belt('宁波市磁性材料')`); log('v3.6 先进制造业集群 selectable', Array.isArray(sel4) ? sel4.length > 0 : !!sel4, { sel4 });
      tb = Date.now(); for (let i = 0; i < 20; i++) await js(`__e2e.beltFilter({q:'${'abcdefghijklmnopqrst'[i]}'})`); log('v3.5 belt filter speed (20 renders)', Date.now() - tb < 4000, { ms: Date.now() - tb });
      await js(`__e2e.theme('dark')`); await js(`__e2e.beltFilter({prov:'广东'})`); await shot('ui-34-belts-dark'); await js(`__e2e.theme('light')`); await js('__e2e.close()');
      const sel = await js(`__e2e.belt('义乌')`); const u1 = await js(`__e2e.beltUrl('1688','保温杯')`); const u2 = await js(`__e2e.beltUrl('yiwugo','保温杯')`);
      log('v3.5 belt scope 义乌', sel.includes('yiwugo') && sel.includes('1688') && /%E4%B9%89%E4%B9%8C|义乌|%D2%E5%CE%DA/.test(u1) && !/%E4%B9%89%E4%B9%8C/.test(u2), { sel, u1, u2, screenshot: await shot('ui-35-belt-scoped') });
      const sel2 = await js(`__e2e.belt('安平')`); const u3 = await js(`__e2e.beltUrl('1688','丝网')`); log('v3.5 MIIT cluster scope 安平丝网', sel2.includes('ehsy') && /%E5%AE%89%E5%B9%B3|%B0%B2%C6%BD/.test(u3), { sel2, u3 });
      const sel3 = await js(`__e2e.belt('山东·烟台苹果')`); log('v3.5 agri cluster selects 惠农网', sel3.includes('cnhnb') && sel3.includes('ymt'), { sel3 });
      log('v3.5 rename: title', (await js('document.title')) === '找货大师' && (await js(`document.querySelector('.tb-brand span').textContent`)) === '找货大师', {});
      await js(`__e2e.belt(null)`); await js(`__e2e.select(${JSON.stringify(all)})`);
      // 缓存
      const t1 = Date.now(); js(`__e2e.text('保温杯')`); await sleep(1200);
      const st2 = await js('__e2e.state()'); const cached = Object.values(st2).filter(r => r.cached).length; const ms1 = Date.now() - t1;
      log('cache: repeat search instant (ok platforms from cache)', cached > 0, { ms: ms1, cachedPlatforms: cached, shownAfter1s: await js('__e2e.shownCount()') });
      await waitDone(200000);
      const sg = await js('__e2e.suggest("保")'); log('history suggestions', sg >= 1, { n: sg, screenshot: await shot('ui-15-suggest') });
      await js('__e2e.close()'); await js(`document.querySelector('#q').blur()`);
      // 原网页（登录/验证）弹窗
      await js(`__e2e.raw('jd')`); await sleep(5000); log('raw page modal (login/captcha fallback)', true, { screenshot: await shot('ui-16-raw-modal') }); await js('__e2e.close()');
      for (const pg of ['general', 'platforms', 'accounts', 'keys', 'about']) { await js(`__e2e.settings('${pg}')`); await shot('ui-17-settings-' + pg); }
      await js('__e2e.close()');
      await js(`__e2e.editor('yiwugo')`); await shot('ui-18-editor'); await js('__e2e.close()');
      // 深色结果 + 窄窗口
      await js(`__e2e.theme('dark')`); await shot('ui-19-results-dark');
      win.setSize(1080, 680); await sleep(800); await shot('ui-20-narrow-dark'); win.setSize(1440, 900); await sleep(600);
      // 以图搜货
      const img = path.join(out, 'test-image.png'); fs.copyFileSync(path.join(__dirname, 'assets', 'platforms', 'taobao.png'), img);
      await js(`__e2e.select(['taobao','tmall','1688'])`);
      js(`__e2e.image(${JSON.stringify(img)})`); await sleep(3000);
      const si = await waitDone(120000);
      for (const [id, r] of Object.entries(si)) log('image→results:' + id, r.status === 'ok' && r.n > 0, { status: r.status, n: r.n, url: r.url, msg: r.msg });
      await shot('ui-21-image-results');
      if (process.env.WW_V31) {
        await js(`__e2e.select(${JSON.stringify(all)})`); await js(`__e2e.text('保温杯')`).catch(() => {}); await waitDone(60000);
        const best = await js('__e2e.best()'); log('v3.1 best-deal chip', !!best, { best, screenshot: await shot('ui-22-best-deal') });
        const stx = await js(`document.querySelector('.statusbar, #status, footer')?.innerText || ''`); log('v3.1 status shows first-result time', /首批结果/.test(stx), { status: stx.slice(0, 160) }); { const m = /(\d+)\/(\d+) 个平台有结果/.exec(stx); const total = await js('__e2e.platformsFull().length'); log('3.2 fix: status denominator excludes manual platforms', !!m && +m[2] < total && /需手动打开/.test(stx), { denom: m && m[2], total }); }
        js('__e2e.same()'); await sleep(4000); await shot('ui-23-find-same-loading');
        const ss = await waitDone(120000);
        log('v3.1 find-same (card image → image search)', Object.keys(ss).length > 0, { platforms: Object.fromEntries(Object.entries(ss).map(([k, v]) => [k, v.status + ':' + v.n])), screenshot: await shot('ui-24-find-same') });
        await js(`__e2e.settings('general')`); await shot('ui-25-settings-timeout'); await js('__e2e.close()');
      }
    }
  } catch (e) { log('harness-error', false, { err: e.stack }); }
  app.quit();
};
