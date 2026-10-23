# 基于 GitHub 与 Vercel 的论坛风格 ArXiv 网站技术设计

版本：v2.0
日期：2026-10-22
状态：Vercel 原生目标架构；当前仓库代码处于迁移前状态（见 §17）

---

## 1. 文档定位与结论

本方案把 RuArXiv 的**全部应用运行时**迁到 Vercel：

- 页面、Route Handler、Server Action 全部由 Vercel Functions 执行；
- 关系数据使用 **Neon Postgres（通过 Vercel Marketplace 接入）**；
- 缓存、限流、幂等键使用 **Upstash Redis（通过 Vercel Marketplace 接入）**；
- 文件使用 **Vercel Blob**；
- 异步任务使用 **Vercel Queues + Vercel Workflows**；
- 定时对账使用 **Vercel Cron**；
- 页面与数据缓存使用 **Next.js 16 Cache Components / ISR / Vercel Runtime Cache / CDN**；
- 边缘防护使用 **Vercel Firewall（WAF）**。

GitHub 仍然是论文正文、版本历史和 Issue 讨论的**内容源与审计源**，但不是在线查询数据库：
网站只通过 Webhook 与按需同步把内容写入 Postgres，页面读取永远不实时调用 GitHub。

> **先纠正一个常见误解**：截至 2026-10，Vercel 已不再提供第一方的 “Vercel Postgres / Vercel KV” 数据库引擎。官方文档中的 Postgres 与 Redis 都是 **Marketplace 集成**，由 Neon、Upstash 等供应商提供，Vercel 负责开通、注入环境变量和统一账单。真正由 Vercel 第一方提供的是 Blob、Queues、Workflows、Cron、Runtime Cache、Firewall 等平台能力。

**核心结论：**

1. **不要在 Vercel 上运行 SQLite、独立 Worker、Kafka、OpenSearch、自建 Redis。** 这些都需要持久磁盘或常驻进程，与 Vercel Functions 的模型冲突。
2. **所有状态必须外置**到 Postgres、Redis、Blob 或 GitHub；函数实例随时可能被回收。
3. **请求路径禁止写文件系统**。Vercel 的文件系统只读（`/tmp` 除外且不持久），论文提交不能再 `mkdir/writeFile` 到 `content/papers`。
4. **Webhook 只做验签、幂等入库、入队，然后 202 返回。** 全量仓库扫描必须交给队列消费者或 Workflow。
5. **大文件不走函数体。** Vercel Functions 请求/响应体上限 4.5 MB，PDF 必须由浏览器直传 Vercel Blob。
6. **中文搜索不要指望 Postgres FTS。** 用 `pg_trgm` 做子串/模糊检索；规模上来后再接 Upstash Search 等 Marketplace 搜索服务。
7. **生产建议使用 Vercel Pro**：Hobby 的 Cron 每天只能跑一次、WAF 限流规则只有 1 条、函数最长 300 秒；Pro 才能做到分钟级对账和更细的限流。

---

## 2. 目标与非目标

### 2.1 目标

- 零服务器、零容器、零自建中间件，全部由 Vercel 与其 Marketplace 托管。
- 读路径可缓存、可水平扩展；写路径幂等、可重试、可审计。
- 论文内容仍可用 Git 追溯：commit、PR、版本、diff、Issue 评论链接都可回查。
- 单个 Vercel 项目即可完成部署；Preview Deployment 使用独立数据库分支。
- 故障可恢复：Webhook 丢失、队列重投、GitHub 限流、函数超时都有补偿路径。

### 2.2 非目标

- 不在本阶段做实时聊天、协同编辑、站内私信。
- 不把 PDF 二进制提交进 Git。
- 不追求“所有内容都必须经过 GitHub PR”这一唯一路径；演示模式和紧急下架允许网站数据库先行，GitHub 异步补齐。
- 不为了“云厂商中立”而保留 Kubernetes/OpenSearch/Kafka 的抽象层；本方案明确接受 Vercel 绑定，但通过接口隔离队列、存储、搜索，保留迁移可能。

---

## 3. Vercel 能力映射

| 需求 | 采用的 Vercel 方案 | 关键事实与限制 |
|---|---|---|
| Web / API 运行时 | Next.js 16 App Router + Vercel Functions（Node.js runtime） | Fluid compute 默认开启；默认 300s，Pro 最大 800s，1800s 为 beta；请求/响应体 4.5 MB；并发可自动扩展。**不要用 Edge runtime 跑 Prisma**。 |
| 关系数据库 | **Neon Postgres**（Marketplace 原生集成） | 注入 `DATABASE_URL`（PgBouncer 池化）与 `DATABASE_URL_UNPOOLED`（直连，用于迁移）；支持 Preview Branching；Vercel Postgres 已废弃。 |
| 缓存 / 限流 / 幂等键 | **Upstash Redis**（Marketplace） | 注入 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`；使用 `@upstash/redis`（HTTP/REST），适合 Serverless。旧 `KV_*` 变量仅作兼容。 |
| 页面 / 数据缓存 | Next.js `use cache` + `cacheLife` + `cacheTag`；`use cache: remote`；ISR/CDN | Next.js 16 需开启 `cacheComponents`；Runtime Cache 单条 2 MB、最多 128 个 tag；区域级、可能被驱逐，不是数据库。 |
| 异步消息 | **Vercel Queues**（Beta） | 持久 topic、至少一次投递、`idempotencyKey` 去重、push 模式由 Vercel 调用私有函数；消息最大 100 MB，保留最长 7 天；按操作计费。 |
| 长任务 / 多步流程 | **Vercel Workflows**（`workflow` SDK） | `"use workflow"` / `"use step"`，步骤自动重试，可 `sleep` 数分钟到数月；单次运行无总时长上限；适合全量回填与跨步骤对账。 |
| 定时任务 | **Vercel Cron** | UTC；Hobby 每天一次且精度 ±59 分钟；Pro 每分钟一次；通过 `vercel-cron/1.0` User-Agent 调用生产 URL。 |
| 文件存储 | **Vercel Blob** | 单文件最大 5 TB；public/private 在创建 store 时固定；public 走 CDN，private 需函数代理；>4.5 MB 必须用 client upload。 |
| 搜索 | Neon Postgres `pg_trgm` / `tsvector` | 没有第一方搜索产品；初期用 Postgres，规模大时可选 Upstash Search / Typesense 等 Marketplace 服务。 |
| 边缘防护 | Vercel Firewall / WAF Rate Limiting | 计数按区域；Hobby 1 条限流规则、100 万允许请求；Pro 40 条规则。 |
| 可观测性 | Vercel Observability + OpenTelemetry + Log Drain | 记录 `deliveryId`、`paperId`、`syncEventId`、队列重试次数、DB 连接数。 |

### 3.1 明确不采用

| 方案 | 原因 |
|---|---|
| SQLite / `prisma/dev.db` | 无持久磁盘；多实例不一致；Vercel Functions 无法共享。 |
| 自建 Redis / Kafka / RabbitMQ | 需要常驻进程与持久连接，Vercel 不提供长期运行的 Worker。 |
| OpenSearch / Elasticsearch | 同上；且运维成本与当前规模不匹配。 |
| 在函数里 `setInterval` / `setTimeout` 做后台任务 | 请求结束实例即冻结/回收，定时器不保证执行。 |
| 运行时写 `content/papers` | 部署产物只读；写入会丢失，且不会进入 GitHub。 |
| 在 Webhook 中同步全量扫描 GitHub | 超过函数时长、易触发 GitHub 限流、GitHub 10 秒超时会导致重投。 |

---

## 4. 总体架构

```mermaid
flowchart LR
  U[浏览器] --> CDN[Vercel CDN / Firewall / WAF]
  CDN --> APP[Next.js 16 on Vercel Functions]
  APP --> PG[(Neon Postgres)]
  APP --> REDIS[(Upstash Redis)]
  APP --> RC[Vercel Runtime Cache]
  APP --> BLOB[Vercel Blob]
  APP --> Q[Vercel Queues]
  APP --> GH[GitHub API]

  GH -->|push / issues / issue_comment| HOOK[/api/webhooks/github/]
  HOOK -->|验签 + SyncEvent + 202| Q
  Q --> CONSUMER[Queue Consumer Functions]
  CONSUMER --> GH
  CONSUMER --> PG
  CONSUMER --> RC
  CRON[Vercel Cron] --> RECONCILE[/api/cron/reconcile/]
  RECONCILE --> WF[Vercel Workflows]
  WF --> GH
  WF --> PG
