# RuArXiv

一个以 GitHub 为内容源与审计源、以论坛方式组织的论文站点。

论文正文是内容仓库里的 Markdown，元数据是可校验的 YAML，讨论是 GitHub Issue / Issue Comment。
网站不把 GitHub 当在线数据库，而是维护自己的只读索引与业务数据（用户、投票、举报、审核、审计）。
仓库中的 `content/papers` 是内容仓库的本地镜像；没有 GitHub 凭据时，可通过 `ALLOW_DEMO_LOGIN=true` 使用本地演示登录体验界面。

> **部署目标：完全运行在 Vercel 上。**
> 关系库用 Neon Postgres、缓存/限流用 Upstash Redis（均通过 Vercel Marketplace 接入），
> 文件用 Vercel Blob，异步任务用 Vercel Queues + Workflows，定时对账用 Vercel Cron。
> **阶段 1 已完成**：Prisma 已从 SQLite 切换到 Neon Postgres，初始迁移已入库。
> 文件写入、Webhook、队列、缓存与 Blob 仍在迁移中；状态与步骤见
> [技术方案 §17](docs/基于%20GitHub%20与%20Vercel%20的论坛风格%20ArXiv%20网站技术设计.md#17-从当前代码迁移)。

> 设计依据：[基于 GitHub 与 Vercel 的论坛风格 ArXiv 网站技术设计](docs/基于%20GitHub%20与%20Vercel%20的论坛风格%20ArXiv%20网站技术设计.md)
>
> 内容规范：[docs/content-authoring.md](docs/content-authoring.md)
>
> 协作者约束：[AGENTS.md](AGENTS.md)

---

## 运行形态

```mermaid
flowchart LR
  U[浏览器] --> V[Vercel CDN / Firewall]
  V --> N[Next.js 16 on Vercel Functions]
  N --> PG[(Neon Postgres)]
  N --> R[(Upstash Redis)]
  N --> B[Vercel Blob]
  N --> Q[Vercel Queues]
  N --> G[GitHub API]
  G -->|webhook| N
  C[Vercel Cron] --> N
```

| 能力 | 选型 | 说明 |
|---|---|---|
| 页面 / API | Next.js 16 App Router + Vercel Functions | Node.js runtime、Fluid compute；公开页面缓存，详情 SSR/ISR |
| 数据库 | **Neon Postgres**（Vercel Marketplace） | `DATABASE_URL` 池化，`DATABASE_URL_UNPOOLED` 迁移；Preview 用独立分支 |
| 缓存 / 限流 | **Upstash Redis**（Vercel Marketplace） | REST 客户端，适合 Serverless；只做缓存、限流、幂等键 |
| 页面缓存 | Next.js `use cache` / ISR / Vercel Runtime Cache | 写后 `revalidateTag` |
| 异步任务 | **Vercel Queues**（Beta） | Webhook 入队、评论镜像、PR 创建重试 |
| 长任务 | **Vercel Workflows** | 全量回填、跨步骤对账、可暂停/重试 |
| 定时 | **Vercel Cron** | 每日对账；Hobby 每天一次，Pro 每分钟 |
| 文件 | **Vercel Blob** | PDF/图片；>4.5 MB 用 client upload |
| 搜索 | Postgres `pg_trgm` | 中文子串检索；规模上升再接 Upstash Search |
| 身份/内容源 | GitHub OAuth/App + Issue | 外部依赖，保持不变 |

> 注意：Vercel 现在**没有第一方 Postgres/Redis 引擎**。“Vercel Postgres / Vercel KV” 已是历史产品；
> 官方文档中的数据库能力由 Neon、Upstash 等 Marketplace 供应商提供，Vercel 负责开通、注入环境变量和统一账单。
> 第一方能力是 Blob、Queues、Workflows、Cron、Runtime Cache、Firewall。

---

## 快速开始（Neon Postgres）

### 1. 准备数据库连接

推荐通过 Vercel Marketplace 创建 Neon，并连接 Development / Preview / Production：

```bash
pnpm install
vercel link
vercel env pull .env          # Prisma CLI 读取 .env；Next.js 也会加载它
```

如果暂时没有 Vercel 项目，也可以在 Neon 控制台创建项目，把 Pooled 与 Direct 连接串写入 `.env`：

```dotenv
DATABASE_URL="postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=5"
DATABASE_URL_UNPOOLED="postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require"
```

> `DATABASE_URL` 供应用运行时使用（池化）；`DATABASE_URL_UNPOOLED` 供 `prisma migrate` 使用（直连）。
> 不要把 Production 的连接串用于本地开发。

### 2. 初始化并启动

```bash
pnpm db:deploy   # 应用 prisma/migrations
pnpm dev         # http://localhost:3000
```

数据库默认是空的，不包含演示论文或演示用户。论文通过内容同步导入，用户通过 GitHub 登录或邀请产生。

> 演示登录默认关闭。仅在本地 UI 调试时可设置 `ALLOW_DEMO_LOGIN=true`；登录页会按需创建三个演示账号。生产环境必须保持 `false`。
>
> `db:reset` 会删除当前数据库中的所有数据，只能在 Neon Development 分支使用。

开启演示登录后，登录页提供三个本地账号：

| 演示身份 | 账号 | 权限 |
|---|---|---|
| 读者 | `wangzhe` | 浏览、搜索、投票、举报 |
| 作者 | `linxiaoyu` | 提交论文、评论（AUTHOR） |
| 管理员 | `admin` | 审核、下架、处理举报、触发同步（ADMIN） |

> 演示账号只用于本地体验，不会写入真实仓库。生产与共享 Preview 禁止开启演示登录。

### 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 开发服务器 |
| `pnpm build` / `pnpm start` | 生产构建（含 `prisma migrate deploy`）与启动 |
| `pnpm typecheck` | TypeScript 检查 |
| `pnpm validate` | 校验 `content/papers` 的目录、Schema、安全规则 |
| `pnpm check` | typecheck + validate |
| `pnpm sync` | 把本地 `content/papers` 同步进数据库（仅开发） |
| `pnpm sync --github` | 从配置的 GitHub 仓库拉取并同步 |
| `pnpm db:generate` | 生成 Prisma Client |
| `pnpm db:migrate` | 创建/应用开发分支迁移（`prisma migrate dev`） |
| `pnpm db:deploy` | 应用已提交的迁移（Preview/Production） |
| `pnpm db:reset` | 重建 Development 分支数据库（不导入种子） |

### 部署相关命令

| 命令 | 作用 |
|---|---|
| `vercel link` | 关联 Vercel 项目 |
| `vercel env pull .env` | 拉取 Neon/Upstash/Blob 环境变量 |
| `vercel dev` | 本地模拟 Vercel 环境（可选） |
| `pnpm test` | 单元/集成测试（待补充） |

---

## 部署到 Vercel

> 数据库已切换到 Neon Postgres，但 §17 中“移除运行时文件写入 / Webhook 入队 / 队列消费者”等步骤尚未完成。
> 在这些步骤完成前，直接部署仍会因本地文件写入与同步逻辑而失败。

### 1. 准备托管资源

1. **Neon Postgres**：Vercel Dashboard → Storage / Marketplace → Neon，选择与 Functions 相同的区域，创建数据库并连接 Production / Preview / Development。
2. **Upstash Redis**：Marketplace → Upstash Redis，创建数据库；记录 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`。
3. **Vercel Blob**：Storage → Blob，创建 store。已发布论文资源用 public store；待审核稿件用 private store（访问模式创建后不可改）。
4. **GitHub App / OAuth App**：配置回调、Webhook、仓库权限。

### 2. 配置环境变量

```dotenv
DATABASE_URL=postgresql://...-pooler.../neondb?sslmode=require&pgbouncer=true
DATABASE_URL_UNPOOLED=postgresql://.../neondb?sslmode=require

AUTH_SECRET=...
ALLOW_DEMO_LOGIN=false
ALLOW_OPEN_SIGNUP=false
NEXT_PUBLIC_SITE_URL=https://your.site

GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_APP_ID=...
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n"
GITHUB_INSTALLATION_ID=...
GITHUB_WEBHOOK_SECRET=...
GITHUB_CONTENT_REPO=owner/papers
GITHUB_CONTENT_BRANCH=main
GITHUB_REDIRECT_URI=https://your.site/api/v1/auth/github/callback

UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
BLOB_READ_WRITE_TOKEN=...
```

Neon 集成会自动注入 `DATABASE_URL` / `DATABASE_URL_UNPOOLED` 以及兼容用的 `POSTGRES_*`。
Upstash 集成注入 `UPSTASH_REDIS_REST_*`；旧 `KV_*` 变量仅作兼容。

### 3. 构建命令

```bash
prisma generate && prisma migrate deploy && next build
```

- 生产禁止 `prisma db push`。
- Preview 使用 Neon Preview Branch，迁移自动应用到分支库。
- 发布串行化，避免多个 Deployment 同时跑迁移。

### 4. 定时与队列

`vercel.json` 示例：

```json
{
  "regions": ["sin1"],
  "crons": [
    { "path": "/api/cron/reconcile", "schedule": "0 3 * * *" }
  ]
}
```

Next.js App Router 的函数时长写在路由文件里，而不是 `vercel.json`：

```ts
// src/app/api/webhooks/github/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// src/app/api/queues/content-sync/route.ts
export const runtime = "nodejs";
export const maxDuration = 300;
```

- Hobby 的 Cron 只能每天一次，精度 ±59 分钟；生产建议 Pro。
- Queue 消费者在 `vercel.json` 中声明 trigger，是私有函数，无公开 URL。
- Webhook 地址：`https://your.site/api/webhooks/github`，Content type `application/json`。

### 5. 发布后检查

1. 首页、详情、搜索、登录、评论各跑一遍。
2. 手动触发一次 `/api/cron/reconcile`，确认 GitHub head 与 `RepositoryCursor` 一致。
3. 合并一个测试 PR，确认 60 秒内页面出现新版本。
4. 重放同一个 Webhook delivery 10 次，确认不产生重复版本/评论/计数。

---

## 目录结构

```text
content/papers/<year>/<paperId>-<slug>/
  metadata.yml         # 机器可读元数据（zod 校验）
  paper.md             # 正文（Markdown + LaTeX）
  discussion.json      # Issue 评论快照
  versions/*.md        # 历史版本快照
prisma/schema.prisma   # 用户、论文、版本、评论、投票、举报、同步事件、审计
scripts/validate-content.ts
schemas/paper-metadata.schema.json
src/lib/content.ts     # 内容仓库解析（本地与 GitHub 共用）
src/lib/ingest.ts      # 幂等入库：论文、版本、评论、审计
src/lib/sync.ts        # GitHub 拉取同步、Issue 增量同步
src/lib/queries.ts     # 读模型：列表、详情、搜索、排行、后台
src/lib/participation.ts # 投票与评论服务（Web 与 API 共用）
src/lib/github.ts      # OAuth、GitHub App JWT、Issue/PR 写入
src/lib/auth.ts        # Session、邀请制、角色、Demo 登录（默认关闭）
src/app/actions.ts     # 服务端写操作
src/app/api/v1/**      # 公开读 API + 写 API
src/app/api/webhooks/github/route.ts
```

迁移后新增：

```text
src/app/api/queues/**  # Vercel Queues 消费者
src/app/api/cron/**    # Vercel Cron 入口
src/app/api/blob/**    # Blob client upload token / 完成回调
src/workflows/**       # Vercel Workflows（全量回填、对账）
```

---

## 核心流程

### 论文提交（PR 优先，但数据库先行）

1. 作者在 `/submit` 填写元数据与 Markdown 正文。
2. 服务端校验后，在 Postgres 事务中创建 `Paper`（`PENDING_REVIEW`）、`PaperVersion`、审计与 `GitHubWriteJob`。
3. 立即返回详情页；后台消费者创建分支与 PR，保存 `prNumber` / `prUrl`。
4. GitHub Actions 执行 `pnpm validate`（Schema、目录命名、脚本注入、大小限制）。
5. 合并后 `push` Webhook 触发同步，写入新版本；论文仍保持待审核，直到管理员在站内批准。
6. 批准后公开，按 tag 失效缓存；每次合并保留 commit SHA、PR、父提交与内容哈希。

> 关键变化：**运行时不再写 `content/papers`**。Vercel 文件系统只读，提交内容存数据库，GitHub PR 异步创建。

### 讨论（Issue 映射）

- 每篇论文对应一个带 `paper-discussion` 标签的 Issue（`githubIssueNumber`）。
- 评论先做登录/角色/频率校验，再写本地 `Comment`，然后异步入队镜像到 GitHub。
- 镜像失败保留本地评论并重试，写 `GitHubWriteJob` / `SyncEvent` 审计。
- 评论保存 `bodySnapshot`、GitHub 评论 id 与来源链接；展示排序由本地索引完成。

### 同步与一致性

- Webhook 先验签（`X-Hub-Signature-256`），再用 `SyncEvent.deliveryId` 唯一约束去重。
- 验签通过后只写事件并入队，立即返回 202；不在请求中扫描仓库。
- `push` 走增量 compare + 分批；首次全量/历史重建用 Vercel Workflow。
- `issue_comment` 用 `since` 游标增量拉取，避免全量覆盖。
- 每日 Cron 对账：GitHub head 与 `RepositoryCursor` 不一致、或存在 `FAILED` 事件时启动修复。
- 页面展示 `syncedAt`、commit 链接与 GitHub 原始链接，便于复核。

---

## 数据模型要点

- **用户**以不可变 `github_user_id` 关联，`login` 仅展示；角色为 `USER / INVITED_USER / AUTHOR / MODERATOR / ADMIN`。
- **Paper** 的 `id` 即对外 `paperId`，URL 使用它而不是标题；`slug` 只用于内容目录。
- **PaperVersion** 每个 commit 一行，`isCurrent` 标记当前版本，正文快照用于 diff 与索引。
- **Vote** 唯一约束 `(paperId, userId)`，本地事实来源；“赞”可镜像到 GitHub reaction，MVP 先记录本地。
- **SyncEvent** 作为 Webhook outbox：`deliveryId` 唯一，记录 `status / attempts / nextAttemptAt / lastError`。
- **GitHubWriteJob** 记录 PR 创建、评论镜像等出站写的重试。
- **Asset** 记录 Vercel Blob 的 pathname、URL、SHA-256、大小、MIME 与可见性。
- **AuditLog** 覆盖提交、审核、下架、举报、同步等动作。

目标 schema 详见[技术方案 §13](docs/基于%20GitHub%20与%20Vercel%20的论坛风格%20ArXiv%20网站技术设计.md#13-数据模型目标)。

---

## API

所有列表使用 cursor 分页，返回 `source`、`commitSha`、`syncedAt` 等溯源字段。

```text
GET  /api/v1/papers?query=&category=&author=&sort=&cursor=&limit=
GET  /api/v1/papers/:id
GET  /api/v1/papers/:id/versions
GET  /api/v1/papers/:id/diff?from=&to=
GET  /api/v1/papers/:id/discussion?sort=oldest|top
POST /api/v1/papers/:id/discussion/comments   { body, parentId? }
POST /api/v1/papers/:id/vote                  { value: 1 | -1 }
POST /api/v1/papers/:id/report                { reason, detail?, commentId? }
GET  /api/v1/auth/github/start?next=
GET  /api/v1/auth/github/callback
POST /api/v1/auth/logout
GET  /api/v1/me
POST /api/v1/sync                             (MODERATOR 或 x-sync-token)
POST /api/webhooks/github                      (GitHub App)
```

迁移后新增：

```text
POST /api/blob/upload                 # 生成 client upload token
POST /api/blob/upload-completed       # Blob 完成回调
POST /api/queues/content-sync         # 队列消费者（私有）
POST /api/queues/discussion-sync
POST /api/queues/github-write
GET  /api/cron/reconcile              # Vercel Cron
```

---

## 接入真实 GitHub

本项目把 GitHub 集成拆成两个应用。不要试图只用一个 OAuth App 完成所有事情：

| 能力 | 应用 | 说明 |
|---|---|---|
| 登录 | **GitHub OAuth App** | 读取 GitHub 身份与已验证邮箱，不访问仓库 |
| Issue 评论、创建 PR、内容同步 | **GitHub App** | 安装到内容仓库，用安装令牌读写 Issue、PR、Contents |
| Webhook | **GitHub App** | 接收 `push`、`issues`、`issue_comment` |

当前代码的开关：

- `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` 都存在时，登录页显示 GitHub 登录；
- `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` + `GITHUB_INSTALLATION_ID` 都存在时，才允许向 GitHub 镜像评论或创建 PR；
- `GITHUB_CONTENT_REPO` 指定内容仓库，`GITHUB_CONTENT_BRANCH` 指定默认分支。

> 通用概念、OAuth/App 差异和 Token 流程见：[GitHub OAuth App 与 GitHub App 完全指南](docs/blog/github-oauth-vs-github-apps.md)。

### 1. 准备稳定域名

下面统一用 `https://your-domain` 表示生产域名。实际填写时替换为：

- Vercel 生产域名，例如 `https://ruarxiv.vercel.app`；
- 或已经绑定到 Vercel 的自定义域名。

不要使用 `https://ruarxiv-xxxx.vercel.app` 这类每次部署都会变化的 Preview 地址。回调地址、Webhook 和 `GITHUB_REDIRECT_URI` 必须使用同一个稳定域名。

### 2. 创建 GitHub OAuth App（只负责登录）

GitHub → Settings → Developer settings → OAuth Apps → New OAuth App。

| 字段 | 填写 |
|---|---|
| Application name | `RuArXiv` |
| Homepage URL | `https://your-domain` |
| Application description | 可选 |
| Authorization callback URL | `https://your-domain/api/v1/auth/github/callback` |

注意：

- OAuth App 只有 **一个** Authorization callback URL，不是多个 Redirect URI。
- 必须与 `GITHUB_REDIRECT_URI` 完全一致：协议、域名、路径、大小写都不能差。
- 末尾不要多加 `/`。
- 代码只请求 `read:user user:email`，不会请求 `repo`，所以 GitHub 登录本身没有仓库权限。

创建后记录 Client ID，并生成 Client Secret，填入 Vercel：

```dotenv
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_REDIRECT_URI=https://your-domain/api/v1/auth/github/callback
```

重新部署后，登录页应出现“使用 GitHub 登录”。

### 3. 创建 GitHub App（评论、PR、Webhook）

GitHub → Settings → Developer settings → GitHub Apps → New GitHub App。

#### 基本信息

| 字段 | 填写 |
|---|---|
| GitHub App name | `RuArXiv Content Bot` 或类似，必须全 GitHub 唯一 |
| Homepage URL | `https://your-domain` |
| Description | 可选 |

#### Identifying and authorizing users

| 字段 | 填写 |
|---|---|
| Callback URL | 留空；登录已经由 OAuth App 负责 |
| Expire user authorization tokens | 按需 |
| Request user authorization (OAuth) during installation | 不勾选 |

Callback URL 不是 Webhook URL；如果登录由 OAuth App 负责，这里留空即可。

只有当你打算“只用一个 GitHub App 同时做登录”时，才需要把 Callback URL 填成：

```text
https://your-domain/api/v1/auth/github/callback
```

#### Post installation

| 字段 | 填写 |
|---|---|
| Setup URL | 留空 |
| Redirect on update | 不勾选 |

#### Webhook

| 字段 | 填写 |
|---|---|
| Active | 勾选 |
| Webhook URL | `https://your-domain/api/webhooks/github` |
| Secret | 随机字符串，填入 `GITHUB_WEBHOOK_SECRET` |
| SSL verification | Enable |

生成 secret：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### Repository permissions

| 权限 | 级别 | 用途 |
|---|---|---|
| Contents | Read and write | 读取内容、创建分支和提交 |
| Issues | Read and write | 读写 Issue 评论 |
| Pull requests | Read and write | 创建论文 PR |
| Metadata | Read-only | GitHub 强制要求 |

如果现在只测试评论，Contents 也可以先给 Read；阶段 2 要创建 PR，建议直接给 Write。

#### Subscribe to events

勾选：

```text
Push
Issues
Issue comment
Installation
```

`Pull request` 当前消费者没有处理，可以不勾。

#### Where can this GitHub App be installed?

个人仓库选 `Only on this account`；内容仓库属于组织时，选对应组织或 `Any account` 后安装到组织。

### 4. 安装 GitHub App

创建 App 只是注册，不会自动获得仓库权限。

1. 记录 **App ID**（数字，不是 Client ID）。
2. 点击 **Generate a private key**，下载 `.pem`。
3. 点击 **Install App**，选择账号/组织。
4. 只勾选内容仓库，例如 `Hanguangwu/RuArXiv`。
5. 安装完成后，浏览器地址类似：
   ```text
   https://github.com/settings/installations/12345678
   ```
   最后的 `12345678` 就是 `GITHUB_INSTALLATION_ID`。

`GITHUB_CONTENT_REPO` 必须与安装的仓库一致：

```dotenv
GITHUB_CONTENT_REPO=Hanguangwu/RuArXiv
GITHUB_CONTENT_BRANCH=main
```

如果内容仓库是独立仓库，则改成对应的 `owner/repo`。

### 5. 配置 Vercel 环境变量

```dotenv
# GitHub OAuth App：登录
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_REDIRECT_URI=https://your-domain/api/v1/auth/github/callback

# GitHub App：评论、PR、Webhook
GITHUB_APP_ID=...
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n"
GITHUB_INSTALLATION_ID=...
GITHUB_WEBHOOK_SECRET=...
GITHUB_CONTENT_REPO=Hanguangwu/RuArXiv
GITHUB_CONTENT_BRANCH=main

# 站点自身
AUTH_SECRET=...
ALLOW_OPEN_SIGNUP=false
```

说明：

- OAuth App 的 `GITHUB_CLIENT_ID` 与 GitHub App 的 `GITHUB_APP_ID` 不是一回事。
- `GITHUB_APP_PRIVATE_KEY` 可以粘贴多行 PEM；如果只能单行输入，把换行写成 `\n`，代码会还原。
- 环境变量要勾选正确的环境（Production / Preview / Development）。
- 修改环境变量后必须重新部署，旧部署不会自动读取新值。
- `AUTH_SECRET` 必须是 32 字节以上的随机值，不要使用开发默认值。

### 6. Webhook 设置

- Content type 使用 `application/json`。
- GitHub 会发送 `X-Hub-Signature-256`，服务端用 `GITHUB_WEBHOOK_SECRET` 验签。
- `X-GitHub-Delivery` 用于幂等去重。
- 当前消费者处理 `push`、`issues`、`issue_comment`；其他事件会记录后忽略。
- 当前 MVP 在 Webhook 请求内同步执行；生产迁移后应改为验签、入队、尽快返回 202。

### 7. 本地与 Preview

OAuth App 只有一个回调地址，因此：

- 本地开发建议**单独创建一个 OAuth App**：
  ```text
  Homepage URL:
  http://localhost:3000

  Authorization callback URL:
  http://localhost:3000/api/v1/auth/github/callback
  ```
  本地 `.env` 使用这个 App 的 Client ID/Secret，并设置：
  ```dotenv
  GITHUB_REDIRECT_URI=http://localhost:3000/api/v1/auth/github/callback
  ```
- Preview 域名每次变化，最容易出现 `redirect_uri_mismatch`。最简单策略是 Preview 禁用 GitHub 登录；如果仍需要登录，只有在显式设置 `ALLOW_DEMO_LOGIN=true` 时才能使用演示登录（不建议用于共享 Preview），或者为 Preview 单独创建 OAuth App，或改用 GitHub App 的用户授权（最多 10 个 callback URL）。
- `GITHUB_REDIRECT_URI` 要按环境分别设置，不要在生产、Preview、本地共用一个值。

### 8. 首次登录、邀请与角色

- 如果数据库为空，第一个 GitHub 登录用户自动成为 `ADMIN`。
- 如果数据库已有其他用户（包括历史演示用户），新 GitHub 用户会被判定为“非第一个用户”，需要邀请或临时开放注册。
- 临时开放注册：
  ```dotenv
  ALLOW_OPEN_SIGNUP=true
  ```
  用 GitHub 登录成功后，建议改回 `false`。
- 把自己的账号提升为管理员，在 Neon SQL Editor 执行：
  ```sql
  UPDATE "User"
  SET role = 'ADMIN'
  WHERE login = '你的GitHub用户名';
  ```
- GitHub 登录只确认身份；发帖、审核、投票权限仍由站内角色决定。
- 生产环境保持 `ALLOW_DEMO_LOGIN=false`，否则任何人都可以通过演示登录获得管理员身份。

### 9. 验证 Issue 评论

评论写入分两步：

1. 先写本地 `Comment`；
2. 如果 `GITHUB_CONTENT_REPO` 和 GitHub App 都已配置，再 best-effort 镜像到 GitHub Issue。

需要确认：

- GitHub App 已安装到 `GITHUB_CONTENT_REPO` 对应的仓库；
- 论文有真实的 `githubIssueNumber`；
- `GITHUB_APP_ID`、私钥、`GITHUB_INSTALLATION_ID` 都正确。

注意：内容仓库里的 `discussion.json` 可能使用 `issueNumber: 118` 之类的编号，但你的 GitHub 仓库里未必存在这些 Issue。若 Issue 不存在，GitHub 镜像会 404，本地评论仍保留，并在 `SyncEvent` 记录 `comment.mirror_failed`。

测试建议：

1. 在内容仓库手动创建一个 Issue。
2. 把对应论文的 `githubIssueNumber` 改成这个真实编号。
3. 在站点发评论。
4. 检查 GitHub Issue 是否出现评论；作者会显示为 App 机器人，例如 `RuArXiv Content Bot[bot]`，不是登录用户本人。

如果没有配置 GitHub App，评论仍会写入本地数据库，只是不会镜像到 GitHub。

### 10. 常见错误

| 现象 | 原因 | 处理 |
|---|---|---|
| `redirect_uri_mismatch` | GitHub 回调地址与 `GITHUB_REDIRECT_URI` 不一致 | 检查协议、域名、路径、末尾 `/` |
| 登录页没有 GitHub 按钮 | OAuth 变量未配置或未重新部署 | 检查 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` |
| 生产仍出现演示登录 | `ALLOW_DEMO_LOGIN=true` | 设为 `false` 并重新部署 |
| `invite_required` | 数据库已有用户，新用户没有邀请 | 临时 `ALLOW_OPEN_SIGNUP=true` 或创建邀请 |
| Webhook `401 invalid_signature` | `GITHUB_WEBHOOK_SECRET` 不一致 | 重新填写 GitHub App 和 Vercel 的 secret |
| 评论 404 | App 未安装到仓库，或 Issue 编号不存在 | 检查安装范围与 `githubIssueNumber` |
| 评论 403 `Resource not accessible by integration` | Issues 权限不足，或权限变更未批准 | 给 Issues Write，并在安装页批准更新 |
| PR 403 | 缺少 Pull requests / Contents 写权限 | 补权限并重新批准安装 |
| App API 404 | `GITHUB_CONTENT_REPO` 与安装仓库不一致 | 改成实际仓库 `owner/repo` |
| 私钥解析失败 | PEM 换行丢失 | 多行粘贴，或使用 `\n` |

### 11. 安全检查

- OAuth Client Secret、GitHub App 私钥、Webhook secret 只放在服务端环境变量，不进入客户端 bundle，不写日志。
- GitHub App 权限按最小化配置；修改权限后，安装方需要重新批准。
- 登录 Session 不保存 GitHub access token；当前代码只保存站内用户身份。
- 生产环境必须保持 `ALLOW_DEMO_LOGIN=false`；演示登录在 UI 和服务端都会拒绝。
- 私钥或 Client Secret 泄露时立即轮换，并更新 Vercel 环境变量。
- Webhook 必须验签并用 `deliveryId` 幂等，避免重复处理。

---

## 安全

- Markdown 不启用原始 HTML，`rehype-sanitize` 白名单过滤；链接只允许 http/https，外链带 `noopener noreferrer`。
- Session 使用 HMAC-SHA256 签名，HttpOnly + SameSite=Lax + Secure，7 天过期；不保存 GitHub access token。
- Webhook 验签 + delivery 幂等；私钥只从环境变量读取，不写日志。
- 评论长度、频率与重复内容限制；提交与举报写审计日志。
- 上传校验 MIME、magic bytes、大小；待审核文件不公开。
- Vercel WAF 做 IP/UA 限流，Upstash Redis 做用户维度限流；管理操作服务端鉴权。
- 版权/违规处理：先隐藏站内展示与搜索索引，保留 GitHub 与审计证据。

---

## 限额与运维

| 项 | 限制 | 应对 |
|---|---|---|
| Function 请求/响应体 | 4.5 MB | PDF 走 Blob client upload |
| Function 时长 | 默认 300s；Pro 800s；1800s beta | 全量同步拆 Workflow/队列 |
| Cron | Hobby 每天一次；Pro 每分钟 | 生产用 Pro |
| Runtime Cache | 2 MB/条、128 tags | 只缓存小对象 |
| Blob | 5 TB/文件；public/private 固定 | 已发布 public，待审核 private |
| WAF | Hobby 1 条规则；Pro 40 条 | 生产用 Pro |
| 队列 | 消息 100 MB、保留 7 天 | 只传 ID/cursor |

生产建议开启：

- Vercel Observability / Log Drain；
- Neon PITR 与分支备份；
- 队列积压、`SyncEvent.FAILED`、同步 lag、5xx、DB 连接数告警；
- 每日对账与每周全量抽样校验。

---

## 迁移状态与待办

当前代码与 Vercel 目标架构的差距：

- [x] Prisma `sqlite` → `postgresql`，初始迁移入库（阶段 1）
- [x] CI 用临时 Postgres 回放迁移（`validate-db.yml`）
- [ ] 移除 `createPaperAction` 的本地文件写入
- [ ] Webhook 改为验签 + `SyncEvent` + 入队 + 202
- [ ] 新增 Vercel Queues 消费者；PR/评论镜像异步化
- [ ] `push` 改增量 + 分批；全量用 Workflow
- [ ] 开启 `cacheComponents`，公开读模型加缓存与失效
- [ ] 搜索改 Postgres `pg_trgm`
- [ ] 接入 Vercel Blob（PDF/图片 client upload）
- [ ] 配置 `vercel.json` Cron/函数时长、WAF 限流
- [ ] 更新 `.env.example`、部署文档与测试

完整步骤、验收标准与风险见
[技术方案 §17–§19](docs/基于%20GitHub%20与%20Vercel%20的论坛风格%20ArXiv%20网站技术设计.md#17-从当前代码迁移)。

---

## 许可

演示内容为虚构文本，仅用于产品演示；代码默认 MIT。
