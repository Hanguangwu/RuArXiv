/**
 * Seeds the local demo database:
 *   - demo accounts for the three sign-in personas
 *   - invitations
 *   - the content repository mirror (papers, versions, discussions)
 *   - votes, reports and audit trail
 *
 * Run with `pnpm db:reset` for a clean slate.
 */
import { prisma } from "../src/lib/db";
import { syncLocalRepository } from "../src/lib/ingest";
import { PAPER_STATUS } from "../src/lib/constants";

type DemoUser = {
  githubUserId: string;
  login: string;
  name: string;
  avatarUrl: string;
  affiliation: string;
  bio: string;
  role: string;
};

const USERS: DemoUser[] = [
  {
    githubUserId: "demo-reader",
    login: "wangzhe",
    name: "王哲",
    avatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4",
    affiliation: "云基础设施 · 分布式系统",
    bio: "关注共识协议、存储引擎与可观测性。喜欢在论文下追问实现细节。",
    role: "USER",
  },
  {
    githubUserId: "demo-author",
    login: "linxiaoyu",
    name: "林小宇",
    avatarUrl: "https://avatars.githubusercontent.com/u/9919?v=4",
    affiliation: "清华大学 · 计算机系",
    bio: "NLP 博士生，研究检索增强生成、评测与证据归因。",
    role: "AUTHOR",
  },
  {
    githubUserId: "demo-admin",
    login: "admin",
    name: "何嘉",
    avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
    affiliation: "RuArXiv",
    bio: "RuArXiv 维护者，负责内容审核、同步与社区治理。",
    role: "ADMIN",
  },
  {
    githubUserId: "demo-chenmeng",
    login: "chenmeng",
    name: "陈梦",
    avatarUrl: "https://avatars.githubusercontent.com/u/1024025?v=4",
    affiliation: "上海人工智能实验室",
    bio: "多模态理解与视觉语言模型，关注基准测试的有效性。",
    role: "AUTHOR",
  },
  {
    githubUserId: "demo-sofia",
    login: "sofia-k",
    name: "Sofia Keller",
    avatarUrl: "https://avatars.githubusercontent.com/u/810438?v=4",
    affiliation: "ETH Zürich · Seminar für Statistik",
    bio: "因果推断与稳健统计，网络干扰实验设计。",
    role: "AUTHOR",
  },
  {
    githubUserId: "demo-alex",
    login: "alex-park",
    name: "Alex Park",
    avatarUrl: "https://avatars.githubusercontent.com/u/69631?v=4",
    affiliation: "KAIST · ML Systems Lab",
    bio: "机器学习系统、推理加速与程序修复。",
    role: "MODERATOR",
  },
  {
    githubUserId: "demo-zhaoyun",
    login: "zhaoyun",
    name: "赵云",
    avatarUrl: "https://avatars.githubusercontent.com/u/15225?v=4",
    affiliation: "北京大学 · 数学科学学院",
    bio: "非凸优化、随机算法与下界分析。",
    role: "USER",
  },
  {
    githubUserId: "demo-meera",
    login: "meera-i",
    name: "Meera Iyer",
    avatarUrl: "https://avatars.githubusercontent.com/u/6154722?v=4",
    affiliation: "IISc · Computational Physics",
    bio: "神经算子、湍流模拟与科学机器学习。",
    role: "AUTHOR",
  },
  {
    githubUserId: "demo-kaito",
    login: "kaito-s",
    name: "Kaito Sato",
    avatarUrl: "https://avatars.githubusercontent.com/u/21206976?v=4",
    affiliation: "University of Tokyo · HCI",
    bio: "人机协作、智能体可用性与长程任务评测。",
    role: "USER",
  },
  {
    githubUserId: "demo-elena",
    login: "elena-v",
    name: "Elena Volkova",
    avatarUrl: "https://avatars.githubusercontent.com/u/3573950?v=4",
    affiliation: "TU Delft · Cybersecurity",
    bio: "密码协议、可验证延迟函数与隐私工程。",
    role: "AUTHOR",
  },
];

function pseudoRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  console.log("→ 创建演示用户");
  for (const user of USERS) {
    await prisma.user.upsert({
      where: { githubUserId: user.githubUserId },
      create: { ...user, isDemo: true, email: `${user.login}@example.org` },
      update: { name: user.name, avatarUrl: user.avatarUrl, affiliation: user.affiliation },
    });
  }

  const admin = await prisma.user.findUniqueOrThrow({ where: { login: "admin" } });

  console.log("→ 创建邀请码");
  await prisma.invite.deleteMany({ where: { code: { startsWith: "RUARXIV-" } } });
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  await prisma.invite.createMany({
    data: [
      { code: "RUARXIV-DEMO-2026", note: "演示邀请码（未使用）", createdById: admin.id, expiresAt: expires },
      { code: "RUARXIV-LAB-ETH", email: "guest@ethz.ch", note: "ETH 统计系访客", createdById: admin.id, expiresAt: expires },
      { code: "RUARXIV-ML-SYS", note: "ML Systems 工作坊", createdById: admin.id, expiresAt: expires },
    ],
  });

  console.log("→ 同步内容仓库（content/papers）");
  const report = await syncLocalRepository({ actorLogin: "admin" });
  console.log(
    `   scanned=${report.scanned} created=${report.created} updated=${report.updated} unchanged=${report.unchanged} failed=${report.failed.length}`,
  );
  for (const failure of report.failed) console.log(`   ! ${failure.path}: ${failure.error}`);

  console.log("→ 生成投票、浏览量与举报");
  await prisma.vote.deleteMany();
  await prisma.report.deleteMany();

  const papers = await prisma.paper.findMany({
    where: { status: PAPER_STATUS.PUBLISHED },
    orderBy: { publishedAt: "asc" },
  });
  const voters = await prisma.user.findMany();

  for (const paper of papers) {
    const rand = pseudoRandom(paper.id);
    const base = 24 + Math.floor(rand() * 260);
    const baseDown = 2 + Math.floor(rand() * 18);
    let up = 0;
    let down = 0;

    for (const voter of voters) {
      const roll = rand();
      if (roll > 0.62) {
        const value = roll > 0.9 ? -1 : 1;
        await prisma.vote.create({
          data: { paperId: paper.id, userId: voter.id, value, source: "LOCAL" },
        });
        if (value === 1) up += 1;
        else down += 1;
      }
    }

    await prisma.paper.update({
      where: { id: paper.id },
      data: {
        score: base + up - down,
        upvotes: base + up,
        downvotes: baseDown + down,
        viewCount: 400 + Math.floor(rand() * 9000),
      },
    });
  }

  const hidden = await prisma.paper.findFirst({ where: { status: PAPER_STATUS.HIDDEN } });
  const hiddenComment = hidden
    ? await prisma.comment.findFirst({ where: { paperId: hidden.id, status: "VISIBLE" } })
    : null;

  if (hidden) {
    await prisma.report.create({
      data: {
        paperId: hidden.id,
        reporterId: (await prisma.user.findUnique({ where: { login: "elena-v" } }))?.id,
        reason: "版权投诉",
        detail: "权利人表示论文中的遥测数据表包含未授权的第三方日志样本，已临时下架并等待作者回应。",
        status: "OPEN",
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        actorLogin: admin.login,
        action: "paper.hidden",
        targetType: "paper",
        targetId: hidden.id,
        detailJson: JSON.stringify({ reason: "版权投诉 · 等待作者回应", reportId: "seed" }),
      },
    });
  }
  if (hiddenComment) {
    await prisma.report.create({
      data: {
        commentId: hiddenComment.id,
        reporterId: (await prisma.user.findUnique({ where: { login: "kaito-s" } }))?.id,
        reason: "不当内容",
        detail: "评论中包含与论文无关的人身攻击。",
        status: "OPEN",
      },
    });
  }

  const counts = {
    users: await prisma.user.count(),
    papers: await prisma.paper.count(),
    versions: await prisma.paperVersion.count(),
    comments: await prisma.comment.count(),
    votes: await prisma.vote.count(),
    reports: await prisma.report.count(),
  };
  console.log("✓ 演示数据就绪", counts);
  console.log("  演示账号：reader=wangzhe / author=linxiaoyu / admin=admin");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