```

### 4.1 请求分层

```text
读请求
  CDN / ISR 命中 ──► 直接返回
  未命中 ──► Server Component ──► Postgres（必要时 Redis / Runtime Cache）
  用户态（Session、我的投票） ──► Postgres，不进入公共缓存

写请求
  Server Action / Route Handler
    ──► 权限、限流、zod 校验
    ──► Postgres 事务（业务事实 + AuditLog + 待办 Job）
    ──► 返回结果
    ──► 异步：Vercel Queues / Workflows 写 GitHub、刷新缓存

GitHub 事件
  Webhook ──► 验签 ──► SyncEvent 唯一约束 ──► 入队 ──► 202
  Consumer ──► 拉取 GitHub ──► 幂等 upsert ──► revalidateTag ──► 标记完成
```

### 4.2 区域选择

- Neon 主库、Upstash Redis、Vercel Functions 尽量放在**同一区域**（例如 `sin1` 或 `iad1`），否则每次查询都跨区域。
- Vercel Functions 默认单区域 `iad1`；Pro/Enterprise 可在 `vercel.json` 配置 `regions`。
- Vercel Blob store 区域创建后不可更改；与函数区域保持一致。
- 不要为了“全球低延迟”把有状态函数部署到多区域；数据库仍是单主。读多写少的公开页面靠 CDN，而不是多区域数据库。

---

## 5. 运行模型与硬约束

### 5.1 函数生命周期

- 实例随时可能冷启动、冻结、回收；**不要在模块级缓存用户态或未持久化的任务状态**。
- Prisma Client 用 `globalThis` 单例（现有 `src/lib/db.ts` 可保留），但连接池参数要按 Serverless 调整。
- 单个请求内不要并行发起几十个 GitHub 调用；使用 `Promise.all` 时限制并发（建议 ≤ 5）。
- 所有外部请求设置超时（`AbortSignal.timeout(10_000)`），避免拖到函数 504。
- 大任务拆成队列消息或 Workflow step，单 step 控制在 60–120 秒内。

### 5.2 文件系统

- 运行时只读；`process.cwd()/content` 是部署产物的一部分，可以读，但不能写。
- `content/papers` 只用于**构建期/脚本期**校验与示例导入，不能作为运行时内容仓库。
- 用户上传的 PDF/图片写 Vercel Blob，不写本地。
- 临时文件如必须使用，只能写 `/tmp`，且要假定下一次请求不存在。

### 5.3 请求体与响应体

- 4.5 MB 上限适用于 Route Handler、Server Action、Webhook。
- GitHub Webhook payload 通常远小于该值，但 `push` 大仓库的 payload 可能较大；仍建议只读原始 body 做 HMAC，不解析全部大字段。
- PDF 上传必须使用 `@vercel/blob/client` 的 `upload()` + 服务端 `handleUpload`；服务端只签发 token 和记录元数据。

### 5.4 幂等

以下写入都必须有数据库唯一约束或幂等键：

| 写入 | 幂等键 |
|---|---|
| Webhook 事件 | `SyncEvent.deliveryId` 唯一 |
| 论文版本 | `(paperId, commitSha)` 唯一 |
| GitHub 评论镜像 | `Comment.githubCommentId` 唯一 |
| 投票 | `(paperId, userId)` 唯一 |
| 队列消息 | `idempotencyKey = deliveryId` 或 `jobId` |
| 审计 | 允许重复，但记录 `requestId` 便于去重分析 |

---

## 6. 数据层：Neon Postgres + Prisma

### 6.1 接入方式

1. 在 Vercel Dashboard → Storage / Marketplace 安装 **Neon**。
2. 选择区域（与 Functions 同区域），创建数据库，连接到 Production / Preview / Development。
3. 集成自动注入：

```dotenv
DATABASE_URL="postgresql://...-pooler.../neondb?sslmode=require"
DATABASE_URL_UNPOOLED="postgresql://.../neondb?sslmode=require"
# 兼容变量（旧 Vercel Postgres 模板）
POSTGRES_URL=...
POSTGRES_PRISMA_URL=...
```

4. `prisma/schema.prisma`：

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DATABASE_URL_UNPOOLED")
}
```

