import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { githubConfigured, authorizeUrl } from "@/lib/github";
import { randomToken, setOAuthState } from "@/lib/auth";

export const dynamic = "force-dynamic";

function redirectUri(request: Request): string {
  return (
    process.env.GITHUB_REDIRECT_URI ??
    new URL("/api/v1/auth/github/callback", new URL(request.url).origin).toString()
  );
}

export async function GET(request: Request) {
  if (!githubConfigured()) {
    return NextResponse.redirect(
      new URL("/login?error=github_not_configured", new URL(request.url).origin),
    );
  }

  const url = new URL(request.url);
  const next = url.searchParams.get("next") ?? "/";
  const state = randomToken();
  const verifier = randomToken();
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  await setOAuthState(state, verifier, next);

  return NextResponse.redirect(
    authorizeUrl({
      clientId: process.env.GITHUB_CLIENT_ID!,
      redirectUri: redirectUri(request),
      state,
      challenge,
    }),
  );
}
