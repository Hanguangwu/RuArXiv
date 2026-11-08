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
/* Paper submission (shared branch + pull request)                             */
/* -------------------------------------------------------------------------- */

export type PaperFile = { path: string; content: string };

export type PaperSubmissionResult = {
  number: number;
  url: string;
  branch: string;
  /** `auto`: auto-merge queued, `merged`: merged now, `pending`: needs a human. */
  merge: "auto" | "merged" | "pending";
};

function isGitHubStatus(error: unknown, ...statuses: number[]): boolean {
  if (!error || typeof error !== "object" || !("status" in error)) return false;
  return statuses.includes((error as { status?: number }).status ?? 0);
}

async function githubGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const token = await installationToken();
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": API_VERSION,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };
  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.[0]?.message ?? `GitHub GraphQL ${response.status}`);
  }
  return payload.data as T;
}

async function branchHead(
  client: Octokit,
  repo: { owner: string; repo: string },
  branch: string,
): Promise<{ sha: string; treeSha: string } | null> {
  try {
    const { data: ref } = await client.rest.git.getRef({
      owner: repo.owner,
      repo: repo.repo,
      ref: `heads/${branch}`,
    });
    const { data: commit } = await client.rest.git.getCommit({
      owner: repo.owner,
      repo: repo.repo,
      commit_sha: ref.object.sha,
    });
    return { sha: ref.object.sha, treeSha: commit.tree.sha };
  } catch (error) {
    if (isGitHubStatus(error, 404)) return null;
    throw error;
  }
}

async function enableAutoMerge(nodeId: string): Promise<void> {
  await githubGraphql(
    `mutation EnableAutoMerge($id: ID!) {
      enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: MERGE }) {
        pullRequest { number }
      }
    }`,
    { id: nodeId },
  );
}

/**
 * Commit paper files to one shared submissions branch and keep a single pull
 * request from that branch into the default branch.
 *
 * Per-paper branches grew without bound. A shared branch keeps the branch count
 * at one and lets `main` stay protected: the app pushes to `submissions`, the
 * PR is auto-merged (or merged immediately when allowed), and required checks
 * still gate the merge.
 */
