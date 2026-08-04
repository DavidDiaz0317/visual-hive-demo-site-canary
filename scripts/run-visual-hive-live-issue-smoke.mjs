#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hiveRoot = path.join(repoRoot, ".visual-hive");
const outputPath = path.join(hiveRoot, "live-issue-smoke.json");
const issuePath = path.join(hiveRoot, "hive-issue.md");
const validationPath = path.join(hiveRoot, "hive-handoff-validation.json");
const guardEnabled = process.env.VISUAL_HIVE_LIVE_GITHUB_ISSUE === "true";
const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY ?? "DavidDiaz0317/visual-hive-demo-site-canary";
const isPullRequest = Boolean(process.env.GITHUB_HEAD_REF || process.env.GITHUB_EVENT_NAME === "pull_request");
const commandTimeoutMs = 120_000;

const baseSummary = {
  schemaVersion: "visual-hive.live-issue-smoke.v1",
  generatedAt: new Date().toISOString(),
  project: "visual-hive-demo-site",
  repository,
  guard: {
    requiredEnv: "VISUAL_HIVE_LIVE_GITHUB_ISSUE=true",
    enabled: guardEnabled,
    tokenEnvPresent: Boolean(token),
    pullRequestContext: isPullRequest
  },
  labels: ["visual-hive", "hive/quality", "e2e-smoke"],
  titlePrefix: "[Visual Hive smoke]",
  externalCallsMade: 0,
  networkCallsMade: 0,
  realGithubIssuesCreated: 0,
  realGithubIssuesUpdated: 0
};

await mkdir(hiveRoot, { recursive: true });

if (!guardEnabled) {
  await writeSummary({
    ...baseSummary,
    status: "blocked",
    reason: "Live issue smoke is disabled. Set VISUAL_HIVE_LIVE_GITHUB_ISSUE=true in a trusted context to run it."
  });
  console.log(`Live issue smoke blocked by default. Wrote ${outputPath}`);
  process.exit(0);
}

if (!token) {
  await writeSummary({ ...baseSummary, status: "blocked", reason: "Missing GH_TOKEN or GITHUB_TOKEN." });
  throw new Error("Live issue smoke requires GH_TOKEN or GITHUB_TOKEN.");
}

if (isPullRequest) {
  await writeSummary({ ...baseSummary, status: "blocked", reason: "Refusing to run live issue smoke in pull_request context." });
  throw new Error("Live issue smoke must not run in pull_request context.");
}

await run("npm", ["run", "vh:handoff-validate"]);

const validation = await readJson(validationPath);
if (validation.summary?.externalCallsMade !== 0 || validation.status === "blocked") {
  await writeSummary({ ...baseSummary, status: "blocked", reason: "Handoff validation is not ready for live issue smoke." });
  throw new Error("Refusing live issue smoke because handoff validation is not ready.");
}

const issueBody = sanitizeText(await readFile(issuePath, "utf8"));
const dedupeSignature =
  issueBody.match(/visual-hive-hive-handoff-dedupe:[^\s<]+/)?.[0] ??
  issueBody.match(/Dedupe fingerprint:\s*([^\s<]+)/)?.[1] ??
  `visual-hive-hive-handoff-dedupe:${repository}`;
const [owner, repo] = repository.split("/");
if (!owner || !repo) {
  await writeSummary({ ...baseSummary, status: "blocked", reason: "GITHUB_REPOSITORY must be owner/repo." });
  throw new Error("GITHUB_REPOSITORY must be owner/repo.");
}

const existing = await githubJson(`https://api.github.com/repos/${owner}/${repo}/issues?labels=visual-hive,hive/quality,e2e-smoke&state=open&per_page=100`, {
  method: "GET",
  token
});
const title = `${baseSummary.titlePrefix} ${dedupeSignature.replace("visual-hive-hive-handoff-dedupe:", "")}`;
const match = Array.isArray(existing)
  ? existing
      .filter((issue) => (typeof issue.body === "string" && issue.body.includes(dedupeSignature)) || issue.title === title)
      .sort((left, right) => Number(left.number ?? 0) - Number(right.number ?? 0))[0]
  : undefined;
const body = `${issueBody}

---

Live smoke label: e2e-smoke
This issue was created or updated only because VISUAL_HIVE_LIVE_GITHUB_ISSUE=true was set in a trusted context.`;

if (match) {
  const updated = await githubJson(`https://api.github.com/repos/${owner}/${repo}/issues/${match.number}`, {
    method: "PATCH",
    token,
    body: { title, body, labels: baseSummary.labels }
  });
  await writeSummary({
    ...baseSummary,
    status: "updated",
    issueNumber: updated.number,
    issueUrl: updated.html_url,
    externalCallsMade: 2,
    networkCallsMade: 2,
    realGithubIssuesUpdated: 1
  });
  console.log(`Updated Visual Hive smoke issue #${updated.number}: ${updated.html_url}`);
} else {
  const created = await githubJson(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    token,
    body: { title, body, labels: baseSummary.labels }
  });
  await writeSummary({
    ...baseSummary,
    status: "created",
    issueNumber: created.number,
    issueUrl: created.html_url,
    externalCallsMade: 2,
    networkCallsMade: 2,
    realGithubIssuesCreated: 1
  });
  console.log(`Created Visual Hive smoke issue #${created.number}: ${created.html_url}`);
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command} ${args.join(" ")} timed out after ${commandTimeoutMs}ms.`));
    }, commandTimeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}.`));
    });
  });
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeSummary(summary) {
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

async function githubJson(url, options) {
  const response = await fetch(url, {
    method: options.method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${options.token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status}): ${sanitizeText(text).slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : {};
}

function sanitizeText(value) {
  return String(value).replace(
    /(client_secret|set-cookie|authorization|bearer|cookie|token|password|secret|key|code)=?[: ]?[^&\s"']+/gi,
    "$1=[REDACTED]"
  );
}
