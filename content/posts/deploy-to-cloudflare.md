---
title: 部署到 Cloudflare
date: 2026-10-30
summary: Workers 静态资源与 Pages 两条路，各自适合什么场景。
---

## 一条命令的路

```
npm run deploy
```

背后是 `wrangler deploy`，读取 `wrangler.jsonc` 里的 `assets.directory`，把 `dist/` 整个上传成一个 Workers 项目。第一次运行会让你登录 Cloudflare 账号（浏览器授权）。

部署完成后会给你一个 `项目名.你的子域.workers.dev` 的地址，绑定自定义域名在控制台的 Workers 页面里加。

## 走 Git 的路

如果你想让"提交即上线"：

1. 把仓库推到 GitHub
2. Cloudflare 控制台 → Workers & Pages → 创建 → 连接到 Git
3. 构建命令填 `npm run build`，输出目录填 `dist`

之后每次 push 自动构建。适合在手机上改文章的场景。

## 两者怎么选

| 维度 | wrangler 直接上传 | Git 集成 |
| --- | --- | --- |
| 上手速度 | 快，一条命令 | 需要先建仓库 |
| 适合 | 单人、本地写作 | 多设备、想留版本历史 |
| 代价 | 每次手动推 | 依赖 Git 工作流 |

内容少、设备固定，选前者。写作地点会变，选后者。

> 免费额度对个人博客绰绰有余：静态资源请求免费且不限量。每日 10 万次的上限针对 Worker 脚本调用，这个站点没有脚本入口，不会触及。
