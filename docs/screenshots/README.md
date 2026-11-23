# 预留的产品界面截图

本目录用于存放 **真实产品窗口** 截图。当前尚未放入 PNG，因为仓库与本机工作区都没有可用的产品界面截图。

`src/assets/platforms/*.png` 是各电商平台 logo，`build/icon.png` 是应用图标，**都不能**当作产品界面截图。

**请勿**提交 AI 生成图、编造界面、logo 拼贴或装饰性插图。

## 建议启动（Linux 或 Windows 桌面）

```bash
npm install
npm start
```

需要 Node.js 与可运行的 Electron。截图时尽量使用未登录或空白会话，不要拍到验证码、账号、cookie 或个人订单。

## 建议截取并使用的文件名

| 文件 | 预期画面 |
| --- | --- |
| `01-workbench.png` | 主界面 / 搜索工作台 |
| `02-results.png` | 在至少一个平台上的搜索结果列表或卡片 |
| `03-compare-or-favorites.png` | 比对、收藏或平台切换后的界面（若有） |

截取后把上述文件放到本目录，并保持 README 中的相对路径不变，再追加提交到同一文档分支。
