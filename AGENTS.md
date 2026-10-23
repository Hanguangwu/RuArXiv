# AGENTS.md

本文件是给在本仓库工作的 AI/人类协作者的**操作约束与上下文入口**。开始改代码前先读完本文，再读对应设计文档。

## 1. 项目是什么

RuArXiv 是一个论坛式论文站点：

- 论文正文 = 内容仓库里的 Markdown + YAML 元数据（当前镜像在 `content/papers`）；
- 讨论 = GitHub Issue / Issue Comment；
- 站点自己维护用户、角色、投票、举报、审核、同步与审计；
- 页面读取只读数据库/缓存，**不在请求时实时调用 GitHub**。

产品与架构细节见：

- `docs/基于 GitHub 与 Vercel 的论坛风格 ArXiv 网站技术设计.md`（**现行方案，唯一权威**）
- `docs/content-authoring.md`（内容格式）
- `README.md`（运行与部署入口）

`docs/论坛风格 ArXiv 网站技术设计.md` 是已废弃的早期草案，不要按它实现。

## 2. 当前状态（重要）

仓库当前是**可运行的演示实现**，阶段 1 已完成：数据库已切换到 Neon Postgres，其余 Vercel 迁移尚未完成：

| 能力 | 当前代码 | 目标 |
|---|---|---|
| 数据库 | Prisma + Neon Postgres（阶段 1 完成） | Neon Postgres，迁移文件入库 |
| 文件写入 | 提交时写 `content/papers` | 只写 DB + Vercel Blob，GitHub PR 异步创建 |
| Webhook | 同步执行全量扫描 | 验签 + `SyncEvent` + 入队 + 202 |
| 后台任务 | 请求内同步 | Vercel Queues / Workflows / Cron |
| 缓存 | 基本动态渲染 | `use cache` / ISR / Runtime Cache / CDN |
| 搜索 | Postgres `contains` + `mode: "insensitive"` | Postgres `pg_trgm`（可选 `tsvector`） |

**因此：**

- 不要假设 Vercel 部署已经可用；
- 新代码按**目标架构**写，不要继续加深对本地文件系统、常驻进程、SQLite 专属行为的依赖；
- 修改涉及迁移的行为时，同步更新 `README.md` 的状态说明与迁移清单。

## 3. 目标架构（Vercel 全托管）

| 层 | 技术 |
|---|---|
| Web / API | Next.js 16 App Router，Node.js runtime，Vercel Functions（Fluid compute） |
| 关系库 | Neon Postgres，通过 Vercel Marketplace 接入；`DATABASE_URL` 池化，`DATABASE_URL_UNPOOLED` 迁移 |
| 缓存/限流 | Upstash Redis（Marketplace，`@upstash/redis` REST） |
| 页面/数据缓存 | Next.js `use cache` + `cacheLife` + `cacheTag`；`use cache: remote`；ISR/CDN |
| 异步 | Vercel Queues（Beta，`@vercel/queue`） |
| 长任务 | Vercel Workflows（`workflow` SDK，`"use workflow"` / `"use step"`） |
| 定时 | Vercel Cron（UTC；Hobby 每天一次，Pro 每分钟） |
| 文件 | Vercel Blob（`@vercel/blob`；>4.5 MB 必须 client upload） |
| 搜索 | Postgres `pg_trgm`；规模上升再接 Upstash Search 等 Marketplace 服务 |
| 防护 | Vercel Firewall / WAF Rate Limiting |
| 身份/内容源 | GitHub OAuth/App + GitHub Issue（外部依赖，不变） |

**纠正：** Vercel 当前没有第一方 Postgres/Redis 引擎；“Vercel Postgres/KV” 已是历史产品，现由 Neon/Upstash 通过 Marketplace 提供。不要把 Neon/Upstash 写成 Vercel 自研数据库。

## 4. 硬性约束（MUST / MUST NOT）

### MUST

- 所有持久状态放 Postgres / Redis / Blob / GitHub；函数实例无状态。
- Webhook 先验签、用 `SyncEvent.deliveryId` 唯一约束去重，再入队，尽快返回 202。
- 所有异步写操作幂等：唯一约束 + `idempotencyKey` + upsert。
- 外部调用设置超时；批量 GitHub 调用限制并发（≤ 5）。
- 大文件走 Vercel Blob client upload；服务端只签发 token、记录元数据。
- 公开页面优先缓存；写操作后按 tag/path 主动失效。
- 生产迁移用 `prisma migrate deploy`，Preview 用 Neon Preview Branch。
- 上传、评论、提交做服务端权限与输入校验；管理操作写 `AuditLog`。
- 修改 schema 时同时提供迁移文件与回滚/兼容说明。

### MUST NOT

