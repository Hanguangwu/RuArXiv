# RuArXiv

一个以 GitHub 为内容源与审计源、以论坛方式组织的论文站点。

论文正文是仓库里的 Markdown，元数据是可校验的 YAML，讨论是 GitHub Issue / Issue Comment；
网站不把 GitHub 当在线数据库，而是维护自己的只读索引与业务数据（用户、投票、举报、审核、审计）。
仓库中的 `content/papers` 是内容仓库的本地镜像，因此没有任何 GitHub 凭据也能完整体验产品。

> 设计依据：`docs/基于 GitHub 的论坛风格 ArXiv 网站技术设计.md`
> 内容规范：`docs/content-authoring.md`

---

## 快速开始

```bash
pnpm install
cp .env.example .env          # Windows: copy .env.example .env
pnpm db:reset                 # 建库 + 导入 11 篇演示论文 / 66 条讨论
pnpm dev                      # http://localhost:3000
```

无需 GitHub 凭据即可运行：登录页提供三个本地演示账号。

| 演示身份 | 账号 | 权限 |
|---|---|---|
| 读者 | `wangzhe` | 浏览、搜索、投票、举报 |
| 作者 | `linxiaoyu` | 提交论文、评论（AUTHOR） |
| 管理员 | `admin` | 审核、下架、处理举报、触发同步（ADMIN） |

种子数据包含 9 篇已发布论文、1 篇待审核、1 篇因版权投诉下架，用来演示完整的审核与溯源链路。

### 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 开发服务器 |
| `pnpm build` / `pnpm start` | 生产构建与启动 |
| `pnpm typecheck` | TypeScript 检查 |
| `pnpm validate` | 校验 `content/papers` 的目录、Schema、安全规则 |
| `pnpm sync` | 把本地 `content/papers` 同步进数据库 |
| `pnpm sync --github` | 从配置的 GitHub 仓库拉取并同步 |
| `pnpm db:reset` | 重建 SQLite 数据库并重新导入演示内容 |
| `pnpm db:seed` | 只重新导入演示数据（幂等） |

---

## 技术栈

- **Next.js 16 App Router + React 19 + TypeScript**：论文详情页服务端渲染，便于 SEO 与首屏。
- **Tailwind CSS v4**：设计令牌集中在 `src/app/globals.css`。
- **Prisma + SQLite**：本地零依赖；schema 不使用 SQLite 专属能力，可切换到 PostgreSQL。
- **react-markdown + remark-gfm + remark-math + KaTeX + rehype-sanitize**：论文公式与 GFM 表格，白名单渲染，不启用原始 HTML。
- **Octokit**：GitHub App 安装令牌、Issue 评论、PR 创建、仓库树读取。
- **自签名 HttpOnly Cookie**：站点 Session，浏览器不接触 GitHub 令牌。

## 目录结构

```text
content/papers/<year>/<paperId>-<slug>/
  metadata.yml         # 机器可读元数据（zod 校验）
  paper.md             # 正文（Markdown + LaTeX）
  discussion.json      # Issue 评论快照（演示模式的数据源）
  versions/*.md        # 历史版本快照
prisma/schema.prisma   # 用户、论文、版本、评论、投票、举报、同步事件、审计
prisma/seed.ts         # 演示用户 / 邀请码 / 内容同步 / 投票与举报
scripts/validate-content.ts
schemas/paper-metadata.schema.json
src/lib/content.ts     # 内容仓库解析（本地与 GitHub 共用）
src/lib/ingest.ts      # 幂等入库：论文、版本、评论、审计
src/lib/sync.ts        # GitHub 拉取同步、Issue 增量同步
src/lib/queries.ts     # 读模型：列表、详情、搜索、排行、后台
src/lib/participation.ts # 投票与评论服务（Web 与 API 共用）
src/lib/github.ts      # OAuth、GitHub App JWT、Issue/PR 写入
src/lib/auth.ts        # Session、邀请制、角色、Demo 登录
src/app/actions.ts     # 服务端写操作
src/app/api/v1/**      # 公开读 API + 写 API
src/app/api/webhooks/github/route.ts
```

## 核心流程

### 论文提交（PR 优先）

1. 作者在 `/submit` 填写元数据与 Markdown 正文。
2. 网站生成不可变 `paperId` 与目录，写入本地内容仓库；配置 GitHub 后同时创建分支和 PR。
3. 论文以 `PENDING_REVIEW` 入库，进入 `/admin` 审核队列。
4. GitHub Actions 执行 `pnpm validate`（Schema、目录命名、脚本注入、大小限制）。
5. 合并后 `push` Webhook 触发同步，管理员在站内批准后公开。
6. 每次合并产生新的 `PaperVersion`，保留 commit SHA、PR、父提交与内容哈希。

### 讨论（Issue 映射）

- 每篇论文对应一个带 `paper-discussion` 标签的 Issue（`githubIssueNumber`）。
- 网站写入评论前先做登录/角色/频率校验，再调用 GitHub API；失败时保留本地评论并写入失败事件，等待对账。
- 评论保存 `bodySnapshot`、GitHub 评论 id 与来源链接；展示排序由本地索引完成。

### 同步与一致性

