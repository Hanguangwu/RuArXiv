import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { CATEGORIES, PAPER_STATUS, type SortKey } from "./constants";
import {
  parseAuthors,
  parseJsonArray,
  parseReactions,
  type PaperAuthor,
} from "./serialize";

export type PaperCard = {
  id: string;
  slug: string;
  title: string;
  abstract: string;
  authors: PaperAuthor[];
  categories: string[];
  keywords: string[];
  license: string;
  language: string;
  status: string;
  sourceUrl: string | null;
  score: number;
  upvotes: number;
  downvotes: number;
  commentCount: number;
  viewCount: number;
  publishedAt: Date | null;
  lastActivityAt: Date;
  currentCommitSha: string | null;
  versionCount: number;
  submitter: { login: string; name: string | null; avatarUrl: string | null } | null;
};

const paperSelect = {
  id: true,
  slug: true,
  title: true,
  abstract: true,
  authorsJson: true,
  categoriesJson: true,
  keywordsJson: true,
  license: true,
  language: true,
  status: true,
  sourceUrl: true,
  score: true,
  upvotes: true,
  downvotes: true,
  commentCount: true,
  viewCount: true,
  publishedAt: true,
  lastActivityAt: true,
  currentCommitSha: true,
  submittedBy: { select: { login: true, name: true, avatarUrl: true } },
  _count: { select: { versions: true } },
} satisfies Prisma.PaperSelect;

function toCard(
  paper: Prisma.PaperGetPayload<{ select: typeof paperSelect }>,
): PaperCard {
  return {
    id: paper.id,
    slug: paper.slug,
    title: paper.title,
    abstract: paper.abstract,
    authors: parseAuthors(paper.authorsJson),
    categories: parseJsonArray<string>(paper.categoriesJson),
    keywords: parseJsonArray<string>(paper.keywordsJson),
    license: paper.license,
    language: paper.language,
    status: paper.status,
    sourceUrl: paper.sourceUrl,
    score: paper.score,
    upvotes: paper.upvotes,
    downvotes: paper.downvotes,
    commentCount: paper.commentCount,
    viewCount: paper.viewCount,
    publishedAt: paper.publishedAt,
    lastActivityAt: paper.lastActivityAt,
    currentCommitSha: paper.currentCommitSha,
    versionCount: paper._count.versions,
    submitter: paper.submittedBy,
  };
}

const SORTS: Record<SortKey, Prisma.PaperOrderByWithRelationInput[]> = {
  latest: [{ publishedAt: "desc" }, { id: "desc" }],
  hot: [{ score: "desc" }, { id: "desc" }],
  active: [{ lastActivityAt: "desc" }, { id: "desc" }],
  discussed: [{ commentCount: "desc" }, { id: "desc" }],
};

export type ListPapersParams = {
  query?: string;
  category?: string;
  author?: string;
  sort?: SortKey;
  cursor?: string;
  limit?: number;
  status?: string | "ALL";
  includeBody?: boolean;
};

export async function listPapers(params: ListPapersParams = {}) {
  const limit = Math.min(Math.max(params.limit ?? 12, 1), 50);
  const sort = params.sort ?? "latest";
  const status = params.status ?? PAPER_STATUS.PUBLISHED;

  const conditions: Prisma.PaperWhereInput[] = [];
  if (status !== "ALL") conditions.push({ status });
  if (params.category) conditions.push({ categoriesJson: { contains: `"${params.category}"`, mode: "insensitive" } });
  if (params.author) conditions.push({ authorLogins: { contains: params.author.toLowerCase(), mode: "insensitive" } });
  if (params.query) {
    const q = params.query.trim();
    if (q) {
      conditions.push({
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { abstract: { contains: q, mode: "insensitive" } },
          { authorsJson: { contains: q, mode: "insensitive" } },
          { keywordsJson: { contains: q, mode: "insensitive" } },
          ...(params.includeBody
            ? [
                {
                  versions: {
                    some: { isCurrent: true, bodyMarkdown: { contains: q, mode: "insensitive" } },
                  },
                } satisfies Prisma.PaperWhereInput,
              ]
            : []),
        ],
      });
    }
  }

  const where: Prisma.PaperWhereInput = conditions.length
    ? { AND: conditions }
    : {};

  const [rows, total] = await Promise.all([
    prisma.paper.findMany({
      where,
      select: paperSelect,
      orderBy: SORTS[sort],
      take: limit + 1,
      ...(params.cursor
        ? { cursor: { id: params.cursor }, skip: 1 }
        : {}),
    }),
    prisma.paper.count({ where }),
  ]);

  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map(toCard);

  return {
    items,
    total,
    nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
  };
}