5. 本地开发使用 Neon 的 Development branch（`vercel env pull .env`，Prisma CLI 读取 `.env`），**不再使用 SQLite，也不依赖本地 Postgres**。

### 6.2 连接策略

- 默认：Prisma 走 `DATABASE_URL`（Neon PgBouncer 池化），连接串追加 `pgbouncer=true&connection_limit=5&pool_timeout=10`。
- PgBouncer 事务模式不支持预处理语句，`pgbouncer=true` 会让 Prisma 关闭 prepared statements。
- 迁移使用 `DATABASE_URL_UNPOOLED`（`directUrl`），避免 DDL 经过 PgBouncer。
- 如果连接数成为瓶颈：切换到 Neon Serverless Driver（`@neondatabase/serverless`）+ `@prisma/adapter-neon`，用 WebSocket Pool 保持事务能力；不要用 HTTP driver 跑交互式事务。
- **事务要短**：不要在事务里调用 GitHub、Blob、队列；先写数据库，再异步执行外部副作用。

### 6.3 迁移

- 使用 `prisma migrate`，禁止在生产使用 `prisma db push`。
- 生产构建命令：

```bash
prisma generate && prisma migrate deploy && next build
```

- Preview Deployment 使用 Neon Preview Branch；每个 PR 一个独立数据库分支，合并/删除部署后按保留策略清理。
- 并发部署可能同时执行迁移；Prisma migrate 有数据库锁，但仍建议生产发布串行化（例如只允许 main 分支触发 Production Deployment）。
- 种子脚本已移除；Development/Preview 通过内容同步或显式演示登录准备数据，生产只通过内容同步导入。

### 6.4 Postgres 建模调整

现有 schema 刻意保持 SQLite 可移植（JSON 存 text、角色存 string）。切到 Postgres 后建议：

| 现状 | 目标 |
|---|---|
| `authorsJson` / `categoriesJson` / `keywordsJson` 存 text | 保留 text 以减少改动；高频过滤字段可加 `jsonb` 与 GIN 索引 |
| 角色/状态用 string | 保留 string + zod 校验；避免 Prisma enum 迁移摩擦 |
| `contains` 大小写敏感 | 使用 `mode: "insensitive"`；并为搜索列建 `pg_trgm` |
| 无全文索引 | 增加 `searchText` 与 `searchVector`（见 §8） |
| 计数器直接 `increment` | 保留；投票切换用事务保证 `Vote` 与 `Paper` 计数一致 |
| `syncEvent` 只记结果 | 扩展为 outbox：`attempts`、`nextAttemptAt`、`lockedAt`、`lastError`、`payload` |
| 无外部写重试表 | 增加 `GitHubWriteJob`（PR 创建、评论镜像） |
| 无资源表 | 增加 `Asset`（Blob pathname、URL、SHA-256、大小、MIME、可见性） |

---

## 7. 缓存与读路径

### 7.1 Next.js 16 Cache Components

在 `next.config.ts` 开启：

```ts
const nextConfig: NextConfig = {
  cacheComponents: true,
};
```

公开读模型使用：

```ts
import { cacheLife, cacheTag } from "next/cache";

export async function getPaperCard(id: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(`paper:${id}`);
  return prisma.paper.findUnique(/* ... */);
}
```

- `cookies()` / `headers()` 不能出现在 `use cache` 作用域内；先读取用户态，再把值作为参数传入。
- 列表页缓存 tag 用 `papers:list`；详情用 `paper:<id>`；版本用 `paper:<id>:versions`。
- 审核通过、编辑、隐藏、同步完成后调用 `revalidateTag(...)`；必要时再 `revalidatePath("/")`。
- 已发布版本按 `commitSha` 不可变，可长缓存；当前版本页用小时级 + 主动失效。

### 7.2 Runtime Cache

- 需要跨实例共享的昂贵查询可用 `use cache: remote`（Vercel Runtime Cache）。
- 限制：单条 2 MB、最多 128 个 tag、tag 最长 256 字节；区域级、可能被驱逐。
- **不要**把论文全文、评论列表大对象、用户 Session 放进去；适合首页排行、分类计数、热门列表。
- 按 tag 失效有速率限制（Hobby 50 次/秒，Pro 200 次/秒），批量操作要合并 tag。

### 7.3 Redis 的职责

Redis **不是**事实来源，只做：

- 登录/评论/提交的滑动窗口限流；
- Webhook/队列的短期幂等键（数据库唯一约束仍是最终保障）；
- 热点计数缓冲（定时回写 Postgres，或直接读 Postgres）；
- 短 TTL 的搜索缓存（key 为 query 的 hash，TTL 30–60 秒）。

使用 `@upstash/redis` 的 REST 客户端，避免在 Serverless 中维护 TCP 长连接。

### 7.4 CDN / ISR

- 论文详情、分类页、作者页、排行榜使用 ISR 或 `use cache` 生成静态壳。
- 动态用户态（当前用户是否已投票、是否管理员）放在客户端组件或独立未缓存请求中，避免整页转动态。
- API GET 可设置 `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`，但涉及用户态的接口必须 `private, no-store`。

---

## 8. 搜索

### 8.1 初期：Postgres

Vercel 没有第一方全文搜索，初期不要引入 OpenSearch。方案：

1. `Paper.searchText` 存标题、摘要、作者、关键词、正文纯文本（小写、去 Markdown）。
2. 迁移中启用扩展并建索引：

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX paper_search_trgm_idx
  ON "Paper" USING GIN ("searchText" gin_trgm_ops);

-- 英文/拉丁文可加 FTS；中文仍以 trigram 为主
ALTER TABLE "Paper"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(title, '') || ' ' ||
      coalesce(abstract, '') || ' ' ||
      coalesce("searchText", ''))
  ) STORED;

CREATE INDEX paper_search_fts_idx
  ON "Paper" USING GIN ("searchVector");
```

3. 查询：

```sql
SELECT id, title, abstract
FROM "Paper"
WHERE status = 'PUBLISHED'
  AND (
    "searchText" ILIKE '%' || $1 || '%'
    OR "searchVector" @@ websearch_to_tsquery('simple', $1)
  )
ORDER BY
  similarity("searchText", $1) DESC,
  "publishedAt" DESC
