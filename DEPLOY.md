# 上云教程

目标形态：`dist/` 里的纯静态文件由 Cloudflare 边缘节点直出，**不触发 Worker 脚本** —— 没有请求计费、没有冷启动、没有运行时。部署对象是一个只有 `assets`、没有 `main` 的 Worker。

---

## 1. 前置准备

| 需要 | 命令 | 说明 |
| --- | --- | --- |
| Node 18+ | `node -v` | 本机 v26.0.0 |
| wrangler | `npm install` | 已列为 devDependency，约 200 MB（含本地 workerd） |
| Cloudflare 账号 | — | 免费版足够 |
| python3 | `python3 -V` | 只有本地预览 `npm run dev` 用得上 |

```bash
cd ~/cloudflare-blog
npm install
```

运行时零依赖，`npm install` 装进来的只是部署工具和本地模拟器。

## 2. 一条命令上云

```bash
npm run deploy
```

`npm run deploy` 实际执行 `scripts/deploy.sh`，六步全自动：

```
1/6 环境检查      node 版本、wrangler 是否可用
2/6 构建          node build.mjs
3/6 产物校验      scripts/verify.mjs（死链、h1、占位符、RSS、配置一致性）
4/6 登录状态      wrangler whoami，未登录直接中止并告诉你怎么办
5/6 部署          dry-run 预检 -> wrangler deploy，捕获线上地址
6/6 线上自检      curl 五条关键路径，逐条打勾或打叉
```

任何一步失败就停下，不会带着坏产物上线。末行会打印 `上线完成 <URL>`。

