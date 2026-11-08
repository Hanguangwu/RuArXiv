import { CATEGORIES, LICENSE_LABELS } from "@/lib/constants";

/**
 * Fields shared by `/submit` and `/papers/[id]/edit`. A server component with
 * uncontrolled inputs, so both pages keep working without client JS.
 */

export type PaperFormDefaults = {
  title?: string;
  abstract?: string;
  authors?: string;
  body?: string;
  categories?: string[];
  keywords?: string[];
  license?: string;
  language?: string;
  sourceUrl?: string;
};

export function PaperFields({ defaults = {} }: { defaults?: PaperFormDefaults }) {
  // Derive groups per render instead of module scope so adding categories in
  // constants.ts is reflected without restarting the server process.
  const groups = Array.from(new Set(CATEGORIES.map((category) => category.group)));

  return (
    <>
      <div>
        <label htmlFor="title" className="mb-1.5 block text-[0.8rem] font-medium">
          标题 <span className="text-[var(--color-accent)]">*</span>
        </label>
        <input
          id="title"
          name="title"
          required
          minLength={4}
          maxLength={240}
          defaultValue={defaults.title}
          className="field"
          placeholder="清晰、具体，避免使用“初探”“浅谈”"
        />
      </div>

      <div>
        <label htmlFor="abstract" className="mb-1.5 block text-[0.8rem] font-medium">
          摘要
        </label>
        <textarea
          id="abstract"
          name="abstract"
          rows={4}
          maxLength={6000}
          defaultValue={defaults.abstract}
          className="field"
          placeholder="问题、方法、主要结果与限制。留空时从正文的「## 摘要」自动提取。"
        />
      </div>

      <div>
        <label htmlFor="authors" className="mb-1.5 block text-[0.8rem] font-medium">
          作者 <span className="text-[var(--color-accent)]">*</span>
        </label>
        <textarea
          id="authors"
          name="authors"
          required
          rows={3}
          defaultValue={defaults.authors}
          className="field font-mono text-[0.8rem]"
          placeholder={"林小宇 | linxiaoyu | 清华大学\nSofia Keller | sofia-k | ETH Zürich\n青阳 | 天启大学"}
        />
        <p className="mt-1 text-[0.68rem] text-[var(--color-ink-faint)]">
          每行一位作者，格式：姓名 | GitHub 用户名（可选） | 单位（可选）。只有姓名和单位时写成
          「姓名 | 单位」；GitHub 用户名只能包含字母、数字和连字符，不确定就留空。
        </p>
      </div>

      <fieldset>
        <legend className="mb-2 text-[0.8rem] font-medium">
          分类 <span className="text-[var(--color-accent)]">*</span>
        </legend>
        <div className="space-y-3 border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-3.5">
          {groups.map((group) => (
            <div key={group}>
              <p className="mb-1.5 text-[0.66rem] uppercase tracking-wider text-[var(--color-ink-faint)]">
                {group}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {CATEGORIES.filter((category) => category.group === group).map((category) => (
                  <label key={category.slug} className="flex items-center gap-1.5 text-[0.76rem]">
                    <input
                      type="checkbox"
                      name="categories"
                      value={category.slug}
                      defaultChecked={defaults.categories?.includes(category.slug)}
                      className="h-3.5 w-3.5 accent-[var(--color-moss)]"
                    />
                    <span className="mono text-[0.7rem] text-[var(--color-ink-faint)]">{category.slug}</span>
                    {category.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="keywords" className="mb-1.5 block text-[0.8rem] font-medium">
            关键词
          </label>
          <input
            id="keywords"
            name="keywords"
            defaultValue={defaults.keywords?.join(", ")}
            className="field"
            placeholder="retrieval, evaluation, agents"
          />
          <p className="mt-1 text-[0.68rem] text-[var(--color-ink-faint)]">
            中英文逗号分隔，最多 20 个。
          </p>
        </div>
        <div>
          <label htmlFor="sourceUrl" className="mb-1.5 block text-[0.8rem] font-medium">
            原始来源
          </label>
          <input
            id="sourceUrl"
            name="sourceUrl"
            type="url"
            defaultValue={defaults.sourceUrl}
            className="field"
            placeholder="https://arxiv.org/abs/..."
          />
        </div>
        <div>
          <label htmlFor="license" className="mb-1.5 block text-[0.8rem] font-medium">
            许可协议
          </label>
          <select
            id="license"
            name="license"
            className="field"
            defaultValue={defaults.license ?? "CC-BY-4.0"}
          >
            {Object.entries(LICENSE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="language" className="mb-1.5 block text-[0.8rem] font-medium">
            语言
          </label>
          <select
            id="language"
            name="language"
            className="field"
            defaultValue={defaults.language ?? "zh-CN"}
          >
            <option value="zh-CN">中文</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="body" className="mb-1.5 block text-[0.8rem] font-medium">
          正文（Markdown） <span className="text-[var(--color-accent)]">*</span>
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={18}
          defaultValue={defaults.body}
          className="field font-mono text-[0.78rem] leading-relaxed"
          placeholder={"## 摘要\n\n……\n\n## 1 引言\n\n……\n\n## 2 相关工作\n\n……\n\n## 3 方法\n\n……\n\n## 4 实验\n\n| 方法 | 指标 |\n|---|---|\n| ... | ... |\n\n## 5 讨论\n\n……\n\n## 参考文献\n\n1. ..."}
        />
        <p className="mt-1 text-[0.68rem] text-[var(--color-ink-faint)]">
          支持 GFM 表格、代码块与 LaTeX 公式（$...$ / $$...$$）。禁止 HTML 脚本与 javascript: 链接。
        </p>
      </div>
    </>
  );
}
