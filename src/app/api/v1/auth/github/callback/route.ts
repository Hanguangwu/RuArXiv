import { NextResponse } from "next/server";
import {
  clearOAuthState,
  createSession,
  githubConfigured,
  readOAuthState,
  signInWithGitHub,
} from "@/lib/auth";
import { exchangeCode, fetchGitHubProfile } from "@/lib/github";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const base = new URL(request.url).origin;
  if (!githubConfigured()) {
    return NextResponse.redirect(new URL("/login?error=github_not_configured", base));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const saved = await readOAuthState();
  await clearOAuthState();

  if (!code || !state || !saved || saved.state !== state) {
    return NextResponse.redirect(new URL("/login?error=invalid_state", base));
  }

  try {
    const redirectUri =
      process.env.GITHUB_REDIRECT_URI ?? new URL("/api/v1/auth/github/callback", base).toString();
    const accessToken = await exchangeCode({ code, verifier: saved.verifier, redirectUri });
    const profile = await fetchGitHubProfile(accessToken);
    const outcome = await signInWithGitHub(profile);

    if (!outcome.ok) {
      return NextResponse.redirect(
        new URL(`/login?error=${outcome.reason}`, base),
      );
    }

    await createSession(outcome.user);
    const next = saved.next?.startsWith("/") ? saved.next : "/";
    return NextResponse.redirect(new URL(next, base));
  } catch (error) {
    console.error("[auth] github callback failed", error);
    return NextResponse.redirect(new URL("/login?error=oauth_failed", base));
  }
}
