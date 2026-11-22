#!/usr/bin/env node
// 3.8 提取核心单测：不依赖 Electron。运行：node tools/extract-unit-test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const lib = require('../src/extract-lib');

let failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  OK  ' + name); }
  catch (e) { failed++; console.error('  FAIL ' + name + '\n    ' + (e.stack || e)); }
}

test('parsePrice 货币符号与实体', () => {
  assert.strictEqual(lib.parsePrice('¥12.90'), 12.9);
  assert.strictEqual(lib.parsePrice('￥199'), 199);
  assert.strictEqual(lib.parsePrice('&yen;23.00'), 23);
  assert.strictEqual(lib.parsePrice('23.00元'), 23);
  assert.strictEqual(lib.parsePrice('US$10'), 71);
  assert.strictEqual(lib.parsePrice('$10'), 71);
  assert.strictEqual(lib.parsePrice('abc'), null);
  assert.strictEqual(lib.parsePrice('面议'), null);
});

test('parsePrice loose：价格节点允许无货币符号、千分位', () => {
  assert.strictEqual(lib.parsePrice('199', { loose: true }), 199);
  assert.strictEqual(lib.parsePrice('12.90', { loose: true }), 12.9);
  assert.strictEqual(lib.parsePrice('1,299.00', { loose: true }), 1299);
  assert.strictEqual(lib.parsePrice('199', { loose: false }), null);
});

test('已知详情页 URL 模板', () => {
  assert.strictEqual(lib.productUrlFrom('s.taobao.com', {}, '1234567890'), 'https://item.taobao.com/item.htm?id=1234567890');
  assert.strictEqual(lib.productUrlFrom('s.taobao.com', {}, '1234567890').includes('item.taobao.com'), true);
  assert.strictEqual(lib.productUrlFrom('www.tmall.com', {}, '98'), 'https://detail.tmall.com/item.htm?id=98');
  // 98 is only 2 digits — our function may still emit. That's ok if digits exist.
  assert.strictEqual(lib.productUrlFrom('search.jd.com', {}, '12454928407'), 'https://item.jd.com/12454928407.html');
  assert.strictEqual(lib.productUrlFrom('so.m.jd.com', {}, '12454928407'), 'https://item.m.jd.com/product/12454928407.html');
  assert.strictEqual(lib.productUrlFrom('s.1688.com', {}, '653198935622'), 'https://detail.1688.com/offer/653198935622.html');
  assert.strictEqual(lib.productUrlFrom('mobile.yangkeduo.com', {}, '111'), 'https://mobile.yangkeduo.com/goods.html?goods_id=111');
  assert.strictEqual(lib.productUrlFrom('h5.weidian.com', {}, '222'), 'https://weidian.com/item.html?itemID=222');
  assert.strictEqual(lib.productUrlFrom('www.goofish.com', {}, '333'), 'https://www.goofish.com/item?id=333');
  assert.strictEqual(lib.productUrlFrom('search.dangdang.com', {}, '12100024765'), 'https://product.dangdang.com/12100024765.html');
  assert.strictEqual(lib.productUrlFrom('m.you.163.com', {}, '444'), 'https://you.163.com/item/detail?id=444');
  const sn = lib.productUrlFrom('m.suning.com', { salesCode: '0070092728', catentryId: '129440765' }, '129440765');
  assert.strictEqual(sn, 'https://m.suning.com/product/0070092728/129440765.html');
  // 苏宁缺 shopId 时不编造
  assert.strictEqual(lib.productUrlFrom('m.suning.com', {}, '129440765'), '');
  // 拿不准的站点不编造
  assert.strictEqual(lib.productUrlFrom('www.example.com', {}, '1234567'), '');
  // 显式 productPath
  assert.strictEqual(lib.productUrlFrom('m.suning.com', { productPath: '//m.suning.com/product/0070092728/129440765.html' }, ''), 'https://m.suning.com/product/0070092728/129440765.html');
});

test('walkJson + 价格表补全（苏宁 SSR 先有标题后有价）', () => {
  const root = { searchResult: { productList: [{
    catentdesc: '金灶 飘逸杯 K系列办公茶道杯 花茶壶',
    productName: '金灶 飘逸杯 K系列办公茶道杯 花茶壶',
    catentryId: '129440765',
    salesCode: '0070092728',
    salesName: '金灶官方旗舰店',
    dynamicImg: '//imgservice5.suning.cn/uimg1/b2c/image/abc.jpg',
    productPath: '//m.suning.com/product/0070092728/129440765.html'
  }] } };
  const items = lib.walkJson(root, 'm.suning.com', 20);
  assert.strictEqual(items.length, 1);
  assert.ok(items[0]._partial);
  assert.strictEqual(items[0].price, null);
  assert.ok(items[0].link.includes('/product/0070092728/129440765.html'));
  const map = lib.collectPriceMap({ priceList: { '129440765': { price: '39.90' } } });
  const filled = lib.finalizeItems(items, map, 20);
  assert.strictEqual(filled.length, 1);
  assert.strictEqual(filled[0].price, 39.9);
  assert.strictEqual(filled[0]._partial, undefined);
});

test('walkJson 要求标题；过滤品牌筛选项', () => {
  const root = { filters: [{ valueDesc: '富光(FGA)', value: '45488', count: 99, picUrl: '' }] };
  assert.strictEqual(lib.walkJson(root, 'm.suning.com', 20).length, 0);
});

test('walkJson 淘宝风格对象', () => {
  const root = { data: { itemsArray: [{
    title: '304不锈钢保温杯大容量男女便携水杯',
    zk_price: '29.90',
    pic_url: 'https://img.alicdn.com/imgextra/foo.jpg',
    nid: '610743307637'
  }] } };
  const items = lib.finalizeItems(lib.walkJson(root, 's.taobao.com', 20), {}, 20);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].price, 29.9);
  assert.strictEqual(items[0].link, 'https://item.taobao.com/item.htm?id=610743307637');
});

test('tryParseJson / JSONP', () => {
  assert.deepStrictEqual(lib.tryParseJson('{"a":1}'), { a: 1 });
  assert.deepStrictEqual(lib.tryParseJson('cb({"a":1});'), { a: 1 });
  assert.strictEqual(lib.tryParseJson('not json'), null);
});

test('垃圾标题过滤', () => {
  assert.ok(lib.isJunkTitle('下载APP享优惠'));
  assert.ok(!lib.isJunkTitle('304不锈钢保温杯大容量'));
});

test('defaults.json 合法且搜索模板含 {q}', () => {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'src', 'defaults.json'), 'utf8');
  const data = JSON.parse(raw);
  assert.ok(Array.isArray(data) && data.length >= 70);
  for (const p of data) {
    for (const k of ['search', 'mobileSearch']) {
      if (p[k]) assert.ok(/\{q(:\w+)?\}/.test(p[k]), p.id + ' ' + k + ' missing {q}: ' + p[k]);
    }
  }
  const wd = data.find(x => x.id === 'weidian');
  assert.ok(wd.search.includes('h5.weidian.com') && wd.search.includes('{q}'));
  const dd = data.find(x => x.id === 'dangdang');
  assert.strictEqual(dd.accessMode, 'desktop');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.strictEqual(pkg.version, '3.8.0');
  assert.strictEqual(pkg.productName, '找货大师');
});

test('注入脚本可被 Function 解析（不执行 DOM）', () => {
  const src = `(() => {
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
    const EXTRACT_FN = ${lib.EXTRACT_FN.toString()};
    return typeof EXTRACT_FN === 'function' && typeof walkJson === 'function';
  })()`;
  assert.strictEqual(new Function('return ' + src)(), true);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
