import "server-only";

import { createHmac, createSign, timingSafeEqual } from "node:crypto";
import { Octokit } from "@octokit/rest";

/**
 * GitHub integration adapter.
 *
 * Three capabilities are needed by the website:
 *   1. OAuth user sign-in (identity only, no long-lived user token stored)
 *   2. Content repository reads for the sync worker
 *   3. Writes: discussion comments and paper pull requests
 *
 * Demo mode keeps every code path working without credentials: callers check
 * `githubConfigured()` / `contentRepoConfigured()` before using the network.
 */

const API_VERSION = "2022-11-28";

export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

export function appConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_APP_ID &&
      process.env.GITHUB_APP_PRIVATE_KEY &&
      process.env.GITHUB_INSTALLATION_ID,
  );
}

export function contentRepoConfigured(): boolean {
  return Boolean(process.env.GITHUB_CONTENT_REPO && (appConfigured() || process.env.GITHUB_TOKEN));
}

export function parseRepo(): { owner: string; repo: string } | null {
  const value = process.env.GITHUB_CONTENT_REPO;
  if (!value || !value.includes("/")) return null;
  const [owner, repo] = value.split("/");
  return { owner, repo };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/** GitHub App installation tokens live for one hour; cache with a safety margin. */
async function installationToken(): Promise<string> {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (cachedToken && cachedToken.expiresAt - Date.now() > 5 * 60 * 1000) {
    return cachedToken.token;
  }
  const appId = process.env.GITHUB_APP_ID;
  const installationId = process.env.GITHUB_INSTALLATION_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!appId || !installationId || !privateKey) {
    throw new Error("GitHub App 未配置：缺少 GITHUB_APP_ID / PRIVATE_KEY / INSTALLATION_ID");
  }

  // GitHub App JWT (RS256), valid for at most 10 minutes.
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }),
  ).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(privateKey).toString("base64url");

  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${header}.${payload}.${signature}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
      },
    },
  );
  if (!response.ok) {
    throw new Error(`获取 installation token 失败: ${response.status}`);
  }
  const result = (await response.json()) as { token: string; expires_at: string };
  cachedToken = {
    token: result.token,
    expiresAt: new Date(result.expires_at).getTime(),
  };
  return result.token;
}

export async function octokit(): Promise<Octokit> {
  return new Octokit({
    auth: await installationToken(),
    userAgent: "ruarxiv/0.1",
    request: { headers: { "X-GitHub-Api-Version": API_VERSION } },
  });
}

/* -------------------------------------------------------------------------- */
/* OAuth                                                                       */
/* -------------------------------------------------------------------------- */

export function authorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    scope: "read:user user:email",
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    allow_signup: "true",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCode(input: {
  code: string;
  verifier: string;
  redirectUri: string;
}) {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.verifier,
    }),
  });
  if (!response.ok) {
    throw new Error(`GitHub token exchange failed: ${response.status}`);
  }
  const payload = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!payload.access_token) {
    throw new Error(payload.error_description || payload.error || "GitHub 未返回 access_token");
  }
  return payload.access_token;
}

export async function fetchGitHubProfile(accessToken: string) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
  };
  const [userRes, emailRes] = await Promise.all([
    fetch("https://api.github.com/user", { headers }),
    fetch("https://api.github.com/user/emails", { headers }),
  ]);
  if (!userRes.ok) throw new Error(`读取 GitHub 用户失败: ${userRes.status}`);
  const user = (await userRes.json()) as {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string;
    bio: string | null;
    email: string | null;
  };
  let primaryEmail: string | null = user.email;
  if (emailRes.ok) {
    const emails = (await emailRes.json()) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;
    primaryEmail = emails.find((e) => e.primary && e.verified)?.email ?? primaryEmail;
  }
  return { ...user, email: primaryEmail };
}

/* -------------------------------------------------------------------------- */
/* Webhooks                                                                    */
/* -------------------------------------------------------------------------- */

export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* -------------------------------------------------------------------------- */
/* Discussion writes                                                           */
/* -------------------------------------------------------------------------- */

export async function createIssueComment(issueNumber: number, body: string) {
  const repo = parseRepo();
  if (!repo || !contentRepoConfigured()) {
    throw new Error("内容仓库未配置，无法写入 GitHub Issue");
  }
  const client = await octokit();
  const response = await client.rest.issues.createComment({
    owner: repo.owner,
    repo: repo.repo,
    issue_number: issueNumber,
    body,
  });
  return response.data;
}

/* -------------------------------------------------------------------------- */
/* Paper submission (branch + pull request)                                    */
/* -------------------------------------------------------------------------- */