- 不在请求路径使用 `node:fs` 写文件（`writeFile` / `mkdir` / `appendFile`）。
- 不新增 SQLite 专属功能；不把 `prisma/dev.db` 作为运行时数据源。
- 不在 Vercel Function 里跑 `setInterval` / 长循环 / 常驻队列消费者。
- 不在 Webhook 中同步全量扫描 GitHub。
- 不在生产使用 `prisma db push` 或 `prisma migrate reset`。
- 不把 GitHub token、App 私钥、Webhook secret、`AUTH_SECRET` 写入日志或客户端。
- 不把 PDF/大图塞进函数请求体（4.5 MB 限制）。
- 不把论文全文或大列表塞进 Runtime Cache（单条 2 MB）。
- 不用客户端隐藏按钮代替服务端授权。
- 不提交 `.env`、`.env.local`、`prisma/dev.db`、`.next`。

## 5. 目录地图

```text
content/papers/<year>/<paperId>-<slug>/
  metadata.yml         机器可读元数据（zod 校验）
  paper.md             正文（Markdown + LaTeX）
  discussion.json      Issue 评论快照（演示/示例）
  versions/*.md        历史版本快照
prisma/schema.prisma   目标：Postgres 数据模型
scripts/validate-content.ts
schemas/paper-metadata.schema.json
src/lib/content.ts     内容解析（脚本/示例；请求路径不要用于写）
src/lib/ingest.ts      幂等入库
src/lib/sync.ts        GitHub 拉取同步
src/lib/queries.ts     读模型（列表/详情/搜索/排行）
src/lib/participation.ts 投票/评论
src/lib/github.ts      OAuth、App JWT、Issue/PR 写入
src/lib/auth.ts        Session、邀请、角色、演示登录（默认关闭）
src/app/actions.ts     Server Actions（写操作）
src/app/api/v1/**      公开读 API + 写 API
src/app/api/webhooks/github/route.ts
src/app/api/queues/**  目标：队列消费者（迁移后新增）
src/app/api/cron/**    目标：Cron 入口（迁移后新增）
```

## 6. 命令

### 当前可用

```bash
pnpm install
pnpm dev
pnpm build           # 含 prisma generate + prisma migrate deploy
pnpm start
pnpm typecheck
pnpm validate        # 校验 content/papers
pnpm check           # typecheck + validate
pnpm db:generate     # 生成 Prisma Client
pnpm db:migrate      # 开发分支迁移（prisma migrate dev）
pnpm db:deploy       # 应用已提交迁移（Preview/Production）
pnpm db:reset        # 仅 Neon Development 分支，会清空数据（不导入种子）
pnpm sync            # 本地内容入库（仅 dev）
pnpm sync --github   # 从 GitHub 拉取
```

### 部署相关

```bash
vercel link
vercel env pull .env          # Prisma CLI 读取 .env
vercel dev                    # 可选，本地模拟 Vercel 环境
pnpm test                     # 补充后
```

> 不要在 Production 手动执行 `db:reset`。生产数据由内容同步与用户行为产生。

## 7. 环境变量

必需/常用：

```dotenv
DATABASE_URL=                 # Neon 池化连接
DATABASE_URL_UNPOOLED=        # Neon 直连，迁移用
AUTH_SECRET=                  # 32+ 字节，按环境独立
ALLOW_DEMO_LOGIN=false        # 生产必须为 false；仅本地 UI 调试可设为 true
ALLOW_OPEN_SIGNUP=false       # 生产必须为 false；临时开放注册后改回
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_INSTALLATION_ID=
GITHUB_WEBHOOK_SECRET=
GITHUB_CONTENT_REPO=
GITHUB_CONTENT_BRANCH=main
GITHUB_REDIRECT_URI=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
BLOB_READ_WRITE_TOKEN=        # 或 BLOB_STORE_ID + VERCEL_OIDC_TOKEN
SYNC_TOKEN=                   # 可选
CRON_SECRET=                  # 可选
```

规则：

- `AUTH_SECRET`、Webhook secret、App 私钥**每个环境独立**。
- Preview 不得使用 Production 的数据库/Blob/Secret。
- 新增环境变量必须同步 `.env.example` 与本文件。

## 8. 编码约定

- TypeScript strict；优先 Server Component，交互才用 `"use client"`。
- 服务端模块加 `import "server-only"`（数据库、鉴权、GitHub、Blob）。
- 所有外部输入用 zod 校验；错误返回结构化 `{ ok, error }`，不要抛未处理异常给页面。
- Prisma 访问统一走 `src/lib/db.ts` 单例；不要在组件里 `new PrismaClient()`。
- 事务只包数据库操作；不要在事务内调用 GitHub/Blob/队列。
- 时间统一 UTC；展示层再本地化。
- 金额/计数/排序字段不要用浮点；投票用整数与唯一约束。
- 新增路由显式声明 `runtime = "nodejs"`（涉及 Prisma/Node API 时），避免误用 Edge。
- 不要引入新的重型依赖（ORM、搜索、队列）而不先更新设计文档。

## 9. 数据与内容规则

