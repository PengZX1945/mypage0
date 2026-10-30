#!/usr/bin/env node
/**
 * 零依赖静态博客生成器
 *   content/posts/*.md  ->  dist 下的静态 HTML
 * 用法: node build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const P = (...a) => path.join(ROOT, ...a);

const site = JSON.parse(fs.readFileSync(P('site.json'), 'utf8'));
const POSTS_DIR = P('content', 'posts');
const ASSETS_DIR = P('assets');
const OUT = P('dist');

/* ────────────────────────── Markdown ────────────────────────── */

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const CJK = /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]/;

/** 行内元素 */
function inline(text) {
  const store = [];
  let s = esc(text).replace(/\u0000/g, '').replace(/\u0002/g, '');

  s = s.replace(/`([^`\n]+)`/g, (_, c) => {
    store.push(`<code>${c}</code>`);
    return `\u0002${store.length - 1}\u0002`;
  });

  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g,
    (_, alt, src) => `<img src="${src}" alt="${alt}" loading="lazy">`);

  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => {
    const ext = /^(https?:)?\/\//.test(href);
    return `<a href="${href}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${t}</a>`;
  });

  s = s
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

  return s.replace(/\u0002(\d+)\u0002/g, (_, i) => store[+i]);
}

/** 软换行合并：中文之间不留空格 */
function joinSoft(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let out = '';
  for (const l of lines) {
    if (!out) { out = l; continue; }
    const a = out.slice(-1);
    const b = l[0];
    out += CJK.test(a) && CJK.test(b) ? l : ' ' + l;
  }
  return out;
}