export type CommentNode = {
  id: string;
  githubCommentId: string | null;
  authorLogin: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  body: string;
  reactions: Record<string, number>;
  isAuthor: boolean;
  status: string;
  createdAt: Date;
  replies: CommentNode[];
};

type CommentRow = {
  id: string;
  githubCommentId: string | null;
  parentId: string | null;
  authorLogin: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  bodySnapshot: string;
  reactionsJson: string;
  isAuthor: boolean;
  status: string;
  createdAt: Date;
};

function buildCommentTree(rows: CommentRow[], sort: "oldest" | "top" = "oldest"): CommentNode[] {
  const nodes = new Map<string, CommentNode>();
  for (const row of rows) {
    if (row.status !== "VISIBLE") continue;
    nodes.set(row.id, {
      id: row.id,
      githubCommentId: row.githubCommentId,
      authorLogin: row.authorLogin,
      authorName: row.authorName,
      authorAvatarUrl: row.authorAvatarUrl,
      body: row.bodySnapshot,
      reactions: parseReactions(row.reactionsJson),
      isAuthor: row.isAuthor,
      status: row.status,
      createdAt: row.createdAt,
      replies: [],
    });
  }
  const roots: CommentNode[] = [];
  for (const row of rows) {
    if (row.status !== "VISIBLE") continue;
    const node = nodes.get(row.id);
    if (!node) continue;
    if (row.parentId && nodes.has(row.parentId)) {
      nodes.get(row.parentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }
  const score = (node: CommentNode) =>
    Object.values(node.reactions).reduce((sum, n) => sum + n, 0);
  const sorter =
    sort === "top"
      ? (a: CommentNode, b: CommentNode) => score(b) - score(a)
      : (a: CommentNode, b: CommentNode) => a.createdAt.getTime() - b.createdAt.getTime();
  roots.sort(sorter);
  for (const root of roots) root.replies.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return roots;
}

export async function getPaperDetail(idOrSlug: string, viewerId?: string | null) {
  const paper = await prisma.paper.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: {
      submittedBy: { select: { login: true, name: true, avatarUrl: true } },
      versions: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!paper) return null;

  const [comments, userVote, voteBreakdown, roomAggregate] = await Promise.all([
    prisma.comment.findMany({
      where: { paperId: paper.id },
      orderBy: { createdAt: "asc" },
    }),
    viewerId
      ? prisma.vote.findUnique({
          where: { paperId_userId: { paperId: paper.id, userId: viewerId } },
          select: { value: true },
        })
      : Promise.resolve(null),
    prisma.vote.groupBy({
      by: ["value"],
      where: { paperId: paper.id },
      _count: { _all: true },
    }),
    prisma.paper.aggregate({
      where: { status: PAPER_STATUS.PUBLISHED },
      _avg: { commentCount: true },
    }),
  ]);

  const upvotes = voteBreakdown.find((row) => row.value === 1)?._count._all ?? 0;
  const downvotes = voteBreakdown.find((row) => row.value === -1)?._count._all ?? 0;

  const currentVersion =
    paper.versions.find((version) => version.isCurrent) ?? paper.versions[0] ?? null;

  return {
    paper: toCard({ ...paper, _count: { versions: paper.versions.length } }),
    raw: paper,
    versions: paper.versions,
    currentVersion,
    comments: buildCommentTree(comments),
    commentCount: comments.filter((comment) => comment.status === "VISIBLE").length,
    userVote: userVote?.value ?? 0,
    votes: { upvotes, downvotes, score: upvotes - downvotes },
    roomAverageComments: roomAggregate._avg.commentCount ?? 0,
  };
}

export async function getVersions(paperId: string) {
  return prisma.paperVersion.findMany({
    where: { paperId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCategoriesWithCounts() {
  const papers = await prisma.paper.findMany({
    where: { status: PAPER_STATUS.PUBLISHED },
    select: { categoriesJson: true, commentCount: true },
  });
  const counts = new Map<string, number>();
  for (const paper of papers) {
    for (const category of parseJsonArray<string>(paper.categoriesJson)) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }
  return CATEGORIES.map((category) => ({
    ...category,
    count: counts.get(category.slug) ?? 0,
  }));
}

export type AuthorSummary = {
  login: string;
  name: string;
  avatarUrl: string | null;
  affiliation?: string;
  paperCount: number;
  score: number;
  commentCount: number;
  categories: string[];
};

export async function getTopAuthors(limit = 10): Promise<AuthorSummary[]> {
  const papers = await prisma.paper.findMany({
    where: { status: PAPER_STATUS.PUBLISHED },
    select: {
      authorsJson: true,
      categoriesJson: true,
      score: true,
      commentCount: true,
    },
  });
  const map = new Map<string, AuthorSummary>();
  for (const paper of papers) {
    for (const author of parseAuthors(paper.authorsJson)) {
      if (!author.login) continue;
      const key = author.login.toLowerCase();
      const existing = map.get(key) ?? {
        login: author.login,
        name: author.name,
        avatarUrl: null,
        affiliation: author.affiliation,
        paperCount: 0,
        score: 0,
        commentCount: 0,
        categories: [],
      };
      existing.paperCount += 1;
      existing.score += paper.score;
      existing.commentCount += paper.commentCount;
      for (const category of parseJsonArray<string>(paper.categoriesJson)) {
        if (!existing.categories.includes(category)) existing.categories.push(category);
      }
      map.set(key, existing);
    }
  }
  const logins = Array.from(map.keys());
  const users = await prisma.user.findMany({
    where: { login: { in: logins } },
    select: { login: true, name: true, avatarUrl: true, affiliation: true },
  });
  for (const user of users) {
    const author = map.get(user.login.toLowerCase());
    if (!author) continue;
    author.avatarUrl = user.avatarUrl;
    author.name = user.name ?? author.name;
    author.affiliation = user.affiliation ?? author.affiliation;
  }
  return Array.from(map.values())
    .sort((a, b) => b.score - a.score || b.paperCount - a.paperCount)
    .slice(0, limit);
}

export async function getAuthorProfile(login: string) {
  const normalized = login.toLowerCase();
  const [user, papers] = await Promise.all([
    prisma.user.findFirst({ where: { login: normalized } }),
    prisma.paper.findMany({
      where: {
        status: PAPER_STATUS.PUBLISHED,
        authorLogins: { contains: normalized, mode: "insensitive" },
      },
      select: paperSelect,
      orderBy: [{ publishedAt: "desc" }],
    }),
  ]);
  const cards = papers.map(toCard);
  const categories = new Set<string>();
  for (const paper of cards) paper.categories.forEach((c) => categories.add(c));
  const author = cards.flatMap((p) => p.authors).find((a) => a.login?.toLowerCase() === normalized);

  return {
    found: Boolean(user || author || cards.length > 0),
    login: user?.login ?? author?.login ?? login,
    name: user?.name ?? author?.name ?? login,
    avatarUrl: user?.avatarUrl ?? null,
    affiliation: user?.affiliation ?? author?.affiliation ?? null,
    bio: user?.bio ?? null,
    role: user?.role ?? null,
    papers: cards,
    stats: {
      papers: cards.length,
      score: cards.reduce((sum, paper) => sum + paper.score, 0),
      citations: 0,
      comments: cards.reduce((sum, paper) => sum + paper.commentCount, 0),
    },
    categories: Array.from(categories),
  };
}

export async function getStats() {
  const [papers, authors, comments, versions, lastSync] = await Promise.all([
    prisma.paper.count({ where: { status: PAPER_STATUS.PUBLISHED } }),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.comment.count({ where: { status: "VISIBLE" } }),
    prisma.paperVersion.count(),
    prisma.syncEvent.findFirst({ orderBy: { receivedAt: "desc" } }),
  ]);
  const categories = await prisma.paper.findMany({
    where: { status: PAPER_STATUS.PUBLISHED },
    select: { categoriesJson: true },
  });
  const categorySet = new Set<string>();
  for (const paper of categories) {
    parseJsonArray<string>(paper.categoriesJson).forEach((c) => categorySet.add(c));
  }
  return {
    papers,
    authors,
    comments,
    versions,
    categories: categorySet.size,
    lastSyncAt: lastSync?.receivedAt ?? null,
    lastSyncStatus: lastSync?.status ?? null,
  };
}

export type SearchHit = {
  kind: "paper" | "comment";
  paperId: string;
  paperTitle: string;
  paperSlug: string;
  snippet: string;
  matchedIn: string[];
  author?: string;
  score: number;
  commentCount: number;
  publishedAt: Date | null;
};

function excerpt(text: string, query: string, radius = 110): string {
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return text.replace(/\s+/g, " ").slice(0, radius * 2);
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + query.length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ")}${end < text.length ? "…" : ""}`;
}

export async function searchPapers(query: string, limit = 20): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const papers = await prisma.paper.findMany({
    where: {
      status: PAPER_STATUS.PUBLISHED,
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { abstract: { contains: q, mode: "insensitive" } },
        { authorsJson: { contains: q, mode: "insensitive" } },
        { keywordsJson: { contains: q, mode: "insensitive" } },
        { categoriesJson: { contains: q, mode: "insensitive" } },
        { versions: { some: { isCurrent: true, bodyMarkdown: { contains: q, mode: "insensitive" } } } },
      ],
    },
    select: {
      ...paperSelect,
      versions: {
        where: { isCurrent: true },
        select: { bodyMarkdown: true },
        take: 1,
      },
    },
    orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
    take: limit,
  });

  const hits: SearchHit[] = papers.map((paper) => {
    const body = paper.versions[0]?.bodyMarkdown ?? "";
    const authors = parseAuthors(paper.authorsJson);
    const authorsText = authors.map((a) => a.name).join(" ");
    const categories = parseJsonArray<string>(paper.categoriesJson);
    const matchedIn: string[] = [];
    if (paper.title.includes(q)) matchedIn.push("标题");
    if (paper.abstract.includes(q)) matchedIn.push("摘要");
    if (authorsText.includes(q)) matchedIn.push("作者");
    if (paper.keywordsJson.includes(q)) matchedIn.push("关键词");
    if (categories.some((c) => c.toLowerCase().includes(q.toLowerCase()))) matchedIn.push("分类");
    if (body.includes(q)) matchedIn.push("正文");

    const snippetSource = paper.title.includes(q)
      ? paper.abstract
      : paper.abstract.includes(q)
        ? paper.abstract
        : body || paper.abstract;

    return {
      kind: "paper" as const,
      paperId: paper.id,
      paperTitle: paper.title,
      paperSlug: paper.slug,
      snippet: excerpt(snippetSource, q),
      matchedIn,
      author: authors.map((a) => a.name).join("、"),
      score: paper.score,
      commentCount: paper.commentCount,
      publishedAt: paper.publishedAt,
    };
  });

  return hits;
}

export async function searchComments(query: string, limit = 10) {
  const q = query.trim();
  if (!q) return [];
  const comments = await prisma.comment.findMany({
    where: {
      status: "VISIBLE",
      bodySnapshot: { contains: q, mode: "insensitive" },
      paper: { status: PAPER_STATUS.PUBLISHED },
    },
    include: {
      paper: { select: { id: true, title: true, slug: true, score: true, commentCount: true, publishedAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return comments.map<SearchHit>((comment) => ({
    kind: "comment",
    paperId: comment.paper.id,
    paperTitle: comment.paper.title,
    paperSlug: comment.paper.slug,
    snippet: excerpt(comment.bodySnapshot, q),
    matchedIn: ["评论"],
    author: comment.authorLogin,
    score: comment.paper.score,
    commentCount: comment.paper.commentCount,
    publishedAt: comment.paper.publishedAt,
  }));
}

export async function searchEverything(query: string) {
  const [papers, comments] = await Promise.all([
    searchPapers(query, 20),
    searchComments(query, 10),
  ]);
  return { papers, comments, total: papers.length + comments.length };
}

export async function getAdminOverview() {
  const [pending, reports, syncEvents, auditLogs, hiddenCount, paperCount, userCount] =
    await Promise.all([
      prisma.paper.findMany({
        where: { status: PAPER_STATUS.PENDING_REVIEW },
        include: { submittedBy: { select: { login: true, avatarUrl: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.report.findMany({
        where: { status: "OPEN" },
        include: {
          paper: { select: { id: true, title: true } },
          reporter: { select: { login: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.syncEvent.findMany({ orderBy: { receivedAt: "desc" }, take: 12 }),
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
      prisma.paper.count({ where: { status: { in: [PAPER_STATUS.HIDDEN, PAPER_STATUS.REJECTED] } } }),
      prisma.paper.count(),
      prisma.user.count(),
    ]);
  return { pending, reports, syncEvents, auditLogs, hiddenCount, paperCount, userCount };
}

export async function getLeaderboards() {
  const [topPapers, mostDiscussed, topAuthors, recent] = await Promise.all([
    prisma.paper.findMany({
      where: { status: PAPER_STATUS.PUBLISHED },
      select: paperSelect,
      orderBy: [{ score: "desc" }, { commentCount: "desc" }],
      take: 10,
    }),
    prisma.paper.findMany({
      where: { status: PAPER_STATUS.PUBLISHED },
      select: paperSelect,
      orderBy: [{ commentCount: "desc" }, { score: "desc" }],
      take: 10,
    }),
    getTopAuthors(10),
    prisma.paper.findMany({
      where: { status: PAPER_STATUS.PUBLISHED },
      select: paperSelect,
      orderBy: [{ publishedAt: "desc" }],
      take: 6,
    }),
  ]);
  return {
    topPapers: topPapers.map(toCard),
    mostDiscussed: mostDiscussed.map(toCard),
    topAuthors,
    recent: recent.map(toCard),
  };
}

export async function getDiscussionStats(paperId: string) {
  const [count, participants] = await Promise.all([
    prisma.comment.count({ where: { paperId, status: "VISIBLE" } }),
    prisma.comment.groupBy({
      by: ["authorLogin"],
      where: { paperId, status: "VISIBLE" },
      _count: { _all: true },
    }),
  ]);
  return { comments: count, participants: participants.length, topParticipants: participants };
}