export type PaperFile = { path: string; content: string };

/**
 * Create one commit on a new branch and open a pull request. The site never
 * writes to the default branch directly; GitHub Actions validates the PR.
 */
export async function createPaperPullRequest(input: {
  branch: string;
  files: PaperFile[];
  title: string;
  body: string;
  baseBranch?: string;
}): Promise<{ number: number; url: string }> {
  const repo = parseRepo();
  if (!repo || !contentRepoConfigured()) {
    throw new Error("内容仓库未配置，无法创建 PR");
  }
  const client = await octokit();
  const base = input.baseBranch || process.env.GITHUB_CONTENT_BRANCH || "main";

  const { data: baseRef } = await client.rest.git.getRef({
    owner: repo.owner,
    repo: repo.repo,
    ref: `heads/${base}`,
  });
  const baseSha = baseRef.object.sha;

  const { data: baseCommit } = await client.rest.git.getCommit({
    owner: repo.owner,
    repo: repo.repo,
    commit_sha: baseSha,
  });

  const tree = await Promise.all(
    input.files.map(async (file) => {
      const { data: blob } = await client.rest.git.createBlob({
        owner: repo.owner,
        repo: repo.repo,
        content: Buffer.from(file.content).toString("base64"),
        encoding: "base64",
      });
      return {
        path: file.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.sha,
      };
    }),
  );

  const { data: newTree } = await client.rest.git.createTree({
    owner: repo.owner,
    repo: repo.repo,
    base_tree: baseCommit.tree.sha,
    tree,
  });

  const { data: commit } = await client.rest.git.createCommit({
    owner: repo.owner,
    repo: repo.repo,
    message: `paper: ${input.title}`,
    tree: newTree.sha,
    parents: [baseSha],
  });

  await client.rest.git.createRef({
    owner: repo.owner,
    repo: repo.repo,
    ref: `refs/heads/${input.branch}`,
    sha: commit.sha,
  });

  const { data: pr } = await client.rest.pulls.create({
    owner: repo.owner,
    repo: repo.repo,
    title: input.title,
    head: input.branch,
    base,
    body: input.body,
  });

  return { number: pr.number, url: pr.html_url };
}

/* -------------------------------------------------------------------------- */
/* Repository reads for the sync worker                                        */
/* -------------------------------------------------------------------------- */

export async function fetchRepoTree(branch = process.env.GITHUB_CONTENT_BRANCH || "main") {
  const repo = parseRepo();
  if (!repo) throw new Error("GITHUB_CONTENT_REPO 未配置");
  const client = await octokit();
  const { data } = await client.rest.git.getTree({
    owner: repo.owner,
    repo: repo.repo,
    tree_sha: branch,
    recursive: "true",
  });
  return data.tree.filter((node) => node.type === "blob" && node.path);
}

export async function fetchFile(path: string, branch = process.env.GITHUB_CONTENT_BRANCH || "main") {
  const repo = parseRepo();
  if (!repo) throw new Error("GITHUB_CONTENT_REPO 未配置");
  const client = await octokit();
  const { data } = await client.rest.repos.getContent({
    owner: repo.owner,
    repo: repo.repo,
    path,
    ref: branch,
  });
  if (Array.isArray(data) || data.type !== "file") {
    throw new Error(`${path} 不是文件`);
  }
  return Buffer.from(data.content, "base64").toString("utf8");
}

export async function fetchIssueDiscussion(issueNumber: number) {
  const repo = parseRepo();
  if (!repo) throw new Error("GITHUB_CONTENT_REPO 未配置");
  const client = await octokit();
  const [{ data: issue }, comments] = await Promise.all([
    client.rest.issues.get({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: issueNumber,
    }),
    client.paginate(client.rest.issues.listComments, {
      owner: repo.owner,
      repo: repo.repo,
      issue_number: issueNumber,
      per_page: 100,
    }),
  ]);

  return {
    issueNumber,
    issueUrl: issue.html_url,
    comments: comments.map((comment) => ({
      id: String(comment.id),
      author: comment.user?.login ?? "ghost",
      body: comment.body ?? "",
      createdAt: comment.created_at,
      reactions: {
        ...(comment.reactions && comment.reactions["+1"] ? { "+1": comment.reactions["+1"] } : {}),
        ...(comment.reactions && comment.reactions.heart ? { heart: comment.reactions.heart } : {}),
        ...(comment.reactions && comment.reactions.rocket ? { rocket: comment.reactions.rocket } : {}),
      },
    })),
  };
}
