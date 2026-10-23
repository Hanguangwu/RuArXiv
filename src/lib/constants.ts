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
  // ==================== 人文与思想 ====================
  { slug: "humanities.philosophy", name: "哲学", group: "人文", description: "形而上学、认识论、伦理学、逻辑与科学哲学" },
  { slug: "humanities.ruism", name: "儒学", group: "人文", description: "儒家经典、经学、伦理、政治思想与儒学史" },
  { slug: "humanities.religion", name: "宗教学", group: "人文", description: "宗教传统、信仰体系、神学与宗教比较" },
  { slug: "humanities.history", name: "历史学", group: "人文", description: "政治、社会、经济、文化与全球史研究" },
  { slug: "humanities.archaeology", name: "考古学", group: "人文", description: "物质遗存、古代社会、文明起源与历史重建" },
  { slug: "humanities.literature", name: "文学", group: "人文", description: "文学创作、文本批评、文学史与比较文学" },
  { slug: "humanities.linguistics", name: "语言学", group: "人文", description: "语音、语法、语义、语用、语言演化与文字" },
  { slug: "humanities.classics", name: "古典学", group: "人文", description: "古典文献、校勘、训诂、版本与古代文明" },
  { slug: "humanities.art", name: "艺术学", group: "人文", description: "美学、艺术史、绘画、音乐、戏剧与设计理论" },
  { slug: "humanities.culture", name: "文化研究", group: "人文", description: "文化传统、符号、传播、身份与跨文化交流" },
  { slug: "humanities.media", name: "传媒与传播", group: "人文", description: "新闻、传播理论、媒介研究与数字文化" },

  // ==================== 社会科学 ====================
  { slug: "social.politics", name: "政治学", group: "社会科学", description: "政治理论、国家治理、公共政策与国际关系" },
  { slug: "social.economics", name: "经济学", group: "社会科学", description: "微观、宏观、发展、劳动、产业与公共经济学" },
  { slug: "social.sociology", name: "社会学", group: "社会科学", description: "社会结构、阶层、组织、社会网络与社会变迁" },
  { slug: "social.psychology", name: "心理学", group: "社会科学", description: "认知、行为、人格、发展与社会心理" },
  { slug: "social.anthropology", name: "人类学", group: "社会科学", description: "文化、民族、社会组织与人类演化" },
  { slug: "social.geography", name: "人文地理学", group: "社会科学", description: "人口、城市、区域、空间分布与人地关系" },
  { slug: "social.education", name: "教育学", group: "社会科学", description: "学习理论、课程、教学、教育政策与评估" },
  { slug: "social.law", name: "法学", group: "社会科学", description: "宪法、民商法、刑法、国际法与法理学" },
  { slug: "social.law_governance", name: "公共管理", group: "社会科学", description: "公共行政、制度设计、政策执行与政府治理" },
  { slug: "social.international", name: "国际关系", group: "社会科学", description: "国际政治、外交、安全、全球治理与地缘战略" },
  { slug: "social.demography", name: "人口学", group: "社会科学", description: "人口结构、迁移、生育、老龄化与人口预测" },
  { slug: "social.criminology", name: "犯罪学", group: "社会科学", description: "犯罪成因、刑事司法、社会控制与犯罪预防" },
  { slug: "social.management", name: "管理学", group: "社会科学", description: "组织行为、战略、运营、人力资源与创新管理" },
  { slug: "social.communication", name: "社会网络与行为", group: "社会科学", description: "群体行为、意见传播、社会计算与集体行动" },

  // ==================== 数学与统计 ====================
  { slug: "math.pure", name: "纯数学", group: "数学与统计", description: "代数、几何、拓扑、数论与数学分析" },
  { slug: "math.applied", name: "应用数学", group: "数学与统计", description: "微分方程、数值分析、数学建模与科学计算" },
  { slug: "math.logic", name: "数理逻辑", group: "数学与统计", description: "集合论、模型论、证明论与可计算性理论" },
  { slug: "math.probability", name: "概率论", group: "数学与统计", description: "随机变量、随机过程、概率模型与极限定理" },
  { slug: "math.statistics", name: "统计学", group: "数学与统计", description: "统计推断、实验设计、贝叶斯方法与因果推断" },
  { slug: "math.optimization", name: "优化与运筹学", group: "数学与统计", description: "数学规划、组合优化、决策理论与资源调度" },
  { slug: "math.systems", name: "控制论与系统科学", group: "数学与统计", description: "动态系统、反馈控制、复杂系统与系统建模" },

  // ==================== 自然科学 ====================
  { slug: "science.physics", name: "物理学", group: "自然科学", description: "经典物理、量子物理、相对论、凝聚态与粒子物理" },
  { slug: "science.chemistry", name: "化学", group: "自然科学", description: "有机、无机、物理、分析与理论化学" },
  { slug: "science.biology", name: "生物学", group: "自然科学", description: "细胞、分子、遗传、进化、生态与系统生物学" },
  { slug: "science.astronomy", name: "天文学", group: "自然科学", description: "天体物理、恒星、星系、宇宙学与行星科学" },
  { slug: "science.earth", name: "地球科学", group: "自然科学", description: "地质、地球物理、地球化学与地球演化" },
  { slug: "science.climate", name: "大气与气候科学", group: "自然科学", description: "气象、气候变化、大气过程与气候建模" },
  { slug: "science.ocean", name: "海洋科学", group: "自然科学", description: "海洋物理、海洋化学、海洋生态与海洋环流" },
  { slug: "science.ecology", name: "生态与环境科学", group: "自然科学", description: "生态系统、生物多样性、污染治理与环境变化" },
  { slug: "science.paleontology", name: "古生物学", group: "自然科学", description: "化石、生物演化、古环境与生命史" },

  // ==================== 生命与健康科学 ====================
  { slug: "health.medicine", name: "医学", group: "生命与健康", description: "临床医学、疾病诊断、治疗与医学研究" },
  { slug: "health.public", name: "公共卫生", group: "生命与健康", description: "流行病学、卫生政策、疾病预防与健康促进" },
  { slug: "health.neuroscience", name: "神经科学", group: "生命与健康", description: "神经系统、脑功能、神经计算与认知机制" },
  { slug: "health.pharmacy", name: "药学", group: "生命与健康", description: "药物研发、药理、药剂、药代动力学与药物安全" },
  { slug: "health.nutrition", name: "营养学", group: "生命与健康", description: "营养代谢、膳食、食品与人体健康" },
  { slug: "health.nursing", name: "护理与康复", group: "生命与健康", description: "护理实践、康复治疗、健康照护与功能恢复" },
  { slug: "health.biology", name: "生物医学", group: "生命与健康", description: "疾病机制、分子医学、转化医学与生物技术" },
  { slug: "health.veterinary", name: "兽医学", group: "生命与健康", description: "动物疾病、兽医临床、动物健康与人畜共患病" },

  // ==================== 计算机科学与信息技术 ====================
  { slug: "cs.AI", name: "人工智能", group: "计算机科学", description: "智能体、知识表示、推理、规划与通用智能" },
  { slug: "cs.LG", name: "机器学习", group: "计算机科学", description: "深度学习、强化学习、表示学习与学习理论" },
  { slug: "cs.CL", name: "语言智能", group: "计算机科学", description: "自然语言处理、语言模型、机器翻译与语音语言交互" },
  { slug: "cs.CV", name: "视觉与多模态计算", group: "计算机科学", description: "计算机视觉、图像生成、视频理解与多模态学习" },
  { slug: "cs.IR", name: "信息检索与推荐", group: "计算机科学", description: "搜索引擎、信息抽取、推荐系统与检索增强生成" },
  { slug: "cs.KR", name: "知识与推理系统", group: "计算机科学", description: "知识图谱、语义表示、逻辑推理与知识工程" },
  { slug: "cs.RO", name: "机器人与具身智能", group: "计算机科学", description: "机器人感知、运动规划、控制与具身学习" },
  { slug: "cs.HCI", name: "人机交互", group: "计算机科学", description: "交互设计、可用性、协作系统与人本计算" },
  { slug: "cs.SE", name: "软件工程", group: "计算机科学", description: "软件设计、程序分析、测试、维护与开发工具" },
  { slug: "cs.SYS", name: "计算机系统", group: "计算机科学", description: "操作系统、体系结构、编译器、存储与高性能计算" },
  { slug: "cs.NET", name: "网络与分布式系统", group: "计算机科学", description: "计算机网络、云计算、分布式计算与边缘系统" },
  { slug: "cs.CR", name: "安全与隐私", group: "计算机科学", description: "密码学、系统安全、隐私保护与可信计算" },
  { slug: "cs.DB", name: "数据库与数据管理", group: "计算机科学", description: "数据库系统、数据工程、数据治理与数据分析基础设施" },
  { slug: "cs.TCS", name: "理论计算机科学", group: "计算机科学", description: "算法、计算复杂性、自动机、形式化方法与可计算性" },
  { slug: "cs.MA", name: "多智能体与群体计算", group: "计算机科学", description: "多智能体协作、博弈、机制设计与群体智能" },
  { slug: "cs.GR", name: "图形学与可视化", group: "计算机科学", description: "计算机图形学、三维重建、科学可视化与虚拟现实" },
  { slug: "cs.QUANT", name: "量子计算", group: "计算机科学", description: "量子算法、量子信息、量子编程与量子复杂性" },

  // ==================== 工程与技术 ====================
  { slug: "engineering.electrical", name: "电子与电气工程", group: "工程技术", description: "电路、电子器件、电力系统与电气自动化" },
  { slug: "engineering.communication", name: "通信与信号处理", group: "工程技术", description: "无线通信、信号分析、编码、雷达与传感网络" },
  { slug: "engineering.mechanical", name: "机械工程", group: "工程技术", description: "机械设计、制造、动力学、机电一体化与机器人" },
  { slug: "engineering.automation", name: "自动化与控制工程", group: "工程技术", description: "工业控制、智能制造、控制系统与过程自动化" },
  { slug: "engineering.materials", name: "材料科学与工程", group: "工程技术", description: "金属、陶瓷、高分子、复合材料与材料性能" },
  { slug: "engineering.civil", name: "土木与建筑工程", group: "工程技术", description: "结构、岩土、建筑技术、施工与基础设施" },
  { slug: "engineering.chemical", name: "化学工程", group: "工程技术", description: "化工过程、反应工程、分离技术与过程系统" },
  { slug: "engineering.energy", name: "能源工程", group: "工程技术", description: "新能源、储能、电力转换、核能与能源系统" },
  { slug: "engineering.environmental", name: "环境工程", group: "工程技术", description: "污染控制、废弃物处理、水处理与环境修复" },
  { slug: "engineering.aerospace", name: "航空航天工程", group: "工程技术", description: "飞行器、推进、轨道力学、航天器与航空系统" },
  { slug: "engineering.transport", name: "交通工程", group: "工程技术", description: "道路、铁路、航空运输、交通流与智能交通" },
  { slug: "engineering.biomedical", name: "生物医学工程", group: "工程技术", description: "医疗器械、生物传感、医学成像与组织工程" },
  { slug: "engineering.industrial", name: "工业与系统工程", group: "工程技术", description: "生产系统、质量管理、供应链与运作优化" },
  { slug: "engineering.agriculture", name: "农业工程", group: "工程技术", description: "农业机械、灌溉、设施农业与精准农业" },

  // ==================== 农业与食品 ====================
  { slug: "agriculture.crop", name: "农学", group: "农业与食品", description: "作物科学、育种、土壤、植物保护与农业生产" },
  { slug: "agriculture.forestry", name: "林学", group: "农业与食品", description: "森林生态、林木培育、森林资源与保护" },
  { slug: "agriculture.animal", name: "畜牧与动物科学", group: "农业与食品", description: "动物遗传、营养、繁育与畜牧生产" },
  { slug: "agriculture.food", name: "食品科学", group: "农业与食品", description: "食品加工、食品安全、食品化学与感官科学" },
  { slug: "agriculture.fisheries", name: "水产科学", group: "农业与食品", description: "水产养殖、渔业资源、水生生物与渔业管理" },

  // ==================== 商业与金融 ====================
  { slug: "business.finance", name: "金融学", group: "商业与金融", description: "资产定价、投资、银行、风险管理与金融市场" },
  { slug: "business.accounting", name: "会计与审计", group: "商业与金融", description: "财务报告、管理会计、审计、税务与公司治理" },
  { slug: "business.marketing", name: "市场营销", group: "商业与金融", description: "消费者行为、品牌、广告、定价与市场研究" },
  { slug: "business.innovation", name: "创业与创新", group: "商业与金融", description: "创业管理、技术转移、商业模式与创新政策" },
  { slug: "business.trade", name: "国际贸易", group: "商业与金融", description: "贸易理论、全球价值链、跨国经营与贸易政策" },
  { slug: "business.logistics", name: "物流与供应链", group: "商业与金融", description: "物流网络、库存、采购、供应链风险与优化" },

  // ==================== 建筑、城市与空间 ====================
  { slug: "design.architecture", name: "建筑学", group: "建筑与空间", description: "建筑设计、建筑史、空间组织与建筑理论" },
  { slug: "design.urban", name: "城乡规划", group: "建筑与空间", description: "城市设计、土地利用、区域规划与城市治理" },
  { slug: "design.landscape", name: "景观设计", group: "建筑与空间", description: "景观规划、公共空间、生态设计与园林" },
  { slug: "design.interaction", name: "设计学", group: "建筑与空间", description: "工业设计、视觉传达、交互设计与服务设计" },

  // ==================== 教育、语言与学习 ====================
  { slug: "education.curriculum", name: "课程与教学", group: "教育与学习", description: "课程开发、教学设计、学习评价与教学方法" },
  { slug: "education.technology", name: "教育技术", group: "教育与学习", description: "数字学习、智能教育、学习分析与教育平台" },
  { slug: "education.comparative", name: "比较教育", group: "教育与学习", description: "教育制度、国际比较、教育公平与教育改革" },

  // ==================== 跨学科与新兴领域 ====================
  { slug: "interdisciplinary.cogsci", name: "认知科学", group: "交叉学科", description: "认知心理、神经科学、语言、计算与心智哲学" },
  { slug: "interdisciplinary.complexity", name: "复杂性科学", group: "交叉学科", description: "复杂网络、涌现、自组织、非线性动力学与群体行为" },
  { slug: "interdisciplinary.digitalhumanities", name: "数字人文", group: "交叉学科", description: "数字文献、计算历史、文化数据与人文信息学" },
  { slug: "interdisciplinary.computational_social", name: "计算社会科学", group: "交叉学科", description: "社会大数据、因果分析、社会模拟与计算建模" },
  { slug: "interdisciplinary.science", name: "科学技术研究", group: "交叉学科", description: "科学史、技术史、科学哲学与科技社会影响" },
  { slug: "interdisciplinary.sustainability", name: "可持续发展", group: "交叉学科", description: "可持续治理、绿色技术、资源管理与社会生态转型" },
  { slug: "interdisciplinary.bioinformatics", name: "生物信息学", group: "交叉学科", description: "计算生物学、基因组学、生物数据与分子建模" },
  { slug: "interdisciplinary.digitalhealth", name: "数字健康", group: "交叉学科", description: "医学信息学、健康数据、医疗人工智能与数字医疗" },
  { slug: "interdisciplinary.science_communication", name: "科学传播", group: "交叉学科", description: "科学普及、公众理解、风险沟通与科技传播" },
  { slug: "interdisciplinary.ethics", name: "科技伦理与治理", group: "交叉学科", description: "人工智能伦理、科研诚信、技术治理与社会责任" },
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
