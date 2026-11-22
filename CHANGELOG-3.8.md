# 找货大师 3.8.0

版本号已改为 3.8.0。本目录只改源码与说明，**未打包安装程序、未跑 electron-builder**。海外环境无法对国内站点做有意义的端到端实测，因此下面**不声称**任何平台现在能通过 E2E；改动目标是提高提取鲁棒性，并只在有公开证据时改搜索 URL。

## 提取引擎（`src/extract-lib.js`、`src/extract.js`）

### 无链接卡片不再被丢弃，也不再用搜索页 URL 冒充商品链接
- `push()`：标题 ≥ 4 字，且有数字价格或「面议 / 询价 / 电议 / 议价」，即可保留；**不再要求必须有 href**。
- `fromCard()`：**绝不会**把当前搜索页 `location.href` 填进 `link`。没有商品 href / data-url 时，`link` 为空并设 `noLink=true`，交给已有的点击解析（`extract:resolve`）去补。
- 针对此前「有卡片但缺商品链接」的站点，用页面上已出现的稳定字段补链接（拿不准则仍空着）：
  - 苏宁移动搜索：`li` 的 `id="店铺号-商品号"`（2026-11-19 实测 HTML：`id="0070092728-129440765"`）以及 `productPath`，拼 `https://m.suning.com/product/{shop}/{id}.html` 或电脑端 `product.suning.com`。
  - 京东：卡片 `data-sku` / `skuid` → `item.jd.com/{id}.html` 或 `item.m.jd.com/product/{id}.html`。
  - 微店：`data-info` / `data-id` → `https://weidian.com/item.html?itemID=`（模板来自 H5 搜索页脚本）。
  - 当当：`product.dangdang.com/{id}.html`。
  - 17 网：`a[href*="/item/"]`。
- 目标失败：京东、苏宁易购、网易严选、京喜等「抽出了卡片但链接是搜索页或空」。

### 价格识别
- 继续识别 `¥` / `￥` / `&yen;` / `元` / `$` / `US$`（美元仍按 1 USD≈7.1 元折算，与 3.6 环球资源一致）。
- 节点的 class / id / itemprop **看起来像价格**时，允许无货币符号的 `12.90`、`199`、`1,299.00`。
- 目标失败：移动页常用 class 标价、不写￥，导致整页 extract-empty。

### 懒加载图片
- `visibleImg` 不再只认已布局且 ≥50×50 的图；`data-src` / `data-original` 等懒加载地址、宽高属性或 `naturalWidth` 达标也可采用。
- 提取前会滚动页面，给懒加载列表时间出图。

### SPA 等待与重试
- `loadURL` 之后先等最多约 12–16 秒，直到出现价格文字、内嵌 JSON 或商品卡片，期间分段滚动。
- 提取后若仍不足 3 条，再滚动并重试 1–2 次。全部限制在原有 `hardTimeout` 之内（提前约 4 秒结束，避免总时限把窗口杀掉时还在抽）。
- 目标失败：抖音商城、国美、义采宝、饿了么、朴朴、搜款网、慧聪、当当、网商园等超时或首屏尚未渲染完。

### JSON / 网络拦截提取（主要杠杆）
- **页面内**：遍历 `script` 与已知全局，包括 `__NEXT_DATA__`、`__NUXT__`、`__INITIAL_STATE__`、`__INITIAL_DATA__`、`g_page_config`、`rawData`、`window._itemList` 等。
- **网络**：只在**隐藏提取窗口**上临时 `webContents.debugger` 打开 `Network`，读取 XHR/fetch 的 JSON / JSONP 响应体，提取结束后立刻 `detach`。不会挂到用户可见的浏览器窗口上。调试器不可用时自动退回 DOM + 内嵌 JSON。
- 通用 `walkJson`：对象同时具备标题类字段 + 价格类字段则生成卡片。若只有标题和链接、价格稍后才到（如苏宁 `__INITIAL_STATE__.searchResult.productList` 有标题和 `productPath`，`priceList` 由后续接口填充），会用 id→价格表补齐后再收录。
- 仅在 ID 模式非常明确时才拼详情 URL（见下）；不确定就留空并标 `noLink=true`，不编造。

