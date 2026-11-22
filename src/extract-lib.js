// 找货大师 · 提取核心（无 Electron 依赖）：价格解析、商品 URL 模板、JSON 遍历、页面提取函数
// 本文件函数均可 toString 注入隐藏窗口，避免闭包外的模块变量。

// 把文本里的价格解析成数字。opts.loose 用于 class/id 看起来像价格的节点（允许无货币符号）。
function parsePrice(s, opts) {
  if (s == null) return null;
  s = String(s).replace(/&yen;|&#165;|&#x00a5;|&YEN;/gi, '¥').replace(/\s+/g, '');
  if (!s) return null;
  if (/面议|询价|电议|议价/.test(s) && !/\d/.test(s)) return null;
  const num = x => { const n = parseFloat(String(x).replace(/,/g, '')); return isNaN(n) ? null : n; };
  let m = /(?:[¥￥]|¥)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d{1,7}(?:\.\d{1,2})?)/.exec(s);
  if (m) return num(m[1]);
  m = /(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d{1,7}(?:\.\d{1,2})?)\s*元/.exec(s);
  if (m) return num(m[1]);
  m = /(?:US\s*)?\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d{1,6}(?:\.\d{1,2})?)/i.exec(s);
  if (m) return Math.round(num(m[1]) * 710) / 100; // 与 3.6 环球资源一致：1 USD≈7.1 元
  if (opts && opts.loose) {
    m = /^(?:[¥￥$])?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d{1,7}(?:\.\d{1,2})?)$/.exec(s);
    if (m) {
      const n = num(m[1]);
      if (n != null && n > 0 && n <= 5e7) return n;
    }
  }
  return null;
}

function parseSales(s) {
  const SALES = /((?:\d+(?:\.\d+)?\s*[万wW]\+?|(?<![\d.])\d+\+?))\s*(?:人付款|人收货|人已买|人买过|件已售|已售|销量|人评价|条评价|条评论|成交|笔成交|人想要|评价|评论)|(?:已售|销量|月销|成交|已拼|总销量)\s*[:：]?\s*((?:\d+(?:\.\d+)?\s*[万wW]\+?|\d+\+?))(?![\d.])/;
  const m = SALES.exec(s || '');
  if (!m) return null;
  const v = (m[1] || m[2]).replace(/\s|\+/g, '');
  const n = parseFloat(v) * (/[万wW]/.test(v) ? 10000 : 1);
  return isNaN(n) ? null : { n, text: m[0].trim() };
}

function isJunkTitle(t) {
  return /二维码|扫码|扫一扫|微信扫|手机版|下载\s*APP|APP\s*下载|关注公众号|官方微信|小程序|在线客服|免费注册|立即登录/i.test(t || '');
}
function isJunkImage(u) {
  return /qr[_-]?code|erweima|ewm|\/qr[\/_.]|wxcode|weixin|wechat|app[_-]?down/i.test(u || '');
}

function firstStr(obj, keys) {
  if (!obj || typeof obj !== 'object') return '';
  for (const k of keys) {
    const v = obj[k];
    if (v == null || v === '') continue;
    if (typeof v === 'string' || typeof v === 'number') return String(v);
    if (typeof v === 'object') {
      if (typeof v.url === 'string') return v.url;
      if (typeof v.src === 'string') return v.src;
      if (typeof v.price === 'string' || typeof v.price === 'number') return String(v.price);
      if (typeof v.text === 'string') return v.text;
    }
  }
  return '';
}

