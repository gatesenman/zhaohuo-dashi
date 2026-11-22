# 找货大师

**3.8.0** · 跨电商平台一键找货桌面工具：在多个采购与零售平台上搜索同款或替代货源。

## 功能特性

- 在多个电商 / 采购平台之间切换搜索与比对。
- Electron 桌面应用，平台配置与能力在 `src/defaults.json` 中维护；产业带数据在 `src/belts.json`。
- 各平台登录会话分开持久化，数据保存在本机用户目录。若已有旧版 `%APPDATA%/维维找货`，会继续沿用（升级后登录与收藏不丢），否则使用 `%APPDATA%/找货大师`。
- 3.8.0 增强了提取引擎（页面 JSON / 隐藏窗口网络拦截、无链接卡片保留、懒加载与 SPA 等待），并仅在有公开证据时修正搜索 URL。详见 [CHANGELOG-3.8.md](CHANGELOG-3.8.md)。

本仓库**不包含安装包**，也**不声称**端到端测试已通过。登录墙、验证码或纯 App / 小程序站点不会被绕过；海外网络下部分国内站点可能只能拿到空壳页面。

## 技术栈

- Electron
- JavaScript

## 从源码运行

源码在仓库根目录（`package.json` 与 `src/`）。

```bash
npm install
npm start
```

可选：

```bash
# 提取逻辑单测（不启动 Electron）
node tools/extract-unit-test.js

# 本地打包（产物写入 dist/，不会出现在本仓库）
npm run dist:win      # Windows 安装包与便携版
npm run dist:linux    # Linux AppImage
```

`appId` 保持 `com.weiwei.zhaohuo`，以便覆盖安装 / 卸载识别。产业带相关笔记见仓库根目录 `产业带研究.md`。

## 文档

- [3.8.0 更新说明](CHANGELOG-3.8.md)
- [产业带研究](产业带研究.md)

## 贡献

欢迎通过 Issue 和 Pull Request 参与，详见 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。参与时请遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

## 许可证

本仓库尚未附带 LICENSE 文件，许可证未指定。

---

## English

# ZhaoHuo Dashi

**3.8.0** · A desktop tool for one-click cross-platform product sourcing: search the same or alternative goods across multiple procurement and retail sites.

## Features

- Search and compare goods across multiple e-commerce and procurement platforms.
- Electron desktop app; platform entries and capabilities are maintained in `src/defaults.json`. Industry-cluster data lives in `src/belts.json`.
- Login sessions are persisted per platform in the local user data directory. If a previous `%APPDATA%/维维找货` directory already exists, it continues to be used so logins and favorites are not lost on upgrade; otherwise data goes to `%APPDATA%/找货大师`.
- 3.8.0 improves the extraction engine (in-page JSON and hidden-window network interception, keeping cards without product links, lazy-load and SPA waits) and only changes search URLs when there is public evidence. See [CHANGELOG-3.8.md](CHANGELOG-3.8.md).

This repository **does not include installers** and **does not claim** that end-to-end tests have passed. Login walls, captchas, and app- or mini-program-only sites are not bypassed. On networks outside mainland China, some domestic sites may only return an empty shell page.

## Tech stack

- Electron
- JavaScript

## Getting started

Source is at the repository root (`package.json` and `src/`).

```bash
npm install
npm start
```

Optional:

```bash
# Extraction unit tests (does not start Electron)
node tools/extract-unit-test.js

# Package locally (artifacts go to dist/, not this repository)
npm run dist:win      # Windows installer and portable build
npm run dist:linux    # Linux AppImage
```

The `appId` remains `com.weiwei.zhaohuo` so upgrades and uninstalls stay recognizable. Industry-cluster notes are in `产业带研究.md` at the repository root.

## Documentation

- [3.8.0 changelog](CHANGELOG-3.8.md)
- [产业带研究](产业带研究.md)

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Please report vulnerabilities privately via [SECURITY.md](SECURITY.md). This project follows [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

No LICENSE file is included in this repository; the license is unspecified.