/** 块级元素 */
function blocks(md) {
  md = md.replace(/\r\n?/g, '\n').replace(/\t/g, '    ');

  const fences = [];
  md = md.replace(/^[ \t]*```([^\n]*)\n([\s\S]*?)^[ \t]*```[ \t]*$/gm, (_, lang, code) => {
    const l = lang.trim().split(/\s+/)[0];
    const cls = /^[\w+#.-]+$/.test(l) ? ` class="language-${l}"` : '';
    fences.push(`<pre><code${cls}>${esc(code.replace(/\n$/, ''))}</code></pre>`);
    return `\n\u0000${fences.length - 1}\u0000\n`;
  });

  const lines = md.split('\n');
  const out = [];
  const para = [];
  let i = 0;

  const flush = () => {
    if (!para.length) return;
    const text = para.join('\n');
    para.length = 0;
    const only = text.trim().match(/^\u0000(\d+)\u0000$/);
    if (only) out.push(fences[+only[1]]);
    else out.push(`<p>${inline(joinSoft(text))}</p>`);
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) { flush(); i++; continue; }

    const fenceOnly = line.trim().match(/^\u0000(\d+)\u0000$/);
    if (fenceOnly) { flush(); out.push(fences[+fenceOnly[1]]); i++; continue; }

    // 缩进代码块
    if (/^ {4}\S/.test(line) && !para.length) {
      const buf = [];
      while (i < lines.length && (/^ {4}/.test(lines[i]) || /^\s*$/.test(lines[i]))) {
        buf.push(lines[i].replace(/^ {4}/, ''));
        i++;
      }
      out.push(`<pre><code>${esc(buf.join('\n').replace(/\n+$/, ''))}</code></pre>`);
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (h) {
      flush();
      const lv = Math.max(2, h[1].length); // h1 留给文章标题
      out.push(`<h${lv}>${inline(h[2])}</h${lv}>`);
      i++;
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push('<hr>'); i++; continue; }

    if (/^>\s?/.test(line)) {
      flush();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${blocks(buf.join('\n'))}</blockquote>`);
      continue;
    }

    // 表格
    if (/^\s*\|(.+)\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      flush();
      const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const head = cells(lines[i]);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|(.+)\|\s*$/.test(lines[i])) {
        rows.push(cells(lines[i]));
        i++;
      }
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>` +
          `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,
      );
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      flush();
      const buf = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      out.push(`<ul>${buf.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      flush();
      const buf = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i++;
      }
      out.push(`<ol>${buf.map((t) => `<li>${inline(t)}</li>`).join('')}</ol>`);
      continue;
    }

    para.push(line);
    i++;
  }
  flush();

  return out.join('\n').replace(/\u0000(\d+)\u0000/g, (_, n) => fences[+n]);
}

/* ────────────────────────── 文章解析 ────────────────────────── */

function parsePost(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
  const meta = {};
  let body = raw;
  const fm = raw.match(/^---\n([\s\S]*?)\n---[ \t]*\n?/);
  if (fm) {
    body = raw.slice(fm[0].length);
    for (const line of fm[1].split('\n')) {
      const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
      if (!kv) continue;
      let v = kv[2].trim();
      if (/^".*"$|^'.*'$/.test(v)) v = v.slice(1, -1);
      else if (v === 'true' || v === 'false') v = v === 'true';
      else if (/^\[.*\]$/.test(v)) {
        v = v.slice(1, -1).split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      }
      meta[kv[1]] = v;
    }
  }

  const slug = path.basename(file, '.md');
  const dateStr = String(meta.date || fs.statSync(file).mtime.toISOString()).slice(0, 10);
  const date = new Date(dateStr + 'T00:00:00Z');

  // 摘要：front matter 优先，否则取正文首段
  let summary = meta.summary || '';
  if (!summary) {
    const first = body.split(/\n\s*\n/).find((p) => p.trim() && !/^#/.test(p.trim())) || '';
    summary = first.replace(/[#>*`_\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90);
  }

  const cjkChars = (body.match(/[\u4e00-\u9fff]/g) || []).length;
  const latinWords = (body.replace(/[\u4e00-\u9fff]/g, ' ').match(/[A-Za-z0-9']+/g) || []).length;
  const minutes = Math.max(1, Math.round(cjkChars / 350 + latinWords / 200));

  return {
    slug,
    meta,
    body,
    date,
    dateStr,
    title: String(meta.title || slug),
    summary: String(summary),
    draft: meta.draft === true,
    minutes,
  };
}

/* ────────────────────────── 模板 ────────────────────────── */

function layout({ title, description, body, rel = '', url = '', type = 'website', home = false, noindex = false }) {
  const pageTitle = title ? `${esc(title)} · ${esc(site.title)}` : esc(site.title);
  const homeHref = rel || './';
  const brand = `<a class="brand" href="${homeHref}">${esc(site.title)}</a>`;
  return `<!doctype html>
<html lang="${site.lang || 'zh-CN'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}<title>${pageTitle}</title>
<meta name="description" content="${esc(description || site.description || '')}">
<meta property="og:title" content="${esc(title || site.title)}">
<meta property="og:description" content="${esc(description || site.description || '')}">
<meta property="og:type" content="${type}">
${url ? `<meta property="og:url" content="${esc(url)}">` : ''}
<link rel="stylesheet" href="${rel}style.css">
<link rel="alternate" type="application/rss+xml" title="${esc(site.title)}" href="${rel}feed.xml">
</head>
<body>
<div class="wrap">
  <header class="site">
    ${home ? `<h1>${brand}</h1>` : brand}
    <nav>
      <a href="${homeHref}">文章</a>
      <a href="${rel}feed.xml">RSS</a>
    </nav>
  </header>
  ${body}
  <footer class="site">
    <span>© ${new Date().getFullYear()} ${esc(site.author || site.title)}</span>
    <span>Powered by plain HTML</span>
  </footer>
</div>
</body>
</html>
`;
}

function postListItem(p) {
  return `      <li>
        <a class="title" href="posts/${p.slug}/">${esc(p.title)}</a>
        <div class="meta"><time datetime="${p.dateStr}">${p.dateStr}</time><span>${p.minutes} 分钟</span></div>
        <p class="summary">${esc(p.summary)}</p>
      </li>`;
}

function postPage(p) {
  return layout({
    title: p.title,
    description: p.summary,
    rel: '../../',
    url: `${site.url}/posts/${p.slug}/`,
    type: 'article',
    body: `  <article class="post">
    <header>
      <h1>${esc(p.title)}</h1>
      <div class="meta"><time datetime="${p.dateStr}">${p.dateStr}</time><span>${p.minutes} 分钟</span></div>
    </header>
    <div class="body">
${blocks(p.body)}
    </div>
  </article>
  <p style="margin-top:3rem"><a href="../../">← 返回文章列表</a></p>`,
  });
}

/* ────────────────────────── 输出 ────────────────────────── */

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'posts'), { recursive: true });

const posts = fs
  .readdirSync(POSTS_DIR)
  .filter((f) => f.endsWith('.md'))
  .map((f) => parsePost(path.join(POSTS_DIR, f)))
  .filter((p) => !p.draft)
  .sort((a, b) => b.date - a.date);

// 首页
fs.writeFileSync(
  path.join(OUT, 'index.html'),
  layout({
    title: '',
    description: site.description,
    url: site.url,
    home: true,
    body: `  <ul class="post-list">
${posts.map(postListItem).join('\n')}
  </ul>`,
  }),
);

// 文章页
for (const p of posts) {
  fs.mkdirSync(path.join(OUT, 'posts', p.slug), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'posts', p.slug, 'index.html'), postPage(p));
}

// RSS
const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(site.title)}</title>
    <link>${esc(site.url)}</link>
    <description>${esc(site.description || '')}</description>
    <language>${site.lang || 'zh-CN'}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${esc(site.url)}/feed.xml" rel="self" type="application/rss+xml"/>
${posts
  .map(
    (p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${esc(site.url)}/posts/${p.slug}/</link>
      <guid>${esc(site.url)}/posts/${p.slug}/</guid>
      <pubDate>${p.date.toUTCString()}</pubDate>
      <description>${esc(p.summary)}</description>
    </item>`,
  )
  .join('\n')}
  </channel>
</rss>
`;
fs.writeFileSync(path.join(OUT, 'feed.xml'), rss);

// 404
fs.writeFileSync(
  path.join(OUT, '404.html'),
  layout({
    title: '页面不存在',
    description: '',
    noindex: true,
    body: `  <h1>404</h1>
  <p>这一页不存在，或者已经被移走了。</p>
  <p><a href="/">回到首页</a></p>`,
  }),
);

// 静态资源
fs.cpSync(ASSETS_DIR, OUT, { recursive: true });

// 安全头
fs.writeFileSync(
  path.join(OUT, '_headers'),
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN

/style.css
  Cache-Control: public, max-age=3600
`,
);

console.log(`✓ 生成 ${posts.length} 篇文章 -> dist/`);
for (const p of posts) console.log(`   · ${p.dateStr}  ${p.title}  (posts/${p.slug}/)`);