// 仅使用公开、长期稳定的详情页模板。拿不准时返回空字符串，由调用方标 noLink。
// 淘宝 item.taobao.com/item.htm?id= ；天猫 detail.tmall.com/item.htm?id= ；
// 京东 item.jd.com/{id}.html 或 item.m.jd.com/product/{id}.html ；
// 1688 detail.1688.com/offer/{id}.html ；拼多多 goods.html?goods_id= ；
// 微店 weidian.com/item.html?itemID= ；闲鱼 www.goofish.com/item?id= ；
// 当当 product.dangdang.com/{id}.html ；严选 you.163.com/item/detail?id= ；
// 苏宁 product.suning.com/{shopId}/{productId}.html（两个 ID 齐全才拼）；
// 17 网 {当前站}/item/{id} 。
function productUrlFrom(host, obj, id) {
  if (obj) {
    const explicit = firstStr(obj, ['itemUrl', 'item_url', 'detailUrl', 'detail_url', 'auctionURL', 'auctionUrl', 'productPath', 'jumpUrl', 'pcAuctionUrl', 'itemLink', 'goodsUrl', 'wareUrl', 'url', 'href']);
    if (explicit && /^(https?:)?\/\//i.test(explicit) && !/javascript:/i.test(explicit)) {
      if (/^\/\//.test(explicit)) return 'https:' + explicit;
      return explicit;
    }
    if (explicit && explicit.startsWith('/') && host) return 'https://' + host.replace(/^\./, '') + explicit;
  }
  const h = String(host || '').replace(/^www\./, '').toLowerCase();
  id = id != null ? String(id).trim() : '';
  if (!id || !/^\d{5,}$/.test(id.replace(/^0+/, '') || id)) {
    // 苏宁 shop+sku 不是纯 id；微店 itemID 一般是数字。非纯数字且无模板时放弃。
    if (!id) return '';
  }
  if (/tmall\.hk$/.test(h) && id) return 'https://detail.tmall.hk/item.htm?id=' + id;
  if (/(?:^|\.)tmall\.com$/.test(h) && id) return 'https://detail.tmall.com/item.htm?id=' + id;
  if (/(?:^|\.)taobao\.com$/.test(h) && id) return 'https://item.taobao.com/item.htm?id=' + id;
  if (/(?:^|\.)jd\.hk$/.test(h) && id) return 'https://item.jd.hk/' + id + '.html';
  if (/(?:^|\.)jd\.com$/.test(h) && id) {
    if (/^(?:item\.m\.|so\.m\.|m\.|wq\.|wqsmo\.)/.test(h)) return 'https://item.m.jd.com/product/' + id + '.html';
    return 'https://item.jd.com/' + id + '.html';
  }
  if (/(?:^|\.)1688\.com$/.test(h) && id) return 'https://detail.1688.com/offer/' + id + '.html';
  if (/(?:yangkeduo|pinduoduo)\.com$/.test(h) && id) return 'https://mobile.yangkeduo.com/goods.html?goods_id=' + id;
  if (/(?:^|\.)weidian\.com$/.test(h) && id) return 'https://weidian.com/item.html?itemID=' + id;
  if (/(?:^|\.)goofish\.com$/.test(h) && id) return 'https://www.goofish.com/item?id=' + id;
  if (/(?:^|\.)dangdang\.com$/.test(h) && id) return 'https://product.dangdang.com/' + id + '.html';
  if (/(?:^|\.)you\.163\.com$/.test(h) && id) return 'https://you.163.com/item/detail?id=' + id;
  if (/(?:^|\.)suning\.com$/.test(h)) {
    const shop = firstStr(obj || {}, ['salesCode', 'salesCode10', 'shopCode', 'vendorCode', 'supplierCode']);
    const pid = firstStr(obj || {}, ['catentryId', 'partnumber', 'productId', 'partNumber']) || id;
    if (shop && pid) {
      const base = /(?:^|\.)m\.suning\.com$/.test(h) ? 'https://m.suning.com/product/' : 'https://product.suning.com/';
      return base + shop + '/' + pid + '.html';
    }
    return '';
  }
  if (/(?:^|\.)17zwd\.com$/.test(h) && id) return 'https://' + String(host || h) + '/item/' + id;
  return '';
}

function pickId(obj) {
  return firstStr(obj, ['itemId', 'item_id', 'itemID', 'auctionId', 'nid', 'nid_str', 'goodsId', 'goods_id', 'goodsID', 'productId', 'product_id', 'skuId', 'sku_id', 'wareId', 'wareid', 'offerId', 'offer_id', 'spuId', 'infoId', 'itemNumId', 'item_num_id', 'catentryId', 'partnumber']);
}

function pickTitle(obj) {
  return firstStr(obj, ['title', 'itemTitle', 'item_title', 'shortTitle', 'short_title', 'wareName', 'ware_name', 'productName', 'product_name', 'goodsName', 'goods_name', 'itemName', 'item_name', 'offerTitle', 'subject', 'catentdesc', 'name', 'spuName', 'prodName', 'commodityName', 'goodTitle', 'auctionTitle']);
}

function pickImage(obj) {
  const u = firstStr(obj, ['pic', 'pic_url', 'picUrl', 'pictUrl', 'pict_url', 'image', 'imageUrl', 'image_url', 'img', 'imgUrl', 'img_url', 'item_pic', 'itemPic', 'mainImage', 'main_image', 'cover', 'coverUrl', 'whiteImage', 'dynamicImg', 'pic_path', 'imagePath', 'thumbnail', 'picUrl1']);
  if (!u) {
    const arr = obj.images || obj.pics || obj.imgList || obj.picList;
    if (Array.isArray(arr) && arr[0]) {
      const x = arr[0];
      return typeof x === 'string' ? x : (x.url || x.src || x.pic || '');
    }
  }
  if (u && u.startsWith('//')) return 'https:' + u;
  return u || '';
}

function pickPrice(obj) {
  const keys = ['price', 'itemPrice', 'zkPrice', 'zk_price', 'view_price', 'reserve_price', 'salePrice', 'sale_price', 'currentPrice', 'current_price', 'actPrice', 'actualPrice', 'nowPrice', 'now_price', 'promoPrice', 'discountPrice', 'minPrice', 'priceWap', 'priceShow', 'juPrice', 'showPrice', 'realPrice', 'skuPrice', 'sellPrice', 'unitPrice', 'couponPrice', 'priceInt', 'priceText'];
  for (const k of keys) {
    if (obj[k] == null || obj[k] === '') continue;
    const v = obj[k];
    if (typeof v === 'number' && v > 0) return v;
    if (typeof v === 'string') {
      const n = parsePrice(v, { loose: true });
      if (n != null) return n;
    }
    if (typeof v === 'object') {
      const n = parsePrice(v.price || v.value || v.min || v.text || '', { loose: true });
      if (n != null) return n;
    }
  }
  return null;
}

function pickPriceText(obj) {
  const s = firstStr(obj, ['priceText', 'price_text', 'priceShow', 'priceHint']);
  if (/面议|询价|电议|议价/.test(s) || /面议|询价|电议|议价/.test(JSON.stringify(obj).slice(0, 400))) return '面议';
  return '';
}

function pickShop(obj) {
  return firstStr(obj, ['shop', 'shopName', 'shop_name', 'seller', 'sellerNick', 'seller_nick', 'nick', 'salesName', 'storeName', 'company', 'companyName', 'vendorName']).slice(0, 40);
}

function pickSales(obj) {
  const raw = firstStr(obj, ['sales', 'sale', 'sold', 'sellCount', 'soldCount', 'volume', 'totalSold', 'salesCount', 'countOfarticle', 'payCount', 'commentCount']);
  const p = parseSales(String(raw)) || parseSales('已售' + raw);
  if (p) return p;
  if (raw && /^\d+(\.\d+)?[万wW]?$/.test(raw)) {
    const n = parseFloat(raw) * (/[万wW]/.test(raw) ? 10000 : 1);
    return { n, text: '已售' + raw };
  }
  return null;
}

// 通用 JSON 遍历：对象同时具备标题类字段 + 价格类字段（或面议）则视为一张商品卡。
function walkJson(root, host, limit) {
  const out = [];
  const seen = new Set();
  const skipKey = /^(cookie|csrf|filterList|filters$|breadcrumb|recommendWord|hotWord|historyWord|associational|labelWall|fastFilter|pageConfig|headers?)$/i;
  let nodes = 0;
  const visit = (o, depth) => {
    if (out.length >= (limit || 60) || nodes > 8000 || depth > 12 || o == null) return;
    if (typeof o !== 'object') return;
    nodes++;
    if (Array.isArray(o)) { for (const x of o) visit(x, depth + 1); return; }
    const title = (pickTitle(o) || '').replace(/\s+/g, ' ').trim();
    const price = pickPrice(o);
    const priceText = price == null ? pickPriceText(o) : '';
    const image = pickImage(o);
    const id = pickId(o);
    let link = productUrlFrom(host, o, id);
    if (link && /^https?:\/\/[^/]+\/?$/.test(link)) link = '';
    const img = image && !isJunkImage(image) && !/^https?:\/\/[^/]+\/?$/.test(image) ? image : '';
    // 标题 +（价格/面议，或“有图/有链接、稍后用价格表补价”）的对象视为候选
    const hasPrice = (price != null && price > 0 && price <= 5e7) || !!priceText;
    const useful = title.length >= 4 && !isJunkTitle(title) && (hasPrice || ((img || link || id) && (img || link)));
    if (useful) {
      const k = (link || id || '') + '|' + title.slice(0, 20);
      if (!seen.has(k)) {
        seen.add(k);
        const sales = pickSales(o);
        out.push({
          title: title.slice(0, 140),
          price: hasPrice && price != null ? price : null,
          priceText: priceText || '',
          image: img,
          link: link || '',
          noLink: !link,
          shop: pickShop(o),
          sales: sales ? sales.text : '',
          salesNum: sales ? sales.n : 0,
          itemId: id || '',
          _partial: !hasPrice
        });
      }
    }
    // 无标题但有 id + 价格的对象，记入价格表（苏宁等会另发 priceList）
    if ((!title || title.length < 4) && id && price != null && price > 0 && price <= 5e7) {
      out._prices = out._prices || {};
      out._prices[String(id)] = price;
    }
    for (const k of Object.keys(o)) {
      if (skipKey.test(k)) continue;
      const v = o[k];
      if (v && typeof v === 'object') visit(v, depth + 1);
    }
  };
  visit(root, 0);
  return out;
}

function tryParseJson(text) {
  if (!text || typeof text !== 'string') return null;
  let s = text.trim();
  if (s.length < 2 || s.length > 2500000) return null;
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  const jsonp = /^[a-zA-Z_$][\w$]*\s*\(([\s\S]+)\)\s*;?\s*$/.exec(s);
  if (jsonp) s = jsonp[1];
  const start = s.search(/[\[{]/);
  if (start < 0) return null;
  if (start > 0) s = s.slice(start);
  try { return JSON.parse(s); } catch {}
  // 截掉尾部垃圾再试
  for (const end of ['};', '})', ';\n', '</']) {
    const i = s.lastIndexOf(end);
    if (i > 20) { try { return JSON.parse(s.slice(0, i + 1).replace(/;+$/, '')); } catch {} }
  }
  return null;
}

// 在页面内执行：DOM 选择器 + 内嵌 JSON + 启发式。cfg 为平台 extractor。
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
  const PRICE = /[¥￥]|&yen;/i;
  const SALES = /((?:\d+(?:\.\d+)?\s*[万wW]\+?|(?<![\d.])\d+\+?))\s*(?:人付款|人收货|人已买|人买过|件已售|已售|销量|人评价|条评价|条评论|成交|笔成交|人想要|评价|评论)|(?:已售|销量|月销|成交|已拼|总销量)\s*[:：]?\s*((?:\d+(?:\.\d+)?\s*[万wW]\+?|\d+\+?))(?![\d.])/;
  const priceLike = el => /price|Price|jiage|jia-ge|p-price|now_price|now-price|price-num|price-txt|salePrice|amount|search_now_price/i.test(String(el.className || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('itemprop') || ''));
  const visibleImg = img => {
    const r = img.getBoundingClientRect();
    if (r.width >= 40 && r.height >= 40) return true;
    const w = parseInt(img.getAttribute('width') || '0', 10);
    const h = parseInt(img.getAttribute('height') || '0', 10);
    if (w >= 50 && h >= 50) return true;
    if ((img.naturalWidth || 0) >= 50 && (img.naturalHeight || 0) >= 50) return true;
    const lazy = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-img') || img.getAttribute('data-ks-lazyload') || img.getAttribute('data-lazyload');
    return !!(lazy && !/^data:/.test(lazy));
  };
  const samePage = (a, b) => {
    try {
      const ua = new URL(a, location.href), ub = new URL(b, location.href);
      return ua.origin + ua.pathname + ua.search === ub.origin + ub.pathname + ub.search;
    } catch { return false; }
  };
  const host = location.hostname;
  const enrichLink = card => {
    try {
      if (/(?:^|\.)suning\.com$/.test(host)) {
        const li = card.closest('li[id]') || (card.id ? card : null);
        const m = li && /^(\d+)-(\d+)$/.exec(li.id || '');
        if (m) return ( /(?:^|\.)m\.suning\.com$/.test(host) ? 'https://m.suning.com/product/' : 'https://product.suning.com/' ) + m[1] + '/' + m[2] + '.html';
        const param = (card.querySelector('[param]') || card).getAttribute && (card.querySelector('[param]') || {}).getAttribute?.('param');
        // param 形如 000000000129440765__2_0070092728__129440765_000071030
        const pm = param && /(?:^|_)(\d{6,})__\d+_(\d{6,})__/.exec(param);
        if (pm) return ( /(?:^|\.)m\.suning\.com$/.test(host) ? 'https://m.suning.com/product/' : 'https://product.suning.com/' ) + pm[2] + '/' + pm[1].replace(/^0+/, '') + '.html';
      }
      if (/(?:^|\.)jd\.com$/.test(host)) {
        const sku = card.getAttribute('data-sku') || card.getAttribute('skuid') || (card.querySelector('[data-sku]') || {}).getAttribute?.('data-sku');
        if (sku && /^\d+$/.test(sku)) return /(?:so\.m\.|item\.m\.|^m\.)/.test(host) ? 'https://item.m.jd.com/product/' + sku + '.html' : 'https://item.jd.com/' + sku + '.html';
      }
      if (/(?:^|\.)weidian\.com$/.test(host)) {
        const info = card.getAttribute('data-info') || card.getAttribute('data-id') || (card.querySelector('[data-id]') || {}).getAttribute?.('data-id');
        let id = info;
        try { if (info && info.charAt(0) === '{') id = JSON.parse(info).id || JSON.parse(info).item_id; } catch {}
        if (id && /^\d+$/.test(String(id))) return 'https://weidian.com/item.html?itemID=' + id;
      }
      if (/(?:^|\.)17zwd\.com$/.test(host)) {
        const a = card.querySelector('a[href*="/item/"]');
        if (a) return abs(a.getAttribute('href'));
      }
      if (/(?:^|\.)dangdang\.com$/.test(host)) {
        const a = card.querySelector('a[href*="product.dangdang.com"]');
        if (a) return abs(a.getAttribute('href'));
        const id = (card.id || '').replace(/^p/, '');
        if (/^\d{5,}$/.test(id)) return 'https://product.dangdang.com/' + id + '.html';
      }
    } catch {}
    return '';
  };
  const out = [];
  const seen = new Set();
  const push = it => {
    // 3.8：有真实标题 +（数字价格或面议/询价/电议）即可保留；不再要求必须有 href
    if (!it.title || it.title.length < 4 || (it.price == null && !it.priceText)) return;
    if (isJunkTitle(it.title)) return;
    if (it.image && (isJunkImage(it.image) || /^https?:\/\/[^/]+\/?$/.test(it.image))) it.image = '';
    if (it.price != null && (it.price <= 0 || it.price > 5e7)) return;
    if (it.link && samePage(it.link, location.href)) { it.link = ''; it.noLink = true; }
    if (!it.link) { it.link = ''; it.noLink = true; }
    const k = (it.link || '') + '|' + it.title.slice(0, 20) + '|' + (it.price ?? it.priceText ?? '');
    if (seen.has(k)) return; seen.add(k); out.push(it);
  };
  const fromCard = (card, sel = {}) => {
    const q = s => (s ? card.querySelector(s) : null);
    const imgs = [...card.querySelectorAll('img')].filter(visibleImg);
    const img = q(sel.image) || imgs.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
    const as = card.tagName === 'A' ? [card, ...card.querySelectorAll('a[href]')] : [...card.querySelectorAll('a[href]')];
    const dl = [card, ...card.querySelectorAll('[data-href],[data-url],[data-link]')].map(e => e.getAttribute && (e.getAttribute('data-href') || e.getAttribute('data-url') || e.getAttribute('data-link'))).find(Boolean);
    const lsc = a => { const h = a.getAttribute('href') || ''; if (!h || /^(javascript|#)/i.test(h)) return -9; let s = 0;
      if (/item|detail|offer|\/prod|goods|\/p\/|sku|\/dp\/|gongying|supply\/|\/show\/|product\/|id=/i.test(h)) s += 5;
      if (/\d{6,}/.test(h)) s += 1;
      if (/showroom|shop|store|company|corp|list|search|category|\/s\?|login|cart|im\.|chat|tel:|mailto:/i.test(h)) s -= 4;
      if (img && a.contains(img)) s += 1; if (a.textContent && a.textContent.trim().length >= 6) s += 1; return s; };
    const linkEl = q(sel.link) || [...as].sort((a, b) => lsc(b) - lsc(a)).find(a => lsc(a) > -9);
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
    const priceEl = sel.price ? q(sel.price) : null;
    const priceSrc = priceEl ? txt(priceEl) : full;
    let price = parsePrice(priceSrc, { loose: !!priceEl || [...card.querySelectorAll('*')].some(priceLike) }) ?? parsePrice(full);
    if (price == null) {
      const pe = [...card.querySelectorAll('*')].find(priceLike);
      if (pe) price = parsePrice(txt(pe), { loose: true });
    }
    const priceText = price == null && /面议|询价|电议|议价/.test(full) ? '面议' : '';
    const sales = parseSales(sel.sales ? txt(q(sel.sales)) : full);
    let shop = sel.shop ? txt(q(sel.shop)) : '';
    if (!shop) { const se = card.querySelector('[class*=shop],[class*=Shop],[class*=store],[class*=Store],[class*=seller],[class*=company],[class*=Company]'); shop = se ? txt(se).split(/\s{2,}|\n/)[0] : ''; }
    if (!shop) { const m = /([\u4e00-\u9fa5A-Za-z0-9·]{2,20}(?:旗舰店|专卖店|专营店|官方店|商行|公司|厂|店|批发部|档口))/.exec(full); shop = m ? m[1] : ''; }
    const wi = String((window.__wwI = (window.__wwI || 0) + 1)); card.setAttribute('data-ww-i', wi);
    const raw = linkEl ? (linkEl.getAttribute('href') || '') : (dl || (card.closest('a[href]') || {}).href || '');
    let href = abs(raw);
    if (!href || samePage(href, location.href)) href = enrichLink(card) || '';
    const noLink = !href || samePage(href, location.href);
    let image = img ? imgSrc(img) : bgImg(card);
    if (!image) {
      const any = [...card.querySelectorAll('img')].map(imgSrc).find(Boolean);
      if (any) image = any;
    }
    return { wi, title: title.slice(0, 140), price, sales: sales ? sales.text : '', salesNum: sales ? sales.n : 0, shop: shop.slice(0, 40), image, priceText, link: noLink ? '' : href, noLink };
  };

  // 1) 平台专用选择器
  if (cfg && cfg.item) { for (const card of document.querySelectorAll(cfg.item)) { push(fromCard(card, cfg)); if (out.length >= limit) break; } }

  // 2) 页面内嵌 JSON / 已知全局（淘宝 g_page_config、苏宁 __INITIAL_STATE__、Next 等）
  if (out.length < (limit || 60)) {
    const roots = [];
    const names = ['__NEXT_DATA__', '__NUXT__', '__INITIAL_STATE__', '__INITIAL_DATA__', '__APP_DATA__', 'g_page_config', 'rawData', '_itemList', '__PINIA__', 'pageData', 'SEARCH_DATA', 'g_srp_loadCss', '_itemlist'];
    for (const n of names) { try { if (window[n]) roots.push(window[n]); } catch {} }
    for (const s of document.querySelectorAll('script')) {
      const typ = (s.type || '').toLowerCase();
      const text = s.textContent || '';
      if (!text) continue;
      if ((s.id === '__NEXT_DATA__' || typ === 'application/json' || typ === 'application/ld+json') && text.length < 2500000) {
        const j = tryParseJson(text); if (j) roots.push(j);
      } else if (/g_page_config|__INITIAL_STATE__|__INITIAL_DATA__|rawData/.test(text) && text.length < 2500000) {
        const m = /(?:g_page_config|__INITIAL_STATE__|__INITIAL_DATA__|rawData)\s*=\s*(\{[\s\S]+)/.exec(text);
        if (m) { const j = tryParseJson(m[1]); if (j) roots.push(j); }
      }
    }
    const priceMap = {};
    const jsonItems = [];
    for (const r of roots) {
      jsonItems.push.apply(jsonItems, walkJson(r, host, limit));
      collectPriceMap(r, priceMap);
    }
    for (const it of finalizeItems(jsonItems, priceMap, limit)) push(it);
  }

  // 3) 通用启发式：价格叶子节点 → 向上找到同时包含图片（或商品类名）的最小卡片
  if (out.length < 3) {
    const cards = new Set();
    const leaves = [...document.querySelectorAll('body *')].filter(el => {
      if (el.children.length > 3) return false;
      const t = (el.textContent || '').trim(); if (!t || t.length > 40) return false;
      if (/[¥￥]|元|&yen;|面议|询价|电议/i.test(t)) return true;
      return priceLike(el) && /\d|面议/.test(t);
    }).slice(0, 1500);
    for (const leaf of leaves) {
      let el = leaf;
      for (let i = 0; i < 9 && el && el !== document.body; i++, el = el.parentElement) {
        const r = el.getBoundingClientRect();
        if (r.width > innerWidth * 0.98 && r.height > 900) break;
        const hasImg = [...el.querySelectorAll('img')].some(visibleImg) || /url\(/.test(getComputedStyle(el).backgroundImage || '');
        if (hasImg && (el.tagName === 'A' || el.querySelector('a[href]') || el.closest('a[href]') || /^(LI)$/.test(el.tagName) || /item|card|goods|product|pro-item|gl-item/i.test(el.className || ''))) {
          if ((el.innerText || '').length < 800) cards.add(el);
          break;
        }
      }
    }
    const arr = [...cards].filter(c => ![...cards].some(o => o !== c && c.contains(o)));
    for (const c of arr) { push(fromCard(c)); if (out.length >= limit) break; }
  }
  const text = (document.body ? document.body.innerText : '').slice(0, 3000);
  return { items: out.slice(0, limit), url: location.href, title: document.title, text, h: document.documentElement.scrollHeight };
};


// 从 JSON 里收集“id → 价格”映射（苏宁 priceList、京东价格接口等）
function collectPriceMap(root, map) {
  map = map || {};
  let n = 0;
  const visit = (o, depth) => {
    if (o == null || n > 8000 || depth > 12) return;
    if (typeof o !== 'object') return;
    n++;
    if (Array.isArray(o)) { for (const x of o) visit(x, depth + 1); return; }
    const id = pickId(o);
    const price = pickPrice(o);
    if (id && price != null && price > 0 && price <= 5e7 && !pickTitle(o)) map[String(id)] = price;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (/^\d{6,}$/.test(k)) {
        if (typeof v === 'number' && v > 0 && v <= 5e7) map[k] = v;
        else if (typeof v === 'string') { const p = parsePrice(v, { loose: true }); if (p) map[k] = p; }
        else if (v && typeof v === 'object') {
          const p = pickPrice(v) || parsePrice(v.price || v.prce || v.p || '', { loose: true });
          if (p) map[k.replace(/^0+/, '')] = p, map[k] = p;
        }
      }
      if (v && typeof v === 'object') visit(v, depth + 1);
    }
  };
  visit(root, 0);
  return map;
}

function finalizeItems(items, priceMap, limit) {
  const out = [];
  const seen = new Set();
  for (const it of items || []) {
    if (it.price == null && !it.priceText && priceMap) {
      const id = String(it.itemId || '');
      const p = priceMap[id] || priceMap[id.replace(/^0+/, '')];
      if (p != null) { it.price = p; it._partial = false; }
    }
    if (!it.title || it.title.length < 4 || (it.price == null && !it.priceText)) continue;
    delete it._partial;
    const k = (it.link || '') + '|' + it.title.slice(0, 20) + '|' + (it.price ?? it.priceText ?? '');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
    if (out.length >= (limit || 60)) break;
  }
  return out;
}

module.exports = {
  parsePrice, parseSales, isJunkTitle, isJunkImage, firstStr, productUrlFrom, walkJson, tryParseJson,
  pickId, pickTitle, pickImage, pickPrice, pickPriceText, pickShop, pickSales, collectPriceMap, finalizeItems, EXTRACT_FN
};