LIMIT 20;
```

4. 中文说明：`simple` 配置不会做中文分词，`tsvector` 对中文长句效果有限；`pg_trgm` 对 2 字以上子串效果稳定。1 字查询退化为 `ILIKE`，限制结果数。
5. 排序仍以 `publishedAt` / `score` / `lastActivityAt` 为主，搜索相关性作为加权项。

### 8.2 规模上升后

当论文达到十万级、或需要评论全文检索/分词/高亮时，再选：

- **Upstash Search**（Marketplace，按请求计费）；
- **Typesense Cloud / Meilisearch Cloud**（Marketplace，若可用）；
- 不建议在 Vercel 上自建 OpenSearch。

搜索索引通过同步消费者更新；允许最终一致，页面显示 `syncedAt`。

---

## 9. 异步任务：Queues、Workflows、Cron

### 9.1 任务分类

| 任务 | 机制 | 说明 |
|---|---|---|
| Webhook 单事件（评论、单篇论文变更） | Vercel Queues | 快速、短任务，push 消费者 |
| 全量仓库回填 / 大版本重建 | Vercel Workflows | 多 step，可暂停/重试，无总时长限制 |
| 每日/每小时对账 | Vercel Cron → Workflow | Hobby 每天一次；Pro 每小时/每分钟 |
| PR 创建、评论镜像失败重试 | Vercel Queues + `GitHubWriteJob` | 指数退避，超过次数转人工 |
| 缓存预热 | Workflow 或 Cron | 只做可选优化，不影响正确性 |

### 9.2 队列主题

建议三个 topic：

```text
content-sync      # push / pull_request merged / issues
discussion-sync   # issue_comment
github-write      # PR、评论镜像等出站写
```

消费者路由（示例命名）：

```text
src/app/api/queues/content-sync/route.ts
src/app/api/queues/discussion-sync/route.ts
src/app/api/queues/github-write/route.ts
```

在 `vercel.json` 中为消费者声明 queue trigger（具体字段以 Vercel Queues quickstart 为准），消费者是私有函数，没有公开 URL。

生产者：

```ts
import { send } from "@vercel/queue";

await send("content-sync", {
  deliveryId,
  event: "push",
  repo: "owner/papers",
  after: payload.after,
}, {
  idempotencyKey: deliveryId,
  retentionSeconds: 86_400,
});
```

消费者：

```ts
import { handleCallback } from "@vercel/queue";

export const POST = handleCallback(async (message, metadata) => {
  // 1. 校验 payload
  // 2. 抢占 SyncEvent（PENDING -> PROCESSING）
  // 3. 执行同步（单篇或小批量）
  // 4. 更新 SyncEvent、revalidateTag
  // 5. 抛错则自动重试；重复投递必须幂等
});
```

### 9.3 Webhook 流程

```mermaid
sequenceDiagram
  participant GH as GitHub
  participant Hook as /api/webhooks/github
  participant DB as Neon Postgres
  participant Q as Vercel Queues
  participant C as Consumer

  GH->>Hook: push / issue_comment
  Hook->>Hook: HMAC 验签
  Hook->>DB: INSERT SyncEvent(deliveryId) ON CONFLICT DO NOTHING
  alt 已存在
    Hook-->>GH: 202 duplicate
  else 新事件
    Hook->>Q: send(topic, payload, idempotencyKey=deliveryId)
    Hook-->>GH: 202 accepted
    Q->>C: push 投递
    C->>DB: claim PENDING -> PROCESSING
    C->>GH: 拉取增量
    C->>DB: 幂等 upsert
    C->>DB: PROCESSED
    C->>C: revalidateTag
  end
