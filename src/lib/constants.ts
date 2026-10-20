export const ROLES = [
  "USER",
  "INVITED_USER",
  "AUTHOR",
  "MODERATOR",
  "ADMIN",
] as const;

export type Role = (typeof ROLES)[number];

const ROLE_WEIGHT: Record<Role, number> = {
  USER: 1,
  INVITED_USER: 2,
  AUTHOR: 3,
  MODERATOR: 4,
  ADMIN: 5,
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function hasRole(role: string, required: Role): boolean {
  if (!isRole(role)) return false;
  return ROLE_WEIGHT[role] >= ROLE_WEIGHT[required];
}

export const ROLE_LABELS: Record<Role, string> = {
  USER: "注册用户",
  INVITED_USER: "受邀成员",
  AUTHOR: "作者",
  MODERATOR: "版主",
  ADMIN: "管理员",
};

export const PAPER_STATUS = {
  PENDING_REVIEW: "PENDING_REVIEW",
  PUBLISHED: "PUBLISHED",
  HIDDEN: "HIDDEN",
  REJECTED: "REJECTED",
} as const;

export type PaperStatus = (typeof PAPER_STATUS)[keyof typeof PAPER_STATUS];

export const PAPER_STATUS_LABELS: Record<PaperStatus, string> = {
  PENDING_REVIEW: "待审核",
  PUBLISHED: "已发布",
  HIDDEN: "已隐藏",
  REJECTED: "已驳回",
};

export const COMMENT_STATUS = {
  VISIBLE: "VISIBLE",
  HIDDEN: "HIDDEN",
  DELETED: "DELETED",
} as const;

export const REPORT_STATUS = {
  OPEN: "OPEN",
  RESOLVED: "RESOLVED",
  DISMISSED: "DISMISSED",
} as const;

export type Category = {
  slug: string;
  name: string;
  group: string;
  description: string;
};

// A pragmatic subset of arXiv taxonomy, with Chinese descriptions.
export const CATEGORIES: Category[] = [
  { slug: "cs.AI", name: "人工智能", group: "计算机科学", description: "智能体、知识表示、推理与规划" },
  { slug: "cs.CL", name: "计算语言学", group: "计算机科学", description: "自然语言处理、翻译与语言模型" },
  { slug: "cs.LG", name: "机器学习", group: "计算机科学", description: "学习算法、表示学习与优化" },
  { slug: "cs.CV", name: "计算机视觉", group: "计算机科学", description: "图像理解、生成与三维视觉" },
  { slug: "cs.IR", name: "信息检索", group: "计算机科学", description: "检索、排序与推荐系统" },
  { slug: "cs.SE", name: "软件工程", group: "计算机科学", description: "程序分析、测试与工程协作" },
  { slug: "cs.DC", name: "分布式计算", group: "计算机科学", description: "共识、调度与云基础设施" },
  { slug: "cs.CR", name: "密码学与安全", group: "计算机科学", description: "系统安全、隐私与密码协议" },
  { slug: "cs.HC", name: "人机交互", group: "计算机科学", description: "界面、协作与可用性研究" },
  { slug: "cs.RO", name: "机器人学", group: "计算机科学", description: "感知、控制与具身智能" },
  { slug: "cs.NE", name: "神经与进化计算", group: "计算机科学", description: "神经形态计算与演化算法" },
  { slug: "stat.ML", name: "统计机器学习", group: "统计", description: "统计推断与学习理论" },
  { slug: "stat.ME", name: "统计方法", group: "统计", description: "实验设计、因果推断与稳健统计" },
  { slug: "math.OC", name: "优化与控制", group: "数学", description: "凸优化、随机优化与控制论" },
  { slug: "math.PR", name: "概率论", group: "数学", description: "随机过程、极限理论与集中不等式" },
  { slug: "physics.comp-ph", name: "计算物理", group: "物理", description: "数值模拟与科学计算" },
  { slug: "q-bio.NC", name: "神经科学", group: "定量生物", description: "神经编码、脑网络与认知建模" },
  { slug: "eess.SP", name: "信号处理", group: "电子工程", description: "采样、估计与阵列信号处理" },
  { slug: "econ.EM", name: "计量经济学", group: "经济学", description: "因果识别与经济建模" },
  { slug: "cs.MA", name: "多智能体系统", group: "计算机科学", description: "协作、博弈与群体智能" },
];

export const CATEGORY_MAP = new Map(CATEGORIES.map((c) => [c.slug, c]));

export function categoryName(slug: string): string {
  return CATEGORY_MAP.get(slug)?.name ?? slug;
}

export const SORT_OPTIONS = {
  latest: "最新发布",
  hot: "最高评分",
  active: "最近活跃",
  discussed: "讨论最多",
} as const;

export type SortKey = keyof typeof SORT_OPTIONS;

export function isSortKey(value: string | undefined): value is SortKey {
  return !!value && value in SORT_OPTIONS;
}

export const LICENSE_LABELS: Record<string, string> = {
  "CC-BY-4.0": "CC BY 4.0",
  "CC-BY-SA-4.0": "CC BY-SA 4.0",
  "CC-BY-NC-4.0": "CC BY-NC 4.0",
  "CC0-1.0": "CC0 1.0",
  MIT: "MIT",
  "Apache-2.0": "Apache 2.0",
};

export const DISCUSSION_LABEL = "paper-discussion";
