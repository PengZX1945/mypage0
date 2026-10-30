#!/usr/bin/env bash
# 一键上云：环境检查 → 构建 → 校验 → 预检 → 部署 → 线上自检
# 用法: npm run deploy  或  bash scripts/deploy.sh
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT=$(pwd)

say()  { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '  \033[31m✗\033[0m %s\n' "$*"; exit 1; }

# 优先用本地 devDependency，没装则用 npx（-y 避免交互式安装提示卡住脚本）
if [ -x "$ROOT/node_modules/.bin/wrangler" ]; then
  WRANGLER="$ROOT/node_modules/.bin/wrangler"
else
  WRANGLER="npx -y wrangler@latest"
  warn "未找到本地 wrangler，改用 npx（首次会下载约 200 MB）"
fi

say "1/6 环境检查"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 18 ] || die "Node 版本过低（$NODE_MAJOR），需要 18+"
ok "node $(node -v)"
ok "wrangler $($WRANGLER --version 2>/dev/null | tail -1)"

say "2/6 构建"
node build.mjs | sed 's/^/  /'

say "3/6 产物校验"
node scripts/verify.mjs | sed 's/^/  /' || die "校验未通过，已中止部署"

say "4/6 登录状态"
WHO=$($WRANGLER whoami 2>/dev/null || true)
if ! echo "$WHO" | grep -q "logged in"; then
  die "未登录。先执行: npx wrangler login（或 export CLOUDFLARE_API_TOKEN=...）"
fi
ACCOUNT_ID=$(echo "$WHO" | grep -oE '[0-9a-f]{32}' | head -1 || true)
echo "$WHO" | grep -E "logged in|Account Name|│" | head -4 | sed 's/^/  /'

say "5/6 部署"
if ! DRY=$($WRANGLER deploy --dry-run 2>&1); then
  echo "$DRY" | sed 's/^/  /'; die "dry-run 失败"
fi
echo "$DRY" | grep -E "Read .* files" | sed 's/^/  /'
LOG=$(mktemp)
if ! $WRANGLER deploy 2>&1 | tee "$LOG" | sed 's/^/  /'; then
  if grep -qi "workers.dev subdomain" "$LOG"; then
    printf '\n  \033[33m!\033[0m 账号还没有 workers.dev 子域，wrangler 无法发布\n'
    printf '    去注册（一次性，全账号共用）: https://dash.cloudflare.com/%s/workers/onboarding\n' "${ACCOUNT_ID:-}"
    printf '    想先看线上效果，可以发到临时预览账号: npx wrangler deploy --temporary\n'
    printf '    或绑定自定义域名后再部署: wrangler.jsonc 里加 "routes"\n\n'
  fi
  die "部署失败，完整输出见 $LOG"
fi
URL=$(grep -oE 'https://[A-Za-z0-9._-]+\.workers\.dev' "$LOG" | head -1 || true)
[ -n "$URL" ] || die "部署输出里没找到 workers.dev 地址，见 $LOG"
ok "已部署: $URL"

say "6/6 线上自检"
fail=0
probe() {
  local p=$1 expect=$2
  local code
  code=$(curl -s -o /dev/null --max-time 20 -w '%{http_code}' "$URL$p" 2>/dev/null) || code=000
  if [ "$code" = "$expect" ]; then
    printf '  \033[32m✓\033[0m %-24s %s\n' "$p" "$code"
  elif [ "$code" = "000" ]; then
    printf '  \033[33m!\033[0m %-24s 连不上（大陆网络访问 workers.dev 常被阻断）\n' "$p"
  else
    printf '  \033[31m✗\033[0m %-24s %s（期望 %s）\n' "$p" "$code" "$expect"; fail=1
  fi
}
probe / 200
probe /posts/hello-world/ 200
probe /style.css 200
probe /feed.xml 200
probe /nope 404

if [ "$fail" -eq 0 ]; then
  printf '\n\033[32m上线完成\033[0m %s\n' "$URL"
else
  printf '\n\033[33m部署成功但线上检查有失败项，看上面的 ✗\033[0m\n'
fi

if grep -q 'example.com' "$ROOT/site.json"; then
  printf '\n下一步: 把 site.json 的 url 改成 %s，再跑一次 npm run deploy\n' "$URL"
fi
exit "$fail"
