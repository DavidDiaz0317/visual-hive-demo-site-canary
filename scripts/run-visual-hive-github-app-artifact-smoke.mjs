#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyGitHubAppArtifactSmoke } from "./github-app-artifact-smoke-disposition.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hiveDir = path.join(repoRoot, ".visual-hive");
const outputDir = path.join(hiveDir, "github-app-artifact-smoke");
const summaryPath = path.join(hiveDir, "github-app-artifact-smoke-summary.json");
const leakPatterns = [
  /C:\\Users/i,
  /C:\/Users/i,
  /[A-Z]:[\\/][^\r\n"'<>]*OneDrive[^\r\n"'<>]*/i,
  /\/Users\//i,
  /\/home\//i,
  /(^|[^A-Za-z])[A-Z]:(\\|\/)/
];

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const cliResolution = await resolveVisualHiveCli();
const productRoot = await findVisualHiveProductRoot(cliResolution.displayPath);
const mockPath = path.join(productRoot, "packages", "github-app", "dist", "mock.js");

if (!existsSync(mockPath)) {
  await run("npm", ["run", "build", "-w", "@visual-hive/github-app"], 120_000, { cwd: productRoot });
}

await assertRequiredArtifacts();
await run(process.execPath, [
  mockPath,
  "--event",
  "workflow_run",
  "--artifact-root",
  hiveDir,
  "--repo-root",
  repoRoot,
  "--output-dir",
  outputDir
], 120_000);

const resultPath = path.join(outputDir, "github-app-webhook-result.json");
const previewPath = path.join(outputDir, "github-app-issue-preview.md");
const result = JSON.parse(await readFile(resultPath, "utf8"));
const actions = Array.isArray(result.actions) ? result.actions : [];
const issuesDocument = JSON.parse(await readFile(path.join(hiveDir, "issues.json"), "utf8"));
const issueCandidateCount = Array.isArray(issuesDocument.issues) ? issuesDocument.issues.length : -1;
const { publishesIssue, lifecycleDisposition } = classifyGitHubAppArtifactSmoke(
  actions,
  issueCandidateCount,
);

assert(result.externalCallsMade === 0, "GitHub App artifact smoke must make zero external calls.");
assert(result.networkCallsMade === 0, "GitHub App artifact smoke must make zero network calls.");
assert(result.checkoutPerformed === false, "GitHub App artifact smoke must not check out code.");
assert(result.repoCodeExecuted === false, "GitHub App artifact smoke must not execute repo code.");
assertNoPathLeaks(JSON.stringify(result), "github-app-webhook-result.json");

if (publishesIssue) {
  assert(existsSync(previewPath), "Standalone GitHub App publishing must produce an issue preview.");
  assertNoPathLeaks(await readFile(previewPath, "utf8"), "github-app-issue-preview.md");
} else {
  assert(!existsSync(previewPath), "Hive-managed lifecycle suppression must not produce a standalone issue preview.");
}

const summary = {
  schemaVersion: "visual-hive-demo.github-app-artifact-smoke.v1",
  generatedAt: new Date().toISOString(),
  visualHiveProductRoot: toRepoDisplayPath(productRoot),
  visualHiveCliPath: toRepoDisplayPath(cliResolution.displayPath),
  artifactRoot: ".visual-hive",
  outputDir: ".visual-hive/github-app-artifact-smoke",
  actions: actions.map((action) => action.action),
  lifecycleDisposition,
  externalCallsMade: result.externalCallsMade,
  networkCallsMade: result.networkCallsMade,
  checkoutPerformed: result.checkoutPerformed,
  repoCodeExecuted: result.repoCodeExecuted,
  issuePreviewPath: publishesIssue ? ".visual-hive/github-app-artifact-smoke/github-app-issue-preview.md" : null,
  resultPath: ".visual-hive/github-app-artifact-smoke/github-app-webhook-result.json",
  realGithubIssuesCreated: 0,
  sourceMutations: 0,
  repairBranchesOrPrsCreated: 0
};

await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary, null, 2));

async function assertRequiredArtifacts() {
  const required = [
    "issues.json",
    "issue-queue.json",
    "evidence-packet.json",
    "handoff.json",
    "visual-graph.json",
    "visual-impact.json",
    "mutation-report.json",
    "artifacts-index.json"
  ];
  const missing = required.filter((file) => !existsSync(path.join(hiveDir, file)));
  assert(missing.length === 0, `Missing Visual Hive artifacts for GitHub App smoke: ${missing.join(", ")}. Run npm run vh:full-run or npm run vh:production-smoke first.`);
}

async function resolveVisualHiveCli() {
  const result = await runCapture(process.execPath, ["scripts/visual-hive-cli.mjs", "--print-resolution"], 10_000, { cwd: repoRoot });
  assert(result.status === 0, `Unable to resolve Visual Hive CLI: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

async function findVisualHiveProductRoot(cliPath) {
  let current = path.resolve(cliPath);
  if (existsSync(current) && !(await isDirectory(current))) current = path.dirname(current);
  while (current && current !== path.dirname(current)) {
    if (
      existsSync(path.join(current, "package.json")) &&
      existsSync(path.join(current, "packages", "github-app")) &&
      existsSync(path.join(current, "packages", "cli"))
    ) {
      return current;
    }
    current = path.dirname(current);
  }
  throw new Error(`Could not derive Visual Hive product root from ${cliPath}. Set VISUAL_HIVE_CLI to a built source checkout entrypoint.`);
}

async function isDirectory(value) {
  try {
    return (await stat(value)).isDirectory();
  } catch {
    return false;
  }
}

function runCapture(command, args, timeoutMs, options = {}) {
  return runCommand(command, args, timeoutMs, { ...options, capture: true });
}

function run(command, args, timeoutMs, options = {}) {
  return runCommand(command, args, timeoutMs, options).then((result) => {
    if (result.status !== 0) {
      throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.\n${result.stderr || result.stdout}`);
    }
    return result;
  });
}

function runCommand(command, args, timeoutMs, options = {}) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const child = spawn(commandForPlatform(command), argsForPlatform(command, args), {
      cwd: options.cwd ?? repoRoot,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
      shell: false
    });
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ status: 1, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ status: timedOut ? 124 : code ?? 1, stdout, stderr });
    });
  });
}

function commandForPlatform(command) {
  return process.platform === "win32" && command === "npm" ? "cmd.exe" : command;
}

function argsForPlatform(command, args) {
  return process.platform === "win32" && command === "npm" ? ["/d", "/s", "/c", command, ...args] : args;
}

function assertNoPathLeaks(text, label) {
  for (const pattern of leakPatterns) {
    assert(!pattern.test(text), `${label} contains local absolute path evidence matching ${pattern}.`);
  }
}

function toRepoDisplayPath(value) {
  const relative = path.relative(repoRoot, value).replaceAll("\\", "/");
  return relative.startsWith("..") ? "[external-visual-hive-checkout]" : relative || ".";
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
