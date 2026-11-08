/**
 * Author identity helpers shared by the submit form, the content parser and the
 * database read model.
 *
 * GitHub logins are constrained to 1–39 characters of `[a-zA-Z0-9-]`, cannot
 * start or end with a hyphen. RuArXiv only stores a `login` when it is
 * actually valid: a second column such as "天启大学" is an affiliation, and
 * treating it as a login is what made `reconcile` reject whole papers.
 */

export const GITHUB_LOGIN_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

export type AuthorDraft = {
  name: string;
  login?: string;
  affiliation?: string;
};

/** Lower-case and validate a GitHub login; returns `undefined` when invalid. */
export function normalizeLogin(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const candidate = raw.trim().replace(/^@+/, "").toLowerCase();
  if (!candidate || candidate.length > 39) return undefined;
  return GITHUB_LOGIN_RE.test(candidate) ? candidate : undefined;
}

/**
 * A two-column author line is ambiguous: `林小宇 | linxiaoyu` is a login,
 * `青阳 | 天启大学` is an affiliation. All-caps tokens (`MIT`, `ETH`) are
 * overwhelmingly institutions, so they are not treated as handles.
 */
export function looksLikeLoginToken(value: string): boolean {
  const raw = value.trim().replace(/^@+/, "");
  if (!normalizeLogin(raw)) return false;
  return /[a-z-]/.test(raw) || /\d/.test(raw);
}

export type AuthorParseResult =
  | { ok: true; authors: AuthorDraft[] }
  | { ok: false; error: string };

/**
 * Parse the textarea format used by `/submit`: one author per line,
 * `姓名 | GitHub 用户名（可选） | 单位（可选）`.
 */
export function parseAuthorText(input: string): AuthorParseResult {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return { ok: false, error: "请至少填写一位作者" };

  const authors: AuthorDraft[] = [];
  for (const [index, line] of lines.entries()) {
    const row = index + 1;
    const parts = line.split(/[|｜]/).map((part) => part.trim());
    const name = parts[0] ?? "";

    if (!name) return { ok: false, error: `第 ${row} 位作者缺少姓名` };
    if (name.length > 160) {
      return { ok: false, error: `第 ${row} 位作者的姓名超过 160 字` };
    }

    let login: string | undefined;
    let affiliation: string | undefined;

    if (parts.length === 2) {
      const second = parts[1] ?? "";
      if (second) {
        const candidate = normalizeLogin(second);
        if (candidate && looksLikeLoginToken(second)) login = candidate;
        else affiliation = second;
      }
    } else if (parts.length >= 3) {
      const rawLogin = parts[1] ?? "";
      if (rawLogin) {
        login = normalizeLogin(rawLogin);
        if (!login) {
          return {
            ok: false,
            error: `第 ${row} 位作者的 GitHub 用户名「${rawLogin}」不合法：只能包含字母、数字和连字符，不能以连字符开头或结尾，最长 39 位。如果它是单位，请写成「${name} |  | ${rawLogin}」或「${name} | ${rawLogin}」。`,
          };
        }
      }
      affiliation = parts.slice(2).filter(Boolean).join(" | ") || undefined;
    }

    if (affiliation && affiliation.length > 200) {
      return { ok: false, error: `第 ${row} 位作者的超过 200 字` };
    }

    authors.push({
      name,
      ...(login ? { login } : {}),
      ...(affiliation ? { affiliation } : {}),
    });
  }

  return { ok: true, authors };
}

/**
 * Repair one author object without losing what the author intended: an invalid
 * `login` (legacy content such as `login: "天启大学"`) becomes the affiliation
 * when no affiliation is present, and is otherwise dropped.
 */
export function repairAuthorMetadata(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const author = { ...(raw as Record<string, unknown>) };
  if (!("login" in author)) return author;

  const value = author.login;
  if (value == null || value === "") {
    delete author.login;
    return author;
  }

  const login = normalizeLogin(value);
  if (login) {
    author.login = login;
    return author;
  }

  const typed = String(value).trim().slice(0, 200);
  delete author.login;
  const affiliation =
    typeof author.affiliation === "string" ? author.affiliation.trim() : "";
  if (!affiliation && typed) author.affiliation = typed;
  return author;
}

/** Render authors back into the textarea format used by the edit form. */
export function formatAuthorLines(
  authors: Array<{ name: string; login?: string | null; affiliation?: string | null }>,
): string {
  return authors
    .map((author) => {
      if (author.affiliation) {
        return `${author.name} | ${author.login ?? ""} | ${author.affiliation}`;
      }
      return author.login ? `${author.name} | ${author.login}` : author.name;
    })
    .join("\n");
}