- `paperId` 不可变；URL 用 `paperId`，不用标题。
- `PaperVersion` 每个 `commitSha` 一行；`(paperId, commitSha)` 唯一；`isCurrent` 每篇仅一行。
- 审核状态由站点拥有：同步不得把管理员 `HIDDEN`/`REJECTED` 的论文重新公开。
- 评论保存 `bodySnapshot` 与 GitHub 来源；删除用软删除，保留回复链与审计。
- 投票以本地 `Vote` 为事实来源；不要假装 GitHub reactions 提供“踩”。
- 内容解析的 schema 在 `src/lib/content.ts` 与 `schemas/paper-metadata.schema.json` 保持一致。
- 新增内容字段必须同时更新：zod schema、JSON Schema、`docs/content-authoring.md`、示例内容（如适用）。

## 10. 异步任务规则

- 事件入口只做：验签 → `SyncEvent` 去重 → 入队 → 202。
- 消费者按 `deliveryId` / `jobId` 幂等；重复投递不得重复计数。
- 单次消费者处理小批量（建议 ≤ 10 篇），剩余重新入队或交给 Workflow。
- 全量回填/历史重建用 Workflow；不要用 Cron 直接跑全量。
- 失败写 `lastError`、`attempts`、`nextAttemptAt`；超过阈值转 `DEAD` 并在 `/admin` 可见。
- 新增 topic/消费者要更新 `vercel.json` 与 README 的部署说明。
- 保留降级路径：队列不可用时，Cron 扫描 `SyncEvent(PENDING/FAILED)` 触发 Workflow。

## 11. 缓存规则

- 公开数据用 `use cache` + `cacheLife` + `cacheTag`；tag 命名：
  - `paper:<id>`
  - `paper:<id>:versions`
  - `papers:list`
  - `papers:category:<slug>`
- 写操作后调用 `revalidateTag` / `revalidatePath`；批量操作合并 tag，注意平台速率限制。
- 用户态（Session、我的投票、管理员标记）不得进入公共缓存；`cookies()` 在 `use cache` 外读取。
- `use cache: remote` 只放小对象；不要把全文/评论树放进去。
- 已发布版本按 `commitSha` 可长缓存；当前版本用短 TTL + 主动失效。

## 12. 安全

- Session：HMAC HttpOnly Cookie；生产 `secure`；不存 GitHub access token。
- Webhook：`X-Hub-Signature-256` 验签 + `X-GitHub-Delivery` 幂等；生产缺 secret 必须拒绝。
- OAuth：`state` + PKCE；回调地址与 GitHub 配置完全一致。
- Markdown：`rehype-sanitize` 白名单；禁止原始 HTML、`javascript:`、内联事件。
- 上传：校验 Session/角色、MIME、magic bytes、大小；待审核文件不公开。
- 频率：WAF + Redis 滑动窗口 + 数据库计数兜底。
- 审计：提交、审核、下架、恢复、举报、同步失败、权限变更都要记录。
- 日志脱敏：不打印 token、Cookie、私钥、完整正文。

## 13. 验证

提交前至少运行：

```bash
pnpm typecheck
pnpm validate
```

涉及数据库/同步/队列的改动，额外验证：

- `pnpm exec prisma migrate diff` 或迁移在空库可重放；
- 在 Neon Development 分支运行 `pnpm db:deploy`，确认迁移在空库可重放；不要依赖已移除的 seed 脚本；
- Webhook 重复投递 10 次不产生重复数据；
- 队列消息重投不重复计数；
- 合并 PR 后 60 秒内缓存失效；
- Preview 使用独立 Neon 分支；
- `rg "node:fs|writeFile|mkdir\\(|dev\\.db|sqlite" src/` 无请求路径命中。

## 14. 迁移优先级（当前待办）

1. ✅ Prisma → Neon Postgres，初始迁移入库（阶段 1 完成）。
2. `createPaperAction` 去掉本地文件写入，改 DB + `GitHubWriteJob`。
3. Webhook 改为验签 + 入队 + 202。
4. 新增队列消费者；PR/评论镜像异步化。
5. Webhook `push` 改增量 + 分批；全量用 Workflow。
6. 开启 `cacheComponents`，公开读模型加缓存与失效。
7. 搜索加 Postgres `pg_trgm` 索引；当前 `contains` 已显式使用 `mode: "insensitive"`。
8. 接入 Vercel Blob（PDF/图片 client upload）。
9. 配 `vercel.json` Cron/函数时长；加 WAF 限流。
10. 更新 README、`.env.example`、部署文档。

## 15. Agent 工作方式

- 先读本文件与现行设计文档，再动代码。
- 改动前用 `rg` 确认调用点；不要凭印象改 schema 或 API。
- 一次只做一个可验证的迁移步骤；不要把“数据库切换 + 队列 + 缓存”塞进一个 PR。
- 不执行破坏性命令（`migrate reset`、删库、删 Blob、强推）除非用户明确要求。
- 不修改生产环境变量；需要时给出 `vercel env` 命令让用户执行。
- 完成后说明：改了什么、如何验证、还有什么未完成。
