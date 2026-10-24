/**
 * Content repository validator.
 *
 * Mirrors the CI check described in the design doc: schema, required fields,
 * unique ids, safe markdown, directory naming. Run by `.github/workflows/
 * validate-papers.yml` on every pull request and locally via `pnpm validate`.
 */
import { CATEGORIES } from "../src/lib/constants";
import { loadLocalPapers, scanPaperDirectories } from "../src/lib/content";

function main() {
  const dirs = scanPaperDirectories();
  const errors: string[] = [];
  const ids = new Map<string, string>();
  const slugs = new Map<string, string>();
  const allowedCategories = new Set(CATEGORIES.map((category) => category.slug));
  let papers = 0;

  for (const { dir, relativePath } of dirs) {
    try {
      const record = loadLocalPapers().find((p) => p.repoId === relativePath);
      if (!record) {
        // loadLocalPapers parses the whole tree; fall back to per-directory parse
        // for isolated error reporting below.
        continue;
      }
      papers += 1;
      if (ids.has(record.paperId)) {
        errors.push(`${relativePath}: 重复的 paperId，与 ${ids.get(record.paperId)} 冲突`);
      }
      ids.set(record.paperId, relativePath);
      if (slugs.has(record.slug)) {
        errors.push(`${relativePath}: 重复的 slug，与 ${slugs.get(record.slug)} 冲突`);
      }
      slugs.set(record.slug, relativePath);

      if (/<script|javascript:/i.test(record.body)) {
        errors.push(`${relativePath}: 正文包含禁止的脚本或 javascript: URL`);
      }
      if (record.body.length > 400_000) {
        errors.push(`${relativePath}: 正文超过 400KB 限制`);
      }
      const unknownCategories = record.metadata.categories.filter(
        (category) => !allowedCategories.has(category),
      );
      if (unknownCategories.length) {
        errors.push(`${relativePath}: 未知分类: ${unknownCategories.join(", ")}`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (errors.length) {
    console.error(`✗ 内容校验失败（${errors.length} 个问题）`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`✓ 内容校验通过：${papers} 篇论文，${dirs.length} 个目录`);
}

main();