```

关键点：

- Webhook 函数 `maxDuration` 设 30 秒即可，正常应在 1 秒内返回。
- **不要在 Webhook 中调用 GitHub API**；GitHub 的重试会放大故障。
- 验签失败返回 401；重复 delivery 返回 202 + `duplicate: true`。
- 事件类型未知也要记录并标记 `IGNORED`，方便排查。

### 9.4 全量同步与分批

`push` 事件后不要一次性扫描整个仓库：

- 消息携带 `after` commit SHA；
- 消费者只处理变更目录（从 GitHub compare API 获取文件列表）；
- 单次最多处理 N 篇（例如 10 篇），剩余部分重新入队（携带 cursor）；
- 首次接入或历史重建用 Workflow：

```ts
export async function backfillRepository(repo: string) {
  "use workflow";
  const tree = await listTree(repo);          // step
  const batches = chunk(tree, 20);
  for (const batch of batches) {
    await syncPaperBatch(repo, batch);        // step，失败自动重试
  }
  await finalizeCursor(repo);                 // step
}
```

### 9.5 Cron 对账

`vercel.json`：

```json
{
  "crons": [
    { "path": "/api/cron/reconcile", "schedule": "0 3 * * *" }
  ]
}
```

- Hobby：每天一次，精度 ±59 分钟；Pro：可 `0 * * * *` 每小时，甚至每分钟。
- Cron 请求带 `vercel-cron/1.0` User-Agent 和 `x-vercel-cron-schedule`；用共享密钥或 Vercel 签名校验，避免公开触发。
- 对账内容：GitHub 默认分支 head 与 `RepositoryCursor.lastSyncedCommit` 比较；不一致则启动 Workflow；同时重试 `FAILED` 的 SyncEvent 与 `GitHubWriteJob`。
- Cron 只负责“发现差异并启动”，不在 Cron 函数里跑全量。

### 9.6 失败与死信

- 队列默认重试；超过阈值后写 `SyncEvent.status = FAILED`，记录 `lastError`、`attempts`。
- 每日对账扫描 `FAILED` 且 `nextAttemptAt <= now` 的记录，指数退避重试。
- 超过 N 次（例如 8 次）标记 `DEAD`，在 `/admin` 展示并告警；管理员可手动重放。
- 所有消费者必须可重放：重复消息不能产生重复论文版本、重复评论、重复计数。

---

## 10. GitHub 集成

### 10.1 身份与权限

- 登录使用 GitHub OAuth App 或 GitHub App 用户授权；只申请 `read:user user:email`。
- 服务端保存不可变 `githubUserId`，`login` 仅展示。
- GitHub App 用于仓库读写：Contents（Read，需要代提交 PR 时 Write）、Issues（Read/Write）、Metadata（Read）、Webhooks。
- 私钥、Client Secret、Webhook Secret 只放 Vercel 环境变量，不写日志、不进客户端 bundle。
- Installation Token 缓存 1 小时；在 Serverless 中缓存可能随实例消失，重新获取即可，不要假设常驻。

### 10.2 论文提交（无本地文件写入）

当前实现会 `mkdir/writeFile` 到 `content/papers`，在 Vercel 上必须删除。新流程：

1. Server Action 校验标题、正文、作者、分类、脚本注入、长度。
2. 在 Postgres 事务中创建：
   - `Paper`（`PENDING_REVIEW`）
   - `PaperVersion`（`bodyMarkdown` 存全文，`contentSha256`）
   - `AuditLog`
   - `GitHubWriteJob`（类型 `CREATE_PR`，payload 含 `paperId`、分支名、文件内容）
3. 立即返回论文详情页，状态显示“PR 创建中”。
4. `github-write` 消费者：
   - 读取 `PaperVersion.bodyMarkdown` 生成 `metadata.yml` 与 `paper.md`；
   - 调用 GitHub API 创建 blob/tree/commit/branch/PR；
   - 保存 `prNumber`、`prUrl`，标记 job 完成；
   - 失败则按退避重试，超过阈值转人工。
5. GitHub Actions 执行 `pnpm validate`（Schema、目录、大小、脚本注入）。
6. 合并后 `push` Webhook 触发同步，写入新 `PaperVersion`，论文仍保持 `PENDING_REVIEW`，直到管理员在站内批准。
7. 批准时更新 `status = PUBLISHED`、`publishedAt`，写审计，`revalidateTag("paper:"+id)`。

> 关键：**数据库先有草稿，PR 后补**。这样即使 GitHub 不可用，用户提交也不会丢；PR 只是审计与内容仓库的异步副本。

### 10.3 讨论（Issue 映射）

- 每篇论文一个带 `paper-discussion` 标签的 Issue，保存 `githubIssueNumber`、`discussionUrl`。
- 评论写入：
  1. 权限、频率、长度校验；
  2. 写 `Comment`（`VISIBLE` 或高风险 `PENDING`）；
  3. 写 `GitHubWriteJob`（镜像评论）；
  4. 返回成功，页面立即显示本地评论；
  5. 消费者调用 GitHub API，成功后写 `githubCommentId`；失败保留本地评论并重试。
- `issue_comment` Webhook 只刷新对应 Issue；使用 `since` 游标增量拉取，避免每次全量覆盖。
- 同步时不要覆盖站点侧 `HIDDEN` / `DELETED` 状态；GitHub 删除只标记 `DELETED`，保留审计。

### 10.4 版本与 diff

- 每次合并生成 `PaperVersion`，保存 `commitSha`、`parentSha`、`prNumber`、`contentSha256`、`bodyMarkdown`。
- `isCurrent` 每篇论文只允许一行为 true；切换时用事务。
- 版本页按 `commitSha` 不可变，可长缓存。
- diff 在服务端计算（现有 `src/lib/diff.ts` 可复用），不要在前端拉全文。

---

## 11. 文件与 Vercel Blob

### 11.1 适用对象

- 论文 PDF、补充材料、封面图、用户头像（可选）。
- 不要把这些文件放进 Git；正文中的图片用 Blob URL 或外部 HTTPS URL。

### 11.2 上传流程

```text
浏览器 ──POST /api/blob/upload（鉴权 + onBeforeGenerateToken）──► Vercel
浏览器 ──PUT 文件直传──────────────────────────────────────────► Vercel Blob
Vercel ──onUploadCompleted webhook──► /api/blob/upload-completed
                                      └─► 写 Asset 表、关联 Paper/Version
