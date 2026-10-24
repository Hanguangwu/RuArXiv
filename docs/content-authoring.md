# 内容仓库编写规范（演示语料）

RuArXiv 的论文正文存放在内容仓库中，本地目录 `content/papers` 是 GitHub 仓库
`papers/` 目录的镜像。每个论文一个不可变目录：

```text
content/papers/<year>/<paperId>-<slug>/
├── paper.md          正文（frontmatter 可省略）
├── metadata.yml      机器可读元数据（推荐，和 paper.md 二选一）
├── discussion.json   GitHub Issue + 评论导出（可选）
└── versions/*.md     历史版本快照（可选）
```

## 1. 目录与 ID

- `paperId`：26 位大写 ULID 风格字符串，只用 `0-9A-Z`，例如 `01J9Z3K7Q2M8V4T6R1N0B5C8XD`。
- 目录名必须是 `<paperId>-<slug>`，`slug` 只能是小写字母、数字、连字符。
- `metadata.yml` 的 `id` 必须等于目录名的 `paperId` 部分。
- 目录一旦创建不可改名；标题变化只改 `metadata.yml`。

## 2. metadata.yml

```yaml
id: "01J9Z3K7Q2M8V4T6R1N0B5C8XD"
title: "检索增强生成中的证据冲突"
authors:
  - name: "林小宇"
    login: "linxiaoyu"
    affiliation: "清华大学 · 计算机系"
  - name: "Sofia Keller"
    login: "sofia-k"
    affiliation: "ETH Zürich"
categories: [cs.CL, cs.IR]
keywords: [retrieval, rag, evaluation]
license: CC-BY-4.0
language: zh-CN
status: published        # draft | review | published | hidden
published_at: "2026-09-18T09:00:00Z"
source_url: "https://arxiv.org/abs/2609.01234"
commit: "9c1f0d2ab7e44d0f8c3a5b6d7e8f9012345678ab"
discussion_issue: 128
pr: 141
```

约束：

- `title` 4–240 字；`abstract` 可选（没有时从正文 `## 摘要` 提取）。
- `authors` 至少 1 人；`login` 只用小写字母、数字、连字符。
- `categories` 至少 1 个，必须取自 `src/lib/constants.ts` 的 `CATEGORIES`（如 `cs.AI`、`cs.CL`、`cs.LG`、`cs.IR`、`social.law_governance`、`math.statistics`、`interdisciplinary.computational_social`）。
- `status` 为 `review` 时论文进入后台审核队列，不出现在公开列表。
- `commit` 用 40 位十六进制字符串，同一个目录内保持不变。
- `discussion_issue` 是 GitHub Issue 编号。

## 3. paper.md

- 不写 frontmatter（元数据都在 `metadata.yml`）。
- 以 `## 摘要` 开头，之后是 `## 1 引言`、`## 2 相关工作`、`## 3 方法`、`## 4 实验`、`## 5 讨论`、`## 参考文献` 等。
- 支持 GFM 表格、列表、代码块、行内公式 `$...$` 与块公式 `$$...$$`。
- 每篇 1200–2500 字中文（或英文），需要有实质内容：问题、方法、实验设置、数字结果、局限性。
- 不要在正文写 HTML 标签或脚本。
- 图片使用 `https://` 绝对地址，或省略。

## 4. discussion.json

```json
{
  "issueNumber": 128,
  "issueUrl": "https://github.com/ruarxiv/papers/issues/128",
  "comments": [
    {
      "id": "1802345678",
      "author": "chenmeng",
      "body": "评论正文，支持 **Markdown**。",
      "createdAt": "2026-09-19T02:14:00Z",
      "reactions": { "+1": 6, "heart": 1 },
      "replies": [
        {
          "id": "1802345999",
          "author": "linxiaoyu",
          "body": "作者回复。",
          "createdAt": "2026-09-19T05:40:00Z",
          "reactions": { "+1": 2 }
        }
      ]
    }
  ]
}
```

- `id` 用 10 位数字字符串，全库唯一。
- `author` 必须是下方演示用户之一（小写 login）。
- 每篇 3–6 条顶级评论，其中至少 1 条带作者回复；评论要有技术含量，可包含质疑、复现问题、补充实验建议。
- `reactions` 只用 `+1`、`heart`、`hooray`、`rocket`、`eyes`。

## 5. versions/*.md（可选）

历史版本快照，每份是完整旧正文，带 frontmatter：

```markdown
---
sha: "1a2b3c4d5e6f708192a3b4c5d6e7f80912345678"
date: "2026-08-02T12:00:00Z"
message: "初稿：补充消融实验"
pr: 133
author: linxiaoyu
---

## 摘要
...
```

## 6. 演示用户（评论/作者只能使用这些 login）

| login | 姓名 | 角色 | 方向 |
|---|---|---|---|
| `linxiaoyu` | 林小宇 | AUTHOR | RAG、评测、NLP |
| `chenmeng` | 陈梦 | AUTHOR | 多模态、视觉语言 |
| `wangzhe` | 王哲 | USER | 分布式系统 |
| `sofia-k` | Sofia Keller | AUTHOR | 统计学习、因果推断 |
| `alex-park` | Alex Park | MODERATOR | 机器学习系统 |
| `zhaoyun` | 赵云 | USER | 优化理论 |
| `meera-i` | Meera Iyer | AUTHOR | 计算物理 |
| `kaito-s` | Kaito Sato | USER | 人机交互 |
| `elena-v` | Elena Volkova | AUTHOR | 密码学 |
| `admin` | 何嘉 | ADMIN | 平台维护 |