不想碰命令行？见 [§12 手动上传](#12-手动上传pages-直传拖个-zip-就行)：打包成 zip，浏览器里拖进去即可。

> 首次部署有个前置：账号必须先有一个 `workers.dev` 子域，否则 wrangler 会拒绝发布（`You need to register a workers.dev subdomain before publishing`）。在 <https://dash.cloudflare.com/> → Workers & Pages 走一次 onboarding 即可，全局唯一、全账号共用。

## 3. 手动分步（想搞清楚每步在干什么）

```bash
# 构建并自检
npm run build
npm run verify

# 不需要账号的预检：wrangler 是否认得出产物
npx wrangler deploy --dry-run
#   ✨ Read N files from the assets directory .../cloudflare-blog/dist
#   --dry-run: exiting now.

# 登录（一次性）
npx wrangler login          # 浏览器授权 → Allow
npx wrangler whoami         # 应显示 logged in with an OAuth Token

# 部署
npx wrangler deploy
```

本地有两种预览，用途不同：

```bash
npm run dev       # python 静态服务器，快；不模拟 404 兜底和 _headers
npm run preview   # workerd（与线上同引擎），404/重定向/响应头都和线上一致
```

无浏览器的机器用 Token，别用 login：

```bash
export CLOUDFLARE_API_TOKEN=你的token
```

Token 取控制台 My Profile → API Tokens → 模板 **Edit Cloudflare Workers**。所需权限：`Workers Scripts:Edit`、`Account Settings:Read`、`User Details:Read`、`Zone:Read`。

凭据落盘位置（macOS）：`~/Library/Preferences/.wrangler/config/default.toml`。

## 4. 上线自检

部署脚本已经做了这一遍。手动等价物：

```bash
BASE=https://cf-blog.<你的子域>.workers.dev
for p in / /posts/hello-world/ /style.css /feed.xml /nope; do
  printf "%-24s " "$p"
  curl -s -o /dev/null -w "%{http_code}  %{content_type}\n" "$BASE$p"
done
```

期望值（本机 workerd 实测）：

| 路径 | 状态 | Content-Type | 说明 |
| --- | --- | --- | --- |
| `/` | 200 | `text/html; charset=utf-8` | 首页 |
| `/posts/hello-world/` | 200 | `text/html; charset=utf-8` | 文章页，规范 URL 带尾斜杠 |
| `/style.css` | 200 | `text/css; charset=utf-8` | 样式 |
| `/feed.xml` | 200 | `application/xml` | RSS |
| `/nope` | **404** | `text/html; charset=utf-8` | 自有 404 页 |

再验三个容易静默出错的点：

```bash
# 无尾斜杠应 307 到带斜杠，而不是 404
curl -sI "$BASE/posts/hello-world" | head -3

# _headers 生效：安全头 + 静态资源缓存
curl -sI "$BASE/" | grep -iE 'x-content-type-options|referrer-policy|x-frame-options'
curl -sI "$BASE/style.css" | grep -i cache-control     # public, max-age=3600

# 404 页确实是自己的
curl -s "$BASE/nope" | grep -o '<title>.*</title>'
```

## 5. 把 site.json 的 url 改成线上地址

RSS 和 `og:url` 读的是 `site.json` 的 `url`。第一次部署前它是占位符 `https://blog.example.com`，校验脚本会提示。拿到地址后：

```bash
# 编辑 site.json，把 url 改成 https://cf-blog.<你的子域>.workers.dev
npm run deploy
```

绑了自定义域名就用自定义域名，别再改回去 —— `guid` 变了，订阅者的阅读器会当成新文章。

## 6. 绑定自定义域名

前提：域名 DNS 已在**同一个** Cloudflare 账号下（没有就先 Add a site 并改 NS）。

1. 控制台 → **Workers & Pages** → 选中 `cf-blog`
2. **Settings** → **Domains & Routes** → **Add** → **Custom domain**
3. 填 `blog.你的域名.com` → Add domain

CNAME 与证书自动生成，通常 1–3 分钟生效。

> **大陆网络注意**：`*.workers.dev` 在国内常年不稳定甚至不可达，这是域名层面的问题，不是站点问题。绑自己的域名之后可用性才可控。

## 7. 日常更新

```bash
vim content/posts/新文章.md
npm run deploy
```

3–10 秒。HTML 是 `Cache-Control: public, max-age=0, must-revalidate`，改完立刻可见；`style.css` 有 1 小时缓存，改样式想立刻生效就调 `build.mjs` 里 `_headers` 的 max-age，或加 `?v=2`。

## 8. 备选：提交即上线（Git 集成）

适合会换设备写作的场景。代价是构建依赖 GitHub，大陆直连需要代理。

1. 仓库推到 GitHub（`.gitignore` 已含 `dist/`、`node_modules/`，构建在云端做）
2. 控制台 → Workers & Pages → **Create** → **Connect to Git** → 选仓库
3. Build command `npm run build`，Deploy command `npx wrangler deploy`

走 **Cloudflare Pages** 则是 Build output directory 填 `dist`，命令行等价物 `npm run deploy:pages`。两套都能跑这份产物，区别只在控制台入口与计费归属。

## 9. 错误对照表

| 报错 / 现象 | 原因 | 处理 |
| --- | --- | --- |
| `Compatibility date "..." is in the future` | 本地 workerd 不支持未来日期 | 调早 `wrangler.jsonc` 的 `compatibility_date`（本项目 `2026-04-01`） |
| `You are not authenticated` | 未登录 | `npx wrangler login` |
| `You need to register a workers.dev subdomain` | 账号从未注册过子域 | 控制台 Workers onboarding 注册，或绑自定义域名后走 `routes` |
| `assets directory not found` | 没 build 或路径指错 | `npm run build`；确认 `dist/` 存在 |
| `assets.bucket is a required field` | wrangler < 3.78.10 | `npm install` 用项目内版本 |
| 部署成功但访问全 404 | `assets.directory` 指向项目根而非 `dist` | 改 `wrangler.jsonc` |
| 访问变成下载文件 | HTML 没以 `.html` 落盘，Content-Type 推断失败 | 检查构建产物 |
| 404 显示 Cloudflare 默认页 | `not_found_handling` 未设 `404-page` 或 `dist/404.html` 缺失 | 两者都查；`npm run verify` 会拦 |
| `_headers` 不生效 | 文件名不是 `_headers` 或在子目录 | 放在 `dist/` 顶层 |
| 改完线上没变 | 忘了 deploy / 浏览器缓存 | 重新 deploy + 强制刷新 |
| `npm run deploy` 卡住不动 | 老版本脚本用 `npx wrangler` 触发交互式安装 | 已改用本地 wrangler |

## 10. 配额与费用

| 项目 | 免费版 | 说明 |
| --- | --- | --- |
| 静态资源请求 | **免费、无限制** | 本站只产生这类请求 |
| Worker 脚本请求 | 10 万/天 | 本站无 `main`，不会触发 |
| 静态文件数 / 版本 | 20,000（付费 100,000） | 单文件上限 25 MiB |
| 存储 | 不额外收费 | |

## 11. 回滚

```bash
npx wrangler deployments list     # 最近 10 次部署
npx wrangler rollback [version-id]
```

回滚只切版本指针，不重新上传。内容改坏了直接改回 `.md` 再 deploy 也一样快。

## 12. 手动上传（Pages 直传，拖个 zip 就行）

不需要 wrangler、不需要 workers.dev 子域，全程在浏览器里完成。

**打包**

```bash
npm run pack        # 构建 + 校验 + 生成 cf-blog-dist.zip
```

zip 里 `index.html` 必须在根目录，不能套一层文件夹 —— `npm run pack` 已经保证了这点（可用 `unzip -l cf-blog-dist.zip` 确认）。

**创建项目**

1. 控制台 → **Workers & Pages** → **Create** → **Pages** → **Upload assets**
2. 项目名填 `cf-blog` → 把 zip 拖进去（或直接拖整个 `dist` 文件夹）→ **Deploy site**
3. 得到 `https://cf-blog.pages.dev`（名字被占用会加随机后缀）

**绑你自己的域名**

只做子域名时，**域名不必迁到 Cloudflare**：

1. Pages 项目 → **Custom domains** → **Set up a domain** → 填 `blog.你的域名.com` → Continue
2. 去你现在的 DNS 服务商加一条记录：

   | Type | Name | Content |
   | --- | --- | --- |
   | CNAME | `blog` | `cf-blog.pages.dev` |

3. 等证书签发（几分钟）

顺序不能反：必须先在 Pages 面板关联域名，再去加 CNAME，否则访问会报 522。若域名本来就在同一个 Cloudflare 账号里，CNAME 会自动创建，跳过第 2 步。

要直接挂在裸域（`你的域名.com`）上，则必须把该域加为 Cloudflare zone 并改 NS —— 只做子域名就不用。

**更新**

改完内容重新 `npm run pack`，再拖一次 zip 覆盖部署。Pages 每次上传生成一个新 deployment，旧的可回退。

**注意**

- Direct Upload 项目以后不能改成 Git 集成，要切只能新建项目
- `_headers` 在 Pages 上同样生效
- 拖拽也接受直接拖 `dist` 文件夹
