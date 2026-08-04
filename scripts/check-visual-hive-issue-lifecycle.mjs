import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const hiveDir = path.join(repoRoot, ".visual-hive");
const proofRoot = path.join(hiveDir, "issue-lifecycle-proof");
const workDir = path.join(proofRoot, "work");
const workHiveDir = path.join(workDir, ".visual-hive");
const configPath = path.join(workDir, "visual-hive.config.yaml");
const cliPath = path.join(repoRoot, "scripts", "visual-hive-cli.mjs");
const summaryJsonPath = path.join(hiveDir, "issue-lifecycle-proof.json");
const summaryMarkdownPath = path.join(hiveDir, "issue-lifecycle-proof.md");

const timeoutMs = 120_000;

await resetProofWorkspace();
await mkdir(workHiveDir, { recursive: true });
await writeFile(configPath, renderConfig(), "utf8");

await writeJson(path.join(workHiveDir, "report.json"), failedReport());
await runVisualHive(["issues", "--config", configPath, "--write"]);
const initialIssues = await readJson(path.join(workHiveDir, "issues.json"));
const initialIssue = initialIssues.issues.find((issue) => issue.issueKind === "selector_contract_failure") ?? initialIssues.issues[0];
assert(initialIssue, "initial issues run must create a deterministic issue candidate.");
assert(initialIssue.status === "open_candidate", `expected initial issue status open_candidate, got ${initialIssue.status}.`);

await writeJson(path.join(workHiveDir, "issue-suppressions.json"), {
  suppressions: [
    {
      dedupeFingerprint: initialIssue.dedupeFingerprint,
      reason: "Lifecycle proof suppression",
      expiresAt: "2999-01-01T00:00:00.000Z"
    }
  ]
});
await runVisualHive(["issues", "--config", configPath, "--write"]);
const suppressedIssues = await readJson(path.join(workHiveDir, "issues.json"));
const suppressedIssue = findIssue(suppressedIssues, initialIssue.dedupeFingerprint);
assert(suppressedIssue.status === "suppressed", `expected suppressed issue status, got ${suppressedIssue.status}.`);
assert(String(suppressedIssue.suppressedReason ?? "").includes("Lifecycle proof suppression"), "suppressed issue must include the suppression reason.");

await writeJson(path.join(workHiveDir, "issues.json"), initialIssues);
await writeJson(path.join(workHiveDir, "issue-suppressions.json"), { suppressions: [] });
await writeJson(path.join(workHiveDir, "report.json"), passedReport());
await runVisualHive(["issues", "--config", configPath, "--write"]);
const resolvedIssues = await readJson(path.join(workHiveDir, "issues.json"));
const resolvedIssue = findIssue(resolvedIssues, initialIssue.dedupeFingerprint);
assert(resolvedIssue.status === "resolved_candidate", `expected resolved_candidate status, got ${resolvedIssue.status}.`);
assert(resolvedIssue.labels.includes("visual-hive/resolved-candidate"), "resolved candidate must include the resolved label.");
assert(resolvedIssue.body.includes("Resolved Candidate Evidence"), "resolved candidate body must include resolved evidence.");

await runVisualHive(["issues", "publish", "--config", configPath, "--dry-run", "--repo", "DavidDiaz0317/visual-hive-demo-site-canary"]);
const publish = await readJson(path.join(workHiveDir, "issue-publish-result.json"));
assert(publish.status === "dry_run_written", `expected dry_run_written publish status, got ${publish.status}.`);
assert((publish.externalCallsMade ?? 0) === 0, "issue publish dry-run must make zero external calls.");
assert((publish.networkCallsMade ?? 0) === 0, "issue publish dry-run must make zero network calls.");
assert((publish.realGithubIssuesCreated ?? 0) === 0, "issue publish dry-run must create zero real GitHub issues.");
assert((publish.realGithubIssuesUpdated ?? 0) === 0, "issue publish dry-run must update zero real GitHub issues.");
const publishDecisions = publish.plan?.decisions ?? publish.decisions ?? [];
const resolvedDecision = publishDecisions.find((decision) => decision.dedupeFingerprint === initialIssue.dedupeFingerprint);
assert(resolvedDecision, "publish dry-run must include the lifecycle issue decision.");
assert(resolvedDecision.status === "resolved_candidate", `expected resolved publish decision, got ${resolvedDecision.status}.`);
assert(resolvedDecision.action === "skip", `resolved candidate without a known published issue should be skipped, got ${resolvedDecision.action}.`);

const summary = {
  schemaVersion: "visual-hive.issue-lifecycle-proof.v1",
  project: "visual-hive-demo-site",
  generatedAt: new Date().toISOString(),
  proofRoot: ".visual-hive/issue-lifecycle-proof/work",
  issueKind: initialIssue.issueKind,
  dedupeFingerprint: initialIssue.dedupeFingerprint,
  statuses: {
    initial: initialIssue.status,
    suppressed: suppressedIssue.status,
    resolved: resolvedIssue.status
  },
  publishDryRun: {
    status: publish.status,
    decisions: publishDecisions.map((decision) => ({
      action: decision.action,
      status: decision.status,
      dedupeFingerprint: decision.dedupeFingerprint
    })) ?? [],
    externalCallsMade: publish.externalCallsMade ?? 0,
    networkCallsMade: publish.networkCallsMade ?? 0,
    realGithubIssuesCreated: publish.realGithubIssuesCreated ?? 0,
    realGithubIssuesUpdated: publish.realGithubIssuesUpdated ?? 0
  },
  externalCallsMade: 0,
  networkCallsMade: 0,
  realGithubIssuesCreated: 0,
  realGithubIssuesUpdated: 0,
  sourceMutations: 0
};