已写入代码注释的详情页模板（仅长期公开、可核对的模式）：

| 站点 | 模板 |
| --- | --- |
| 淘宝 | `https://item.taobao.com/item.htm?id={id}` |
| 天猫 | `https://detail.tmall.com/item.htm?id={id}` |
| 京东电脑 | `https://item.jd.com/{id}.html` |
| 京东移动 | `https://item.m.jd.com/product/{id}.html` |
| 1688 | `https://detail.1688.com/offer/{id}.html` |
| 拼多多 | `https://mobile.yangkeduo.com/goods.html?goods_id={id}` |
| 微店 | `https://weidian.com/item.html?itemID={id}` |
| 闲鱼 | `https://www.goofish.com/item?id={id}` |
| 当当 | `https://product.dangdang.com/{id}.html` |
| 网易严选 | `https://you.163.com/item/detail?id={id}` |
| 苏宁 | `https://product.suning.com/{shopId}/{productId}.html`（两个 ID 都有才拼；移动为 `m.suning.com/product/`） |
| 17 网 | `https://{当前城市站}/item/{id}` |

唯品会、得物等需要两段 ID 或模式不稳定的，有完整 `url` 字段才用，否则 `noLink`。

### 登录/验证墙
- **没有**做绕过。无商品时，登录/验证判定略增补页面文案（请登录、请完成验证等）。已经用已有 Cookie 抽出商品时，状态仍是成功。登录窗口、去登录/去验证交互未改。协议拦截、分区登录、userData 目录逻辑未改。

### 无搜索 URL 站点的输入框
- `typeSearch` 的输入框打分增加「想买 / 想要 / 找货 / 货源 / 输入商品 / enterkeyhint=search」等，方便转转这类只能从首页输入的站点。

### 抖音 / 快手「商品」Tab
- 未改抖音搜索 URL（仍是 `type=general`，见下）。加载后若页面上有可见的「商品」文案 Tab，会点击再提取（公开操作指南仍是综合搜索 + 点商品 Tab）。

## 搜索 URL 变更（仅有证据才改）

### 已改

| 平台 | 旧值 | 新值 | 证据 |
| --- | --- | --- | --- |
| 微店 `search` / `mobileSearch` | 空（首页手输，因 `/search` 曾 404） | `https://h5.weidian.com/m/search/searchlist/index.html?keyword={q}` | 2026-11-19 请求该地址 HTTP 200，标题「搜索结果」，页内有综合/销量/价格和模板 `https://weidian.com/item.html?itemID=`。文字搜索能力改为自动。 |
| 当当 `accessMode` | `follow`（会走移动搜索） | `desktop` | `search.m.dangdang.com` 证书 SubjectAltName 只有 `*.dangdang.com` 与 `dangdang.com`，**覆盖不了**三级域名，curl 报 SSL：证书主机名不匹配。桌面 `https://search.dangdang.com/?key={q}&act=input` 实测 200，标题「三体-当当网」，列表为 `#search_nature_rg ul.bigimg > li`。移动搜索字段仍保留，供手动切移动端，但默认不再使用。 |

已安装用户的 `platforms.json` 会在启动时迁移：当当改为桌面；原先没有搜索 URL 的内置平台（如微店）补上新地址；没有自定义提取器的内置平台补上 CSS 提取器。用户自己改过的搜索 URL 不会被覆盖。

### 查过但未改（避免假装有搜索地址）