```

- >4.5 MB 必须用 client upload；服务端 upload 只适合小图标。
- `onBeforeGenerateToken` 必须校验 Session、角色、论文状态、MIME、大小上限。
- `pathname` 使用不可猜测且不可变的格式：

```text
papers/<paperId>/<versionSha>/<sha256>.<ext>
```

- 上传完成后校验 magic bytes 与 SHA-256；PDF 在审核通过前保持 `PENDING`，不要公开。
- store 的 public/private 创建后不可改：
  - **public store**：已发布论文的 PDF/图片，走 CDN；
  - **private store**：待审核稿件、举报证据，通过函数代理读取。
- 覆盖会带来 CDN 延迟；优先新建对象，不复用 pathname。

### 11.3 数据模型

```prisma
model Asset {
  id           String   @id @default(cuid())
  paperId      String?
  versionId    String?
  pathname     String   @unique
  url          String
  sha256       String
  size         Int
  contentType  String
  visibility   String   @default("PUBLIC") // PUBLIC | PRIVATE
  status       String   @default("PENDING") // PENDING | ACTIVE | QUARANTINED
  createdAt    DateTime @default(now())
}
```

---

## 12. 认证与安全

### 12.1 Session

- 继续使用 HMAC-SHA256 签名的 HttpOnly Cookie；`AUTH_SECRET` 至少 32 字节，按环境独立。
- 不保存 GitHub access token；登录只换取身份，随后丢弃。
- `secure: true`、`sameSite: "lax"`、7 天过期；敏感操作可加短时二次校验。
- 每次请求按 `uid` 查用户；如需降低数据库压力，可在 Redis 缓存用户 60 秒，但封禁要能立即失效（写操作时删缓存）。

### 12.2 OAuth

- `state` + PKCE；回调地址必须与 GitHub 配置完全一致。
- Preview Deployment 的域名与生产不同：为 Preview 单独建 OAuth App，或在 Preview 禁用 GitHub 登录；如必须登录，可显式设置 `ALLOW_DEMO_LOGIN=true`，但不建议在共享 Preview 开启。
- 新用户默认邀请制；第一个用户成为 ADMIN 的逻辑要加并发保护（唯一约束或数据库锁）。

### 12.3 Webhook

- `X-Hub-Signature-256` HMAC 校验，`timingSafeEqual`。
- `X-GitHub-Delivery` 唯一约束；重复投递直接 202。
- 生产环境必须配置 `GITHUB_WEBHOOK_SECRET`；缺失时拒绝，而不是放行。
- 记录 `payloadHash`，便于排查重放与篡改。

### 12.4 输入与内容

- Markdown 不启用原始 HTML；`rehype-sanitize` 白名单；链接只允许 http/https。
- 评论、标题、摘要、作者字段做长度与字符校验；正文禁止 `<script>`、`javascript:`、内联事件。
- 上传文件校验 MIME + magic bytes + 扩展名 + 大小；PDF 解析在隔离环境或第三方扫描服务完成。
- 举报、下架、恢复、审核、同步失败全部写 `AuditLog`。

### 12.5 平台防护

- Vercel Firewall：对 `/api/v1/auth/*`、评论、提交、举报设置 IP/UA 限流；Hobby 只有 1 条规则，生产建议 Pro。
- Upstash Redis：按 `userId` / `IP` 做应用层滑动窗口，补充 WAF 无法识别的业务维度。
- BotID / Challenge：用于注册与高频写接口（按套餐可用性启用）。
- 管理后台强制角色校验；不要在客户端隐藏按钮代替服务端授权。

---

## 13. 数据模型（目标）

在现有模型上增补：

```text
User            id, githubUserId(unique), login, role, status, ...
Invite          code(unique), email, expiresAt, usedAt, ...
Paper           id, slug(unique), repoId, path, title, abstract,
                searchText, searchVector(tsvector), status,
                currentCommitSha, currentVersionId,
                githubIssueNumber, discussionUrl,
                prNumber, prUrl,
                score, upvotes, downvotes, commentCount, viewCount,
                publishedAt, lastActivityAt, syncedAt, ...
PaperVersion    id, paperId, commitSha, parentSha, prNumber,
                contentSha256, bodyMarkdown, isCurrent,
                UNIQUE(paperId, commitSha)
Comment         id, paperId, githubCommentId(unique), parentId,
                authorLogin, bodySnapshot, reactionsJson, status,
                syncStatus, createdAt, ...
Vote            id, paperId, userId, value, source,
                UNIQUE(paperId, userId)
Report          id, paperId, commentId, reporterId, reason, status, ...
SyncEvent       id, deliveryId(unique), eventName, repoId,
                payloadHash, payloadJson, status, attempts,
                nextAttemptAt, lockedAt, lastError, receivedAt, processedAt
GitHubWriteJob  id, type, paperId, commentId, payloadJson,
                status, attempts, nextAttemptAt, lastError, createdAt
RepositoryCursor repoId(unique), lastSyncedCommit, lastTreeSha,
                backfillCursor, updatedAt
Asset           id, paperId, versionId, pathname(unique), url,
                sha256, size, contentType, visibility, status
AuditLog        id, actorId, actorLogin, action, targetType,
                targetId, detailJson, createdAt
```

索引：

- `Paper(status, publishedAt DESC)`
- `Paper(score DESC)`
- `Paper(lastActivityAt DESC)`
- `Paper` GIN(`searchText`) / GIN(`searchVector`)
- `Comment(paperId, createdAt)`
- `Comment(githubCommentId)` 唯一
- `SyncEvent(status, nextAttemptAt)`
- `GitHubWriteJob(status, nextAttemptAt)`
- `AuditLog(createdAt)`、`AuditLog(targetType, targetId)`

---

## 14. 部署与环境

### 14.1 环境矩阵

| 环境 | 数据库 | Redis | Blob | GitHub | 用途 |
|---|---|---|---|---|---|
| Development | Neon branch（dev） | Upstash dev | Blob dev store | 可选真实 App 或显式开启的演示登录 | 本地 `next dev` / `vercel dev` |
| Preview | Neon Preview Branch（每 PR 一个） | Upstash 共享或独立 | 独立前缀/store | Preview OAuth App | PR 预览、迁移验证 |
| Production | Neon 主库 | Upstash 生产库 | 生产 store | 生产 GitHub App | 正式流量 |

- Preview 不要连生产数据库；Neon Preview Branching 会自动注入分支连接串。
- 环境变量通过 `vercel env pull .env` 拉取（Prisma CLI 读取 `.env`；Next.js 也会加载）；不要把 `.env` / `.env.local` 提交。
- `AUTH_SECRET`、`GITHUB_WEBHOOK_SECRET`、`GITHUB_APP_PRIVATE_KEY` 按环境独立。

### 14.2 环境变量

```dotenv
# Vercel / Neon（集成自动注入）
DATABASE_URL=postgresql://...-pooler.../neondb?sslmode=require&pgbouncer=true
DATABASE_URL_UNPOOLED=postgresql://.../neondb?sslmode=require

# 站点
AUTH_SECRET=...
ALLOW_OPEN_SIGNUP=false
NEXT_PUBLIC_SITE_URL=https://ruarxiv.example

# GitHub App / OAuth
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_APP_ID=...
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n"
GITHUB_INSTALLATION_ID=...
GITHUB_WEBHOOK_SECRET=...
GITHUB_CONTENT_REPO=owner/papers
GITHUB_CONTENT_BRANCH=main
GITHUB_REDIRECT_URI=https://ruarxiv.example/api/v1/auth/github/callback

# Upstash（集成自动注入）
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# Vercel Blob（集成自动注入）
BLOB_READ_WRITE_TOKEN=...
# 或 OIDC：BLOB_STORE_ID + VERCEL_OIDC_TOKEN

# 可选
SYNC_TOKEN=...
CRON_SECRET=...
```

### 14.3 `vercel.json`

```json
{
  "regions": ["sin1"],
  "crons": [
    { "path": "/api/cron/reconcile", "schedule": "0 3 * * *" }
  ]
}
```

Next.js App Router 的函数时长用**路由段配置**，不要写在 `vercel.json` 的 `functions` 里：

```ts
// src/app/api/webhooks/github/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// src/app/api/queues/content-sync/route.ts
export const runtime = "nodejs";
export const maxDuration = 300;
```

> 区域按 Neon/Upstash 实际区域修改；Hobby 的 Cron 只能每天一次，改为 `0 3 * * *` 这类表达式。Queue trigger 的消费者配置以 Vercel Queues 官方 quickstart 为准。

### 14.4 构建与发布

```bash
pnpm install --frozen-lockfile
prisma generate
prisma migrate deploy
next build
```

发布检查：

1. Preview：迁移在 Neon Preview Branch 执行，跑冒烟测试（首页、详情、搜索、登录、评论）。
2. Production：合并 main，串行发布，避免并发迁移。
3. 发布后：触发 `/api/cron/reconcile` 一次，确认 `RepositoryCursor` 与 GitHub head 一致。
4. 回滚：Vercel 即时回滚到上一个 Deployment；数据库迁移必须向前兼容（先加列/表，再切代码，最后删旧列）。

---

## 15. 可观测性与可靠性

### 15.1 指标

- Webhook：接收量、验签失败、重复率、P95 响应时间、202 比例。
- 队列：消息年龄、重试次数、FAILED/DEAD 数、消费者错误率。
- 同步：GitHub head 与 `RepositoryCursor` 的 lag、单篇同步耗时、失败论文数。
- 数据库：连接数、慢查询、事务回滚、Neon CU 使用。
- 缓存：CDN 命中率、Runtime Cache 命中率、tag 失效率。
- 业务：提交数、审核时长、评论失败率、举报积压。

### 15.2 日志

- 结构化 JSON：`requestId`、`deliveryId`、`syncEventId`、`paperId`、`jobId`、`attempt`、`durationMs`。
- 不记录 token、私钥、Cookie、完整正文。
- 使用 Vercel Log Drain 转发到外部可观测平台（可选），或使用 Vercel Observability。

### 15.3 降级

| 故障 | 降级 |
|---|---|
| GitHub API 不可用 | 页面继续读 Postgres；提交/评论写本地并排队；显示“同步延迟” |
| 队列不可用/未开通 | Webhook 只写 `SyncEvent`，Cron 扫描 PENDING 并触发 Workflow（降级模式） |
| Redis 不可用 | 限流退化为数据库计数 + 更严格的频率；缓存直接回源 Postgres |
| 搜索慢 | 回退到标题/摘要 `ILIKE`，限制结果数 |
| Neon 只读/连接满 | 公开页面走 CDN/ISR 静态壳；写操作返回 503 并提示重试 |
| Blob 上传失败 | 保留草稿，允许稍后重试；不阻塞论文元数据提交 |

### 15.4 备份与恢复

- Neon：开启 PITR / 分支快照；定期导出逻辑备份到 Blob（加密）。
- Blob：对象不可变；定期清单导出。
- GitHub：正文与版本天然有 Git 历史；数据库只是索引，可从内容仓库重建。
- 审计日志：至少保留 180 天；下架/版权事件永久保留。

---

## 16. 容量、成本与限额

### 16.1 关键限额

| 项 | 限额 | 影响 |
|---|---|---|
| Function 请求/响应体 | 4.5 MB | PDF 必须 client upload |
| Function 时长 | 默认 300s；Pro 800s；1800s beta | 全量同步拆 Workflow/队列 |
| Queue 消息 | 100 MB，保留 7 天 | 不要传全文；传 ID 与 cursor |
| Runtime Cache | 2 MB/条，128 tags | 只缓存小对象 |
| Blob | 5 TB/文件 | 足够；注意出网费用 |
| Cron | Hobby 每天一次；Pro 每分钟 | 生产用 Pro |
| WAF | Hobby 1 条规则；Pro 40 条 | 生产用 Pro |
| Postgres 连接 | 取决于 Neon 套餐 | 池化 + 限制并发 |

### 16.2 成本控制

- 公开读走 CDN/ISR，减少 Function 与数据库调用。
- 列表页缓存 1–5 分钟；详情页按 `commitSha` 长缓存。
- 队列消息只传 ID，消费者回查数据库，避免大 payload 计费。
- Blob 公开资源走 CDN；私有资源尽量少走函数代理。
- 搜索限制 `LIMIT`，避免全表 `ILIKE`。
- Neon 按 CU 计费；开发/预览分支可 scale-to-zero。

### 16.3 规模边界

单 Vercel + Neon 方案在以下范围内足够：

- 论文 10 万篇以内、日活 10 万以内、评论写入峰值 < 100 QPS；
- 搜索 P95 < 500 ms（trigram + 合理索引）；
- 同步延迟 P95 < 5 分钟（Pro + 队列）。

超过后按顺序演进：

1. 读写分离 / Neon 只读副本；
2. 搜索外置（Upstash Search / Typesense）；
3. 评论/投票分表或分区；
4. 多区域只读 CDN，写仍单区域；
5. 如仍需自建常驻服务，再考虑迁出 Vercel（这是产品规模决策，不是当前默认）。

---

## 17. 从当前代码迁移

阶段 1（数据库切换）已完成；其余阶段仍按下述顺序迁移，避免一次性大爆炸：

### 阶段 0：准备

- 创建 Neon 项目与 Development/Preview/Production 分支。
- 创建 Upstash Redis、Vercel Blob store。
- 在 Vercel 项目绑定 Git 仓库，配置环境变量。
- 冻结 `content/papers` 的运行时写入需求，确认提交走 DB + PR。

### 阶段 1：数据库切换（已完成）

1. ✅ `prisma/schema.prisma`：`provider = "postgresql"`，加 `directUrl`。
2. ✅ 初始迁移已生成并入库；seed 脚本已移除，数据库通过迁移与内容同步初始化。
3. ✅ `src/lib/db.ts`：全局单例；`src/lib/queries.ts` 的 `contains` 加 `mode: "insensitive"` 以保持 SQLite 的大小写不敏感行为。
4. ✅ 删除 `prisma/dev.db` 与本地 Postgres 依赖；`.gitignore` 保留 `*.db`。
5. ✅ CI 新增 `validate-db.yml`：在临时 Postgres 上回放迁移（不执行种子）。Preview/Production 的迁移仍由各自 Neon 分支负责。

### 阶段 2：移除运行时文件写入

1. `src/app/actions.ts` 的 `createPaperAction`：删除 `mkdir/writeFile`；改为 DB 事务 + `GitHubWriteJob`。
2. `syncNowAction`：生产禁用本地扫描；改为触发 GitHub 同步 Workflow。
3. `src/lib/ingest.ts` 的 `syncLocalRepository`：仅保留给 CLI/本地同步，加 `assertNotProduction()`。
4. `src/lib/content.ts` 的 `contentRoot/loadLocalPapers`：只在脚本/测试中使用；请求路径不得 import。
5. 确保 Vercel 构建产物包含 `content/papers`（如本地同步需要），用 `outputFileTracingIncludes` 显式声明；否则改为构建期导入数据库。

### 阶段 3：Webhook 与队列

1. 重写 `/api/webhooks/github`：验签 → `SyncEvent` → `send()` → 202；移除内联 `syncFromGitHub`。
2. 新增三个队列消费者路由，使用 `handleCallback`。
3. `SyncEvent` 增加 claim/attempt 字段；消费者用条件更新抢占。
4. `push` 改为增量 compare + 分批；首次全量用 Workflow。
5. 评论镜像、PR 创建迁到 `github-write` 消费者。
6. 加 `vercel.json` 队列 trigger 与 cron。

### 阶段 4：缓存与搜索

1. `next.config.ts` 开启 `cacheComponents`；`withWorkflow()` 包裹。
2. 公开查询加 `use cache` / `cacheLife` / `cacheTag`。
3. 审核、同步、评论写入后 `revalidateTag` / `revalidatePath`。
4. 增加 `searchText`、`pg_trgm`、可选 `tsvector`；重写 `src/lib/queries.ts` 搜索。
5. 列表/详情 API 设置正确 `Cache-Control`。

### 阶段 5：Blob 与上传

1. 新增 `Asset` 模型与 `/api/blob/upload`、`/api/blob/upload-completed`。
2. 提交页支持 PDF 直传；未上传完成不允许提交。
3. 已发布 PDF 走私有两个 store 或 public store + 审核状态控制。
4. 正文图片改 Blob URL；迁移脚本把外部图片登记为 Asset。

### 阶段 6：运维与验收

1. 配 WAF 限流、BotID、日志告警。
2. 跑一次全量回填；对照 GitHub 目录数与 DB 论文数。
3. 压测：首页、搜索、详情、评论、Webhook。
4. 演练：队列重投、Webhook 重复、GitHub 限流、Neon 连接满、Blob 上传失败。
5. 更新 README、AGENTS.md、`.env.example`。

### 迁移完成标志

- `rg "node:fs|writeFile|mkdir|dev.db|sqlite" src/` 无请求路径命中。
- `prisma/schema.prisma` 为 `postgresql`，迁移文件入库。
- Webhook P95 < 1s，且不调用 GitHub API。
- 同一 `deliveryId` 重放 10 次，论文版本/评论/计数不重复。
- 合并 PR 后 60 秒内页面可见新版本。
- Preview Deployment 使用独立 Neon 分支。
- 生产环境无 SQLite、无常驻 Worker、无本地 cron。

---

## 18. 验收标准

| 维度 | 标准 |
|---|---|
| 可用性 | 公开读 99.9%；Webhook 接收 99.99% |
| 延迟 | 首页/详情 P95 < 800 ms（缓存命中 < 200 ms）；搜索 P95 < 500 ms |
| 同步 | 合并后 P95 < 5 分钟可见；每日对账差异为 0 |
| 幂等 | 重复 Webhook/队列消息不产生重复数据 |
| 安全 | 无 token 入客户端；Webhook 验签；Markdown 白名单；上传类型校验 |
| 可恢复 | Neon PITR + 内容仓库可重建索引；队列失败可重放 |
| 成本 | 月度 Vercel/Neon/Upstash/Blob 成本可预测，有预算告警 |

---

## 19. 风险与决策

| 风险 | 影响 | 处理 |
|---|---|---|
| Vercel Queues 仍是 Beta | API/限额可能变化 | 用 `TaskQueue` 接口隔离；保留 `SyncEvent + Cron` 降级路径 |
| 函数 300s 上限 | 全量同步失败 | Workflow + 分批 + 断点 cursor |
| Neon 连接数/冷启动 | 高并发下 5xx | 池化、限制并发、Fluid、同区域、必要时 driver adapter |
| 中文搜索效果 | 召回差 | trigram 为主；规模上升接 Upstash Search |
| Blob 出网费用 | 成本上升 | 公开资源 CDN；私有资源少代理； immutable path |
| GitHub 限流 | 同步延迟 | 条件请求、ETag、退避、单消费者限流 |
| Vercel 绑定 | 迁移成本 | 队列/存储/搜索接口抽象；数据可导出；内容在 GitHub |
| Preview 误连生产 | 数据污染 | Neon Preview Branch + 独立环境变量 + 部署保护 |
| 迁移期间双写不一致 | 数据错乱 | 迁移窗口只读；以 GitHub + 全量回填为准 |

### 关键决策

1. **Neon 而不是“Vercel Postgres”**：后者已废弃；Neon 是当前 Marketplace 原生集成，支持分支与池化。
2. **Prisma + 池化连接，而不是 Neon HTTP driver**：需要交互式事务与关系约束；连接压力大时再换 adapter。
3. **Vercel Queues + Workflows，而不是 Kafka**：Vercel 没有常驻 Worker；Queues 负责事件，Workflows 负责长流程。
4. **Postgres 搜索，而不是 OpenSearch**：当前规模不需要独立集群；trigram 先满足中文子串检索。
5. **Blob，而不是 S3**：与 Vercel 同平台、OIDC 鉴权、CDN 直出；保留 `StorageAdapter` 接口以便迁移。
6. **GitHub 仍是内容源**：这保证审计与可迁移性；如果产品要求完全不依赖 GitHub，需要另行设计内容与讨论的数据库化，属于产品范围变更。

---

## 20. 参考资料

- [Vercel Postgres（Marketplace 入口）](https://vercel.com/docs/postgres)
- [Vercel Redis（Marketplace 入口）](https://vercel.com/docs/redis)
- [Neon Vercel-Managed Integration（环境变量与 Preview Branching）](https://neon.com/docs/guides/vercel-managed-integration)
- [Vercel Functions Limits（4.5 MB、300/800/1800s）](https://vercel.com/docs/functions/limitations)
- [Vercel Queues](https://vercel.com/docs/queues)
- [Vercel Queues JS SDK](https://vercel.com/docs/queues/sdk)
- [Vercel Queues Pricing & Limits](https://vercel.com/docs/queues/pricing)
- [Vercel Workflows](https://vercel.com/docs/workflows)
- [Workflow SDK Next.js 集成](https://workflow-sdk.dev/docs/getting-started/next)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Vercel Cron 限额](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Vercel Blob](https://vercel.com/docs/vercel-blob)
- [Vercel Blob Client Uploads](https://vercel.com/docs/vercel-blob/client-upload)
- [Vercel Runtime Cache](https://vercel.com/docs/caching/runtime-cache)
- [Next.js `use cache`](https://nextjs.org/docs/app/api-reference/directives/use-cache)
- [Vercel WAF Rate Limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
- [Upstash Redis TypeScript SDK](https://upstash.com/docs/redis/sdks/ts/getstarted)
- [GitHub App 认证](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app)
- [GitHub Webhook 签名](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