export async function submitPaperFiles(input: {
  files: PaperFile[];
  title: string;
  body: string;
  baseBranch?: string;
}): Promise<PaperSubmissionResult> {
  const repo = parseRepo();
  if (!repo || !contentRepoConfigured()) {
    throw new Error("内容仓库未配置，无法创建 PR");
  }
  const client = await octokit();
  const base = input.baseBranch || process.env.GITHUB_CONTENT_BRANCH || "main";
  const branch = process.env.GITHUB_SUBMISSIONS_BRANCH || "submissions";
  if (branch === base) {
    throw new Error("GITHUB_SUBMISSIONS_BRANCH 不能与 GITHUB_CONTENT_BRANCH 相同");
  }

  const blobs = await Promise.all(
    input.files.map(async (file) => {
      const { data } = await client.rest.git.createBlob({
        owner: repo.owner,
        repo: repo.repo,
        content: Buffer.from(file.content).toString("base64"),
        encoding: "base64",
      });
      return {
        path: file.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: data.sha,
      };
    }),
  );

  let head = await branchHead(client, repo, branch);
  if (!head) {
    const { data: baseRef } = await client.rest.git.getRef({
      owner: repo.owner,
      repo: repo.repo,
      ref: `heads/${base}`,
    });
    try {
      await client.rest.git.createRef({
        owner: repo.owner,
        repo: repo.repo,
        ref: `refs/heads/${branch}`,
        sha: baseRef.object.sha,
      });
    } catch (error) {
      // Another submission created the branch first; that is fine.
      if (!isGitHubStatus(error, 422, 409)) throw error;
    }
    head = await branchHead(client, repo, branch);
    if (!head) throw new Error(`无法创建投稿分支 ${branch}`);
  } else {
    // When every commit on the submissions branch is already in the base
    // branch, fast-forward it so the next batch starts from a clean base. This
    // keeps "require branches to be up to date" branch protection workable and
    // avoids the shared branch drifting behind.
    try {
      const { data: comparison } = await client.rest.repos.compareCommits({
        owner: repo.owner,
        repo: repo.repo,
        base: branch,
        head: base,
      });
      if (comparison.behind_by === 0) {
        const { data: baseRef } = await client.rest.git.getRef({
          owner: repo.owner,
          repo: repo.repo,
          ref: `heads/${base}`,
        });
        if (baseRef.object.sha !== head.sha) {
          await client.rest.git.updateRef({
            owner: repo.owner,
            repo: repo.repo,
            ref: `heads/${branch}`,
            sha: baseRef.object.sha,
            force: false,
          });
        }
      }
    } catch {
      // Non-fatal: the commit below still lands on the current head.
    }
  }

  let commitSha: string | null = null;
  for (let attempt = 0; attempt < 5 && !commitSha; attempt += 1) {
    const parent = await branchHead(client, repo, branch);
    if (!parent) throw new Error(`投稿分支 ${branch} 不存在`);

    const { data: tree } = await client.rest.git.createTree({
      owner: repo.owner,
      repo: repo.repo,
      base_tree: parent.treeSha,
      tree: blobs,
    });

    const { data: commit } = await client.rest.git.createCommit({
      owner: repo.owner,
      repo: repo.repo,
      message: `paper: ${input.title}`,
      tree: tree.sha,
      parents: [parent.sha],
    });

    try {
      await client.rest.git.updateRef({
        owner: repo.owner,
        repo: repo.repo,
        ref: `heads/${branch}`,
        sha: commit.sha,
        force: false,
      });
      commitSha = commit.sha;
    } catch (error) {
      // A concurrent submission moved the branch; rebuild on the new head.
      if (!isGitHubStatus(error, 422, 409) || attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  if (!commitSha) throw new Error("投稿分支更新冲突，请重试");

  const { data: openPullRequests } = await client.rest.pulls.list({
    owner: repo.owner,
    repo: repo.repo,
    state: "open",
    head: `${repo.owner}:${branch}`,
    base,
    per_page: 10,
  });

  const existing = openPullRequests[0];
  let pullNumber: number;
  let pullUrl: string;
  let pullNodeId: string;
  let autoMergeActive = false;

  if (existing) {
    const { data: updated } = await client.rest.pulls.update({
      owner: repo.owner,
      repo: repo.repo,
      pull_number: existing.number,
      title: "[Submissions] 论文投稿队列",
      body: input.body,
    });
    pullNumber = updated.number;
    pullUrl = updated.html_url;
    pullNodeId = updated.node_id;
    autoMergeActive = Boolean(updated.auto_merge);
  } else {
    const { data: created } = await client.rest.pulls.create({
      owner: repo.owner,
      repo: repo.repo,
      title: "[Submissions] 论文投稿队列",
      head: branch,
      base,
      body: input.body,
    });
    pullNumber = created.number;
    pullUrl = created.html_url;
    pullNodeId = created.node_id;
    autoMergeActive = Boolean(created.auto_merge);
  }

  let merge: PaperSubmissionResult["merge"] = "pending";
  if (autoMergeActive) {
    // The batch PR already has auto-merge enabled; new commits join the queue.
    merge = "auto";
  } else {
    try {
      await enableAutoMerge(pullNodeId);
      merge = "auto";
    } catch {
      try {
        await client.rest.pulls.merge({
          owner: repo.owner,
          repo: repo.repo,
          pull_number: pullNumber,
          merge_method: "merge",
        });
        merge = "merged";
      } catch {
        merge = "pending";
      }
    }
  }

  return {
    number: pullNumber,
    url: pullUrl,
    branch,
    merge,
  };
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