| 平台 | 结论 |
| --- | --- |
| 转转 | `https://m.zhuanzhuan.com/search?keyword=` 仍是 **404**。维持首页 + `typeSearch`。未见可用的公开 H5 搜索 URL。 |
| 抖音商城 | 海外只能拿到混淆后的空壳 HTML，无法区分 `type=goods` / `type=general`。一份公开电商搜索指南仍写 `https://www.douyin.com/search/{q}?type=general` 再点「商品」Tab。`mall.douyin.com` 只是 App 下载页。故 URL 不动，只加点击「商品」Tab。 |
| 快手小店 | 未见带 `{q}` 的公开商品搜索 URL。`kwaixiaodian.com` 打开后偏招商/开店，未改 `www.kuaishou.com/search/video`。 |
| 京东秒送 | 首页有 `#searchIndex` 路由，**没有**查到稳定的 `?keyword={q}` 公开搜索地址。维持首页手输。 |
| 盒马 / 叮咚 / 多点 / 山姆 / 沃尔玛 | 官网目前是品牌/企业或 App 导流页。`www.samsclub.cn/search?k=` 只返回空的 Umi 壳、无商品列表。不编造搜索 URL。盒马 `freshhema.com` 会跳到 `freshippo.com` 品牌站。 |
| 得物 | 网页版仍无可用的公开搜索参数，维持首页手输。 |
| 国美 | `www.gome.com.cn/search?question=` 为 404，搜索会跳到企业站且证书不匹配。维持首页手输。 |
| 拼多多批发 | `/search` 会跳到商家后台，不是采购搜索结果。维持首页。 |
| 微信小店 | `store.weixin.qq.com` 仍是商家后台，没有公开商品搜索。 |
| 爱回收 | `https://www.aihuishou.com/search?keyword=` 虽 200，标题却是官网首页文案，页面是企业站 SPA，不能当作商品搜索。 |
| 包牛牛 | 本环境 401，与原先说明一致，不加搜索 URL。 |
| 饿了么 / 朴朴 / 慧聪 / 网商园 | 没有发现新的、可核对的公开搜索 URL。慧聪、网商园从本环境 TLS 握手失败，保留原地址。 |
| 17 网、义采宝、搜款网、当当桌面搜索 URL 本身 | 本环境能打开（17 网标题「广州货源搜索…」，义采宝、搜款网、当当桌面均 200），**不改 URL**。17 网 extract-empty 更可能是提取问题，已加 CSS/JSON。 |
| 义乌购、中国制造网、蘑菇街、世界工厂网、一亩田 | 按要求不改已能工作的搜索地址。 |

## 平台 CSS 提取器（`defaults.json` 的 `extractor`）

只为有 2026 页面实证或长期公开、被文档引用的结构添加，找不到就不编造。

| 平台 | 选择器来源 |
| --- | --- |
| 苏宁 | 2026-11-19 抓取 `m.suning.com/search/杯/`，卡片 `.pro-item`、`.pro-title`、`.price-num`、`.pro-img`、`.shop-name`；同页 `__INITIAL_STATE__.searchResult.productList`。 |
| 当当桌面 | 同日抓取 `search.dangdang.com`，`#search_nature_rg ul.bigimg > li`，价格 `.search_now_price`（`&yen;23.00`），链接 `product.dangdang.com/{id}.html`。 |
| 微店 | H5 搜索页模板：`li.item`、`a.item-a`、`.new-price` / `.item_price`。 |
| 17 网 | 同日抓取 `gz.17zwd.com/sks.htm`，CSS Module 类名带 `goodsCard` / `goodsTitle` / `goodsPrice` 词根，链接 `/item/{id}`。不用完整哈希类名。 |
| 京东 / 京喜 / 京东健康 / 拍拍 | 电脑列表长期使用的 `#J_goodsList .gl-item`、`.p-name`、`.p-price`（公开技能文档 2026 年仍引用）。移动页若已改版，靠 JSON 遍历与 `data-sku`。 |
| 淘宝 / 天猫 / 天猫超市 | 新版 CSS Module `[class*='Card--']` + `item.taobao.com` / `detail.tmall.com` 链接（公开技能文档仍引用）；旧版 `.items .item` 兜底。主路径仍是 JSON / 网络拦截。 |

## 其它

- `package.json` 版本 **3.8.0**，`productName` 仍为「找货大师」。
- 登录分区、`维维找货` 用户数据目录、非 http(s) 协议拦截、每平台总时限、登录窗口均保持原逻辑。
- 单测：`node tools/extract-unit-test.js`（不启动 Electron）。

## 仍解决不了的限制

- 登录墙、滑块、验证码、纯 App/小程序站点，本版本不会绕过，E2E 仍可能失败。
- 海外 IP / 空壳反爬页面上，JSON 拦截也拿不到列表。
- 未在用户的国内电脑上重跑 r3，**不能**声称通过率已经提高。
