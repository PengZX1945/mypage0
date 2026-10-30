# cloudflare-blog

[我的主页](page.silvershaded.top)

零依赖静态博客。Markdown 写作 → 编译成纯 HTML → 部署到 Cloudflare。

## 结构

```
content/posts/*.md   文章源文件（文件名 = URL slug）
assets/style.css     样式
site.json            站点标题、描述、作者、域名
build.mjs            生成器（无第三方依赖）
scripts/verify.mjs   产物断言
scripts/deploy.sh    构建 → 校验 → 部署 → 线上自检
dist/                产出，勿手动修改
wrangler.jsonc       Cloudflare Workers 静态资源配置
DEPLOY.md            上云教程（登录、自检、域名、报错表、配额）
```

## 命令

```bash
npm install          # 装 wrangler（唯一依赖，部署用）
npm run build        # content/posts/*.md -> dist/
npm run verify       # 断言：死链、h1、占位符、RSS、配置一致性
npm run dev          # 本地预览 http://127.0.0.1:8899（需 python3）
npm run preview      # 本地起 workerd，等价线上运行时 http://127.0.0.1:8788
npm run pack         # 构建+校验+打包 cf-blog-dist.zip（手动上传用）
npm run deploy       # 构建+校验+部署+线上自检，一条命令上云
npm run deploy:pages # 走 Cloudflare Pages
```

`npm run deploy` 在未登录时会中止并提示跑 `npx wrangler login`。

## 写一篇新文章

新建 `content/posts/<slug>.md`：

```markdown
---
title: 标题
date: 2026-11-01
summary: 列表页摘要（可省）
draft: false
---

正文……
```

`draft: true` 不参与构建。文章内的 `#` 会降级为 `h2`（`h1` 留给文章标题）。

## URL 规则

| 源文件 | 线上 URL |
| --- | --- |
| — | `/` |
| `content/posts/hello-world.md` | `/posts/hello-world/` |
| — | `/feed.xml`、`/404` |

文章输出为 `posts/<slug>/index.html`，链接一律指向带尾斜杠的目录形式，所以首页与文章页在本地预览和 Cloudflare 上落在同一路径，不产生跳转链。

`npm run dev` 是 python 静态服务器，不模拟 404 兜底和 `_headers`；要验这两项用 `npm run preview`（workerd，与线上同引擎）。`/404.html` 会被 307 到 `/404`，不要拿它当链接用。

## 改站点信息

编辑 `site.json`。`url` 用于 RSS 与 `og:url`，部署后要改成真实地址（`npm run verify` 会提示仍是占位符）。

## 部署

```bash
npm run deploy
```

完整流程（手动分步、上线自检、自定义域名、错误对照表、配额、回滚）见 **[DEPLOY.md](DEPLOY.md)**。

Pages 路线用 `npm run deploy:pages`，或在控制台连接 Git 仓库（构建命令 `npm run build`，输出目录 `dist`）。

不想碰命令行：`npm run pack` 打成 zip，在控制台 Pages → Upload assets 拖进去，见 DEPLOY.md §12。

## 说明

- 产物无 JavaScript、无框架；运行时零依赖，构建只依赖 Node
- 自带 RSS (`/feed.xml`)、404 页（`noindex`）、深色模式（跟随系统）
- `dist/_headers` 设置 `X-Content-Type-Options`、`Referrer-Policy`、`X-Frame-Options`，并给 `style.css` 1 小时缓存
