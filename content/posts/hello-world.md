---
title: 你好，世界
date: 2026-10-31
summary: 第一篇文章。说说这个博客是怎么搭起来的，以及怎么加下一篇。
---

## 为什么是纯静态

这个博客没有数据库，没有后端，没有构建框架。它只有一堆 `.md` 文件和一个 Node 脚本 —— 脚本在本地把 Markdown 编译成 HTML，产物放进 `dist/`，然后整个文件夹推到 Cloudflare 的全球边缘网络。

结果是：**没有服务器要维护，没有运行时成本，没有可以崩掉的东西**。

## 怎么加文章

在 `content/posts/` 里新建一个 `.md` 文件，文件名就是 URL：

```
content/posts/my-new-post.md  ->  /posts/my-new-post/
```

开头写一段 front matter：

```markdown
---
title: 文章标题
date: 2026-11-01
summary: 列表页显示的一句话摘要
draft: false
---
```

`draft: true` 的文章不会出现在产出里。`summary` 可以省略，省略时自动取正文第一段。

## 支持的写法

正文用标准 Markdown 的一个子集，覆盖日常写作需要的东西：

- **粗体**、*斜体*、~~删除线~~、`行内代码`
- 链接：[Cloudflare](https://www.cloudflare.com)
- 图片、引用、有序与无序列表
- 围栏代码块（带语言标记）
- 分隔线

> 引用的样子是这样的。中文行之间的软换行会被合并，不会出现多余空格。

加完文章跑一次：

```bash
npm run build
```

看本地效果用 `npm run dev`，推到线上用 `npm run deploy`。
