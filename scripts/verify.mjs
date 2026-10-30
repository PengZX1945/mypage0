#!/usr/bin/env node
/**
 * 产物校验：在部署之前，用断言代替肉眼。
 * 用法: node scripts/verify.mjs   （npm run verify）
 * 任何一项失败以非零码退出，deploy.sh 会因此中止。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.json'), 'utf8'));

const errors = [];
const warnings = [];

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );

if (!fs.existsSync(DIST)) {
  console.error('✗ dist/ 不存在，先跑 npm run build');
  process.exit(1);
}

const files = walk(DIST);
const htmlFiles = files.filter((f) => f.endsWith('.html')).sort();

/* ── HTML 结构 ── */
for (const file of htmlFiles) {
  const rel = path.relative(DIST, file);
  const html = fs.readFileSync(file, 'utf8');

  if (/[\u0000-\u0008]/.test(html)) errors.push(`${rel}: 残留占位符`);
  if (/\*\*|```|^#{1,6} /m.test(html)) errors.push(`${rel}: 有未渲染的 markdown`);
  if ((html.match(/<h1[\s>]/g) || []).length !== 1) errors.push(`${rel}: h1 数量不是 1`);
  if (!/<title>.+<\/title>/.test(html)) errors.push(`${rel}: 缺 <title>`);
  if (!/<meta name="description"/.test(html)) errors.push(`${rel}: 缺 meta description`);
  if (!/<html lang="[^"]+"/.test(html)) errors.push(`${rel}: <html> 缺 lang`);

  for (const [, href] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|tel:|#|\/\/|data:)/.test(href)) continue;
    const target = href.startsWith('/')
      ? path.join(DIST, href)
      : path.resolve(path.dirname(file), href);
    const candidates = [target, `${target}.html`, path.join(target, 'index.html')];
    if (!candidates.some((c) => fs.existsSync(c) && fs.statSync(c).isFile())) {
      errors.push(`${rel}: 死链 ${href}`);
    }
  }
}

/* ── RSS ── */
const feedPath = path.join(DIST, 'feed.xml');
if (!fs.existsSync(feedPath)) {
  errors.push('feed.xml 缺失');
} else {
  const feed = fs.readFileSync(feedPath, 'utf8');
  if (!feed.startsWith('<?xml')) errors.push('feed.xml: 缺 XML 声明');
  if (!/<rss version="2\.0"/.test(feed)) errors.push('feed.xml: 缺 <rss> 根节点');
  const items = (feed.match(/<item>/g) || []).length;
  const posts = fs.readdirSync(path.join(ROOT, 'content/posts')).filter((f) => f.endsWith('.md')).length;
  if (items === 0) errors.push('feed.xml: 没有任何 item');
  if (items > posts) errors.push(`feed.xml: item 数 ${items} 多于源文件 ${posts}`);

  for (const [, link] of feed.matchAll(/<link>([^<]+)<\/link>/g)) {
    if (!link.startsWith(site.url)) {
      errors.push(`feed.xml: 链接 ${link} 不在 ${site.url} 之下`);
      break;
    }
  }
}

/* ── 配置与产物一致性 ── */
const wrangler = fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8');
const dirMatch = wrangler.match(/"directory"\s*:\s*"([^"]+)"/);
const assetsDir = dirMatch ? dirMatch[1] : null;
if (!assetsDir) errors.push('wrangler.jsonc: 没找到 assets.directory');
else if (path.resolve(ROOT, assetsDir) !== DIST) {
  errors.push(`wrangler.jsonc: assets.directory (${assetsDir}) 与产物目录不一致`);
}
if (!/"not_found_handling"\s*:\s*"404-page"/.test(wrangler)) {
  errors.push('wrangler.jsonc: not_found_handling 不是 "404-page"，自定义 404 不会生效');
}
if (!fs.existsSync(path.join(DIST, '404.html'))) errors.push('dist/404.html 缺失，not_found_handling 无从生效');
if (!fs.existsSync(path.join(DIST, '_headers'))) warnings.push('dist/_headers 缺失，安全头不会生效');

if (/example\.com/.test(site.url)) {
  warnings.push(`site.json 的 url 仍是占位符 ${site.url}，RSS 与 og:url 会指向它`);
}

/* ── 输出 ── */
console.log(`检查 ${htmlFiles.length} 个 HTML、${files.length} 个文件`);
for (const w of warnings) console.log(`  ! ${w}`);

if (errors.length) {
  console.error(`\n✗ ${errors.length} 项失败:`);
  for (const e of errors) console.error(`  · ${e}`);
  process.exit(1);
}
console.log('✓ 全部通过');
