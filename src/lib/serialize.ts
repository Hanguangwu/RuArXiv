import { GITHUB_LOGIN_RE, repairAuthorMetadata } from "./authors";

export type PaperAuthor = {
  name: string;
  login?: string;
  orcid?: string;
  affiliation?: string;
};

export function parseJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

export function parseReactions(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Record<string, number> = {};
    for (const [key, count] of Object.entries(value as Record<string, unknown>)) {
      if (typeof count === "number" && count > 0) out[key] = count;
    }
    return out;
  } catch {
    return {};
  }
}

export function parseAuthors(raw: string | null | undefined): PaperAuthor[] {
  return parseJsonArray<Record<string, unknown>>(raw)
    .map((author) => repairAuthorMetadata(author) as PaperAuthor)
    .filter((author) => author && typeof author.name === "string" && author.name.length > 0);
}

export function authorLogins(authors: PaperAuthor[]): string {
  return authors
    .map((author) => author.login?.trim().toLowerCase())
    .filter((login): login is string => !!login && GITHUB_LOGIN_RE.test(login))
    .join(",");
}

export function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return Array.from(trimmed).slice(0, 2).join("").toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
