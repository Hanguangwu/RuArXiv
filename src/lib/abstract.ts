/**
 * Plain-text abstract derivation.
 *
 * The submit form promises "留空时从正文的「## 摘要」自动提取", and the content
 * parser applies the same rule to papers synced from GitHub. Keeping one
 * implementation means the database, the detail page and the content repo can
 * never disagree about what the abstract is.
 */

const ABSTRACT_HEADING = /^#{1,6}[ \t]*(摘要|abstract)[ \t]*[:：]?[ \t]*$/i;
const ANY_HEADING = /^#{1,6}[ \t]+\S/;
const KEYWORDS_LINE = /^(?:\*\*)?(?:关键词|关键字|keywords?)(?:\*\*)?[ \t]*[:：]/i;

/** Strip Markdown syntax so the abstract reads well in lists and meta tags. */
export function markdownToPlainText(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>\n]+>/g, " ")
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "")
    .replace(/^[ \t]{0,3}(?:[-*+]|\d+[.)])[ \t]+/gm, "")
    .replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$/gm, " ")
    .replace(/[*_~#]+/g, "")
    .replace(/\|/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractAbstractSection(body: string): string | null {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const start = lines.findIndex((line) => ABSTRACT_HEADING.test(line.trim()));
  if (start === -1) return null;

  const collected: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (ANY_HEADING.test(trimmed)) break;
    if (/^-{3,}$/.test(trimmed)) break;
    if (KEYWORDS_LINE.test(trimmed)) break;
    collected.push(line);
  }
  return collected.join("\n").trim() || null;
}

function firstParagraphs(body: string): string {
  const paragraphs = body
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(
      (paragraph) =>
        paragraph.length > 0 &&
        !/^-{3,}$/.test(paragraph) &&
        !ANY_HEADING.test(paragraph),
    );
  if (paragraphs.length === 0) return body;
  return paragraphs.slice(0, 2).join("\n\n");
}

/**
 * Prefer an explicitly supplied abstract, then the `## 摘要` section, then the
 * opening paragraphs of the body. Never returns a heading like "摘要" as part
 * of the text.
 */
export function deriveAbstract(
  provided: string | null | undefined,
  body: string,
  maxLength = 600,
): string {
  const explicit = provided?.trim();
  const source = explicit
    ? explicit
    : (extractAbstractSection(body) ?? firstParagraphs(body));
  return markdownToPlainText(source).slice(0, maxLength).trim();
}