- `SyncEvent` 以 `x-github-delivery` 唯一约束做幂等；重复投递直接返回 202。
- Webhook 校验 `X-Hub-Signature-256`（HMAC-SHA256）。
- `push` 事件触发全量仓库扫描；`issue_comment` 只刷新对应 Issue。
- `POST /api/v1/sync` 支持管理员触发或 `x-sync-token` 定时对账；无 GitHub 凭据时回退到本地镜像。
- 搜索与列表只读数据库，页面不实时调用 GitHub；页面展示 `syncedAt` 与 commit 链接供复核。

## 数据模型要点

- **用户**以不可变 `github_user_id` 关联，`login` 仅展示；角色为 `USER / INVITED_USER / AUTHOR / MODERATOR / ADMIN`。
- **Paper** 的 `id` 即对外 `paperId`，URL 使用它而不是标题；`slug` 只用于内容目录。
- **PaperVersion** 每个 commit 一行，`isCurrent` 标记当前版本，正文快照用于 diff 与索引。
- **Vote** 唯一约束 `(paperId, userId)`，本地事实来源；“赞”可镜像到 GitHub reaction，MVP 先记录本地。
- **AuditLog** 覆盖提交、审核、下架、举报、同步等动作。

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

## 接入真实 GitHub

1. **GitHub App**：创建 App，权限最小化：
   - Repository contents: Read（需要代提交 PR 时 Write）
   - Issues: Read & write
   - Metadata: Read
   - 订阅事件：`push`、`issues`、`issue_comment`、`installation`
2. 生成私钥，填写 `.env`：

```dotenv
GITHUB_APP_ID=...
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n"
GITHUB_INSTALLATION_ID=...
GITHUB_WEBHOOK_SECRET=...
GITHUB_CONTENT_REPO=owner/papers
GITHUB_CONTENT_BRANCH=main
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_REDIRECT_URI=https://your.site/api/v1/auth/github/callback
```

3. Webhook URL：`https://your.site/api/webhooks/github`，Content type `application/json`。
4. OAuth 回调地址必须与 `GITHUB_REDIRECT_URI` 完全一致；登录使用 PKCE + `state`。
5. 邀请制：新用户默认需要 `Invite`（邮箱或邀请码）；第一个登录用户自动成为 `ADMIN`。开放注册可设 `ALLOW_OPEN_SIGNUP=true`。

## 安全

- Markdown 不启用原始 HTML，`rehype-sanitize` 白名单过滤；链接只允许 http/https，外链带 `noopener noreferrer`。
- Session 使用 HMAC-SHA256 签名，HttpOnly + SameSite=Lax，7 天过期；不保存 GitHub access token。
- Webhook 验签 + delivery 幂等；私钥只从环境变量读取，不写日志。
- 评论长度、频率与重复内容限制；提交与举报写审计日志。
- 版权/违规处理：先隐藏站内展示与搜索索引，保留 GitHub 与审计证据。

## 与设计文档的对应关系

| 设计文档 | 实现 |
|---|---|
| §4 仓库布局 / Markdown 约定 | `content/papers/**`、`schemas/`、`scripts/validate-content.ts`、CI workflow |
| §5 GitHub 登录 / 权限 | `src/lib/auth.ts`、`/api/v1/auth/github/*`、邀请与角色 |
| §6 PR 优先与版本溯源 | `createPaperAction`、`createPaperPullRequest`、`PaperVersion`、版本与 diff API |
| §7 Issue 评论 | `githubIssueNumber`、评论镜像、失败事件、讨论树 |
| §8 同步与索引 | `src/lib/sync.ts`、`SyncEvent`、Webhook、`POST /api/v1/sync` |
| §9 API | `src/app/api/v1/**` |
| §10 数据模型 | `prisma/schema.prisma` |
| §12 安全 | 验签、白名单 Markdown、审计、频率限制 |
| §13 可靠性 | 同步事件、幂等、手工对账、失败降级 |

## 生产化待办（MVP 之外的已知边界）

- **队列**：Webhook 目前同步执行，生产应写 `SyncEvent` 后立即返回 202，由独立 Worker 消费（Redis Streams / Kafka），并提供重试与死信。
- **数据库**：切换到 PostgreSQL；评论与论文全文检索改用 PostgreSQL FTS 或 OpenSearch（当前 SQLite `contains`，中文按子串匹配）。
- **缓存**：热门列表、论文详情、搜索结果加 Redis + CDN；详情页按 `commitSha` 做长缓存。
- **对象存储**：PDF/图片走 S3 兼容存储，正文只存 URL 与 SHA-256，避免 Git 膨胀。
- **评论同步**：Issue 评论增量拉取目前按 Issue 全量覆盖，规模增大后应使用 `since` 游标与 reaction 单独同步。
- **限流与反滥用**：当前仅评论频率限制，生产需在边缘层做 IP/用户维度限流与内容风控。
- **测试**：已提供内容校验与类型检查；建议补充 Playwright 页面回归与同步幂等集成测试。
- **可观测性**：接入 OpenTelemetry，暴露同步延迟、失败率、GitHub 配额与索引延迟指标。

## 许可

演示内容为虚构文本，仅用于产品演示；代码默认 MIT。