await mkdir(hiveDir, { recursive: true });
await writeJson(summaryJsonPath, summary);
await writeFile(summaryMarkdownPath, renderSummaryMarkdown(summary), "utf8");

console.log("Visual Hive issue lifecycle proof passed.");
console.log(`Summary: ${path.relative(repoRoot, summaryJsonPath).replaceAll("\\", "/")}`);

async function resetProofWorkspace() {
  const resolvedProofRoot = path.resolve(proofRoot);
  const resolvedHiveDir = path.resolve(hiveDir);
  if (!resolvedProofRoot.startsWith(resolvedHiveDir + path.sep)) {
    throw new Error(`Refusing to remove proof workspace outside .visual-hive: ${resolvedProofRoot}`);
  }
  if (existsSync(proofRoot)) {
    await rm(proofRoot, { recursive: true, force: true });
  }
}

async function runVisualHive(args) {
  const result = await runCommand(process.execPath, [cliPath, ...args], { cwd: repoRoot, timeoutMs });
  if (result.code !== 0) {
    throw new Error(`visual-hive ${args.join(" ")} failed with exit ${result.code}\n${result.output}`);
  }
  return result;
}

function runCommand(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: options.cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timer = setTimeout(() => {
      output += `\nCommand timed out after ${options.timeoutMs}ms.`;
      child.kill("SIGTERM");
    }, options.timeoutMs);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, output });
    });
  });
}

function renderConfig() {
  return `project:
  name: issue-lifecycle-proof
  type: static
  defaultBranch: main

targets:
  local:
    kind: url
    url: "http://127.0.0.1:4173"
    prSafe: true
    cost: cheap

contracts:
  - id: dashboard-shell
    description: Dashboard shell is visible.
    target: local
    severity: high
    runOn:
      pullRequest: true
    selectors:
      mustExist:
        - "[data-testid='dashboard-page']"

viewports:
  desktop:
    width: 1440
    height: 900
`;
}

function failedReport() {
  return baseReport({
    status: "failed",
    passedContracts: 0,
    failedContracts: 1,
    resultStatus: "failed",
    assertionStatus: "failed",
    errors: ["Missing required selector [data-testid='dashboard-page']."]
  });
}

function passedReport() {
  return baseReport({
    status: "passed",
    passedContracts: 1,
    failedContracts: 0,
    resultStatus: "passed",
    assertionStatus: "passed",
    errors: []
  });
}

function baseReport(input) {
  return {
    schemaVersion: 2,
    project: "issue-lifecycle-proof",
    mode: "pr",
    generatedAt: new Date().toISOString(),
    status: input.status,
    changedFiles: ["src/App.tsx"],
    selectedTargets: [
      {
        id: "local",
        kind: "url",
        url: "http://127.0.0.1:4173",
        prSafe: true,
        cost: "cheap"
      }
    ],
    selectedContracts: ["dashboard-shell"],
    excludedContracts: [],
    targetLifecycle: [],
    generatedSpecPath: ".visual-hive/generated/visual-hive.generated.spec.ts",
    summary: {
      passedContracts: input.passedContracts,
      failedContracts: input.failedContracts,
      screenshotsPassed: 0,
      screenshotsFailed: 0,
      baselinesCreated: 0,
      missingBaselines: 0,
      consoleErrors: 0,
      pageErrors: 0
    },
    results: [
      {
        contractId: "dashboard-shell",
        targetId: "local",
        status: input.resultStatus,
        durationMs: 10,
        selectorAssertions: [
          {
            kind: "mustExist",
            value: "[data-testid='dashboard-page']",
            status: input.assertionStatus
          }
        ],
        textAssertions: [],
        screenshotAssertions: [],
        consoleErrors: [],
        pageErrors: [],
        networkErrors: [],
        artifacts: [],
        errors: input.errors,
        reproductionCommand: "visual-hive run --ci --config .visual-hive/issue-lifecycle-proof/work/visual-hive.config.yaml"
      }
    ],
    artifacts: [],
    reproductionCommands: ["visual-hive run --ci --config .visual-hive/issue-lifecycle-proof/work/visual-hive.config.yaml"]
  };
}

function findIssue(report, dedupeFingerprint) {
  const issue = report.issues.find((candidate) => candidate.dedupeFingerprint === dedupeFingerprint);
  assert(issue, `expected issue ${dedupeFingerprint} to be present.`);
  return issue;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function renderSummaryMarkdown(summary) {
  return `# Visual Hive Issue Lifecycle Proof

- Initial status: ${summary.statuses.initial}
- Suppressed status: ${summary.statuses.suppressed}
- Resolved status: ${summary.statuses.resolved}
- Dedupe fingerprint: ${summary.dedupeFingerprint}
- Publish dry-run status: ${summary.publishDryRun.status}
- External calls made: ${summary.externalCallsMade}
- Network calls made: ${summary.networkCallsMade}
- Real GitHub issues created: ${summary.realGithubIssuesCreated}
- Real GitHub issues updated: ${summary.realGithubIssuesUpdated}
`;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
