import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "./db";
import { hasRole, type Role } from "./constants";

const COOKIE_NAME = "ruarxiv_session";
const OAUTH_COOKIE = "ruarxiv_oauth";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export type SessionPayload = {
  uid: string;
  githubUserId: string;
  login: string;
  iat: number;
  exp: number;
};

function secret(): string {
  return process.env.AUTH_SECRET || "ruarxiv-development-secret-change-me";
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function encode(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.uid || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createSession(user: {
  id: string;
  githubUserId: string;
  login: string;
}) {
  const now = Date.now();
  const token = encode({
    uid: user.id,
    githubUserId: user.githubUserId,
    login: user.login,
    iat: now,
    exp: now + SESSION_TTL_MS,
  });
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export const getCurrentUser = cache(async () => {
  const jar = await cookies();
  const payload = decode(jar.get(COOKIE_NAME)?.value);
  if (!payload) return null;
  const user = await prisma.user.findUnique({ where: { id: payload.uid } });
  if (!user || user.status !== "ACTIVE") return null;
  return user;
});

export async function requireUser(role: Role = "USER") {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasRole(user.role, role)) redirect("/login?error=forbidden");
  return user;
}

export async function isAdmin() {
  const user = await getCurrentUser();
  return !!user && hasRole(user.role, "MODERATOR");
}

/* -------------------------------------------------------------------------- */
/* OAuth state cookie                                                          */
/* -------------------------------------------------------------------------- */

export async function setOAuthState(state: string, verifier: string, next = "/") {
  const value = Buffer.from(
    JSON.stringify({ state, verifier, next, at: Date.now() }),
  ).toString("base64url");
  const jar = await cookies();
  jar.set(OAUTH_COOKIE, `${value}.${sign(value)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
}

export async function readOAuthState(): Promise<{ state: string; verifier: string; next: string } | null> {
  const jar = await cookies();
  const raw = jar.get(OAUTH_COOKIE)?.value;
  if (!raw) return null;
  const [value, signature] = raw.split(".");
  if (!value || !signature || sign(value) !== signature) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed.state !== "string" || typeof parsed.verifier !== "string") return null;
    return {
      state: parsed.state,
      verifier: parsed.verifier,
      next: typeof parsed.next === "string" ? parsed.next : "/",
    };
  } catch {
    return null;
  }
}

export async function clearOAuthState() {
  const jar = await cookies();
  jar.delete(OAUTH_COOKIE);
}

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/* -------------------------------------------------------------------------- */
/* Account lifecycle                                                           */
/* -------------------------------------------------------------------------- */

export type GitHubProfile = {
  id: number | string;
  login: string;
  name?: string | null;
  avatar_url?: string | null;
  email?: string | null;
  bio?: string | null;
};

export type SignInOutcome =
  | { ok: true; user: Awaited<ReturnType<typeof prisma.user.findUniqueOrThrow>> }
  | { ok: false; reason: "invite_required" | "suspended" };

/**
 * GitHub identity is keyed on the immutable numeric user id; `login` is only
 * a display handle and is allowed to change.
 */
export async function signInWithGitHub(profile: GitHubProfile): Promise<SignInOutcome> {
  const githubUserId = String(profile.id);
  const existing = await prisma.user.findUnique({ where: { githubUserId } });

  if (existing) {
    if (existing.status !== "ACTIVE") return { ok: false, reason: "suspended" };
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        login: profile.login,
        name: profile.name ?? existing.name,
        avatarUrl: profile.avatar_url ?? existing.avatarUrl,
        email: profile.email ?? existing.email,
        bio: profile.bio ?? existing.bio,
        lastLoginAt: new Date(),
      },
    });
    return { ok: true, user };
  }

  const invite = await prisma.invite.findFirst({
    where: {
      usedAt: null,
      expiresAt: { gt: new Date() },
      OR: [
        { email: profile.email ?? "__none__" },
        { email: profile.login },
        { code: profile.login },
      ],
    },
  });

  const isFirstUser = (await prisma.user.count()) === 0;
  const openSignup = process.env.ALLOW_OPEN_SIGNUP === "true";

  if (!invite && !isFirstUser && !openSignup) {
    return { ok: false, reason: "invite_required" };
  }

  const user = await prisma.user.create({
    data: {
      githubUserId,
      login: profile.login,
      name: profile.name ?? profile.login,
      avatarUrl: profile.avatar_url ?? null,
      email: profile.email ?? null,
      bio: profile.bio ?? null,
      role: isFirstUser ? "ADMIN" : "INVITED_USER",
      lastLoginAt: new Date(),
    },
  });

  if (invite) {
    await prisma.invite.update({
      where: { id: invite.id },
      data: { usedAt: new Date(), usedById: user.id },
    });
  }

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      actorLogin: user.login,
      action: "user.signed_up",
      targetType: "user",
      targetId: user.id,
      detailJson: JSON.stringify({ invite: invite?.code ?? null, firstUser: isFirstUser }),
    },
  });

  return { ok: true, user };
}

const DEMO_USERS = {
  reader: {
    githubUserId: "demo-reader",
    login: "wangzhe",
    name: "王哲",
    avatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4",
    bio: "分布式系统工程师，关注数据库与一致性。",
    affiliation: "某云厂商 · 基础设施",
    role: "USER",
  },
  author: {
    githubUserId: "demo-author",
    login: "linxiaoyu",
    name: "林小宇",
    avatarUrl: "https://avatars.githubusercontent.com/u/9919?v=4",
    bio: "NLP 方向博士生，研究检索增强生成与评测。",
    affiliation: "清华大学 · 计算机系",
    role: "AUTHOR",
  },
  admin: {
    githubUserId: "demo-admin",
    login: "admin",
    name: "何嘉",
    avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
    bio: "RuArXiv 维护者，负责内容审核与同步运维。",
    affiliation: "RuArXiv",
    role: "ADMIN",
  },
} as const;

export type DemoRole = keyof typeof DEMO_USERS;

export async function signInAsDemo(kind: DemoRole) {
  const preset = DEMO_USERS[kind] ?? DEMO_USERS.reader;
  const user = await prisma.user.upsert({
    where: { githubUserId: preset.githubUserId },
    create: { ...preset, email: `${preset.login}@example.org`, isDemo: true, lastLoginAt: new Date() },
    update: { lastLoginAt: new Date(), role: preset.role },
  });
  await createSession(user);
  return user;
}

export async function recordAudit(input: {
  actorId?: string | null;
  actorLogin?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  detail?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      actorLogin: input.actorLogin ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      detailJson: input.detail ? JSON.stringify(input.detail).slice(0, 4000) : null,
    },
  });
}

export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}
