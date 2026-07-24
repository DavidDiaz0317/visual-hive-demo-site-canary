#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hiveDir = path.join(repoRoot, ".visual-hive");
const summaryJsonPath = path.join(hiveDir, "external-full-run-summary.json");
const summaryMarkdownPath = path.join(hiveDir, "external-full-run-summary.md");

const DEFAULT_TIMEOUT_MS = 120_000;
const TIMEOUTS = {
  build: 180_000,
  typecheck: 180_000,
  "vh:run:seed": 240_000,
  "vh:run:ci": 240_000,
  "vh:defect": 360_000,
  "vh:mutate": 360_000,
  "vh:full-run": 900_000
};

const artifactsBySection = {
  "Setup/repo intelligence": [
    ".visual-hive/repo-map.json",
    ".visual-hive/repo-context.md",
    ".visual-hive/visual-graph.json",
    ".visual-hive/visual-graph-summary.md",
    ".visual-hive/visual-graph-vocab.json",
    ".visual-hive/visual-graph-unresolved.json",
    ".visual-hive/visual-impact.json",
    ".visual-hive/recommendations.json"
  ],
  Planning: [".visual-hive/plan.json", ".visual-hive/plan.canary.json", ".visual-hive/plan.full.json", ".visual-hive/plans.json"],
  "Clean deterministic run": [".visual-hive/report.json", ".visual-hive/baselines.json"],
  "Seeded defect proof": [
    ".visual-hive/report.json",
    ".visual-hive/triage.json",
    ".visual-hive/evidence-packet.json",
    ".visual-hive/handoff.json",
    ".visual-hive/hive-issue.md",
    ".visual-hive/test-creation-plan.json",
    ".visual-hive/artifacts-index.json"
  ],
  "Mutation adequacy": [".visual-hive/mutation-report.json"],
  "Coverage and visual-test maintenance": [
    ".visual-hive/coverage.json",
    ".visual-hive/coverage-recommendations.json",
    ".visual-hive/flows.json",
    ".visual-hive/targets.json",
    ".visual-hive/contracts.json",
    ".visual-hive/schedules.json"
  ],
  "Governance/provider/safety": [
    ".visual-hive/workflows.json",
    ".visual-hive/provider-results.json",
    ".visual-hive/provider-setup-plan.json",
    ".visual-hive/provider-handoff.json",
    ".visual-hive/provider-upload/argos/manifest.json",
    ".visual-hive/risk.json",
    ".visual-hive/security.json",
    ".visual-hive/path-leak-scan.json",
    ".visual-hive/costs.json",
    ".visual-hive/readiness.json",
    ".visual-hive/setup-progress.json",
    ".visual-hive/runbook.json"
  ],
  "Evidence/verdict/triage": [
    ".visual-hive/triage.json",
    ".visual-hive/llm-usage.json",
    ".visual-hive/report.json",
    ".visual-hive/evidence-packet.json",
    ".visual-hive/testing-layers.json",
    ".visual-hive/verdict.json"
  ],
  "Hive handoff and resource sharing": [
    ".visual-hive/handoff.json",
    ".visual-hive/hive-issue.md",
    ".visual-hive/hive-bead-request.json",
    ".visual-hive/hive-handoff-result.json",
    ".visual-hive/hive-handoff-validation.json",
    ".visual-hive/hive/hive-export.json",
    ".visual-hive/hive/beads.json",
    ".visual-hive/hive/hive-beads.json",
    ".visual-hive/hive/hive-beads.md",
    ".visual-hive/hive/hive-import-manifest.json",
    ".visual-hive/hive/hive-agent-work-orders.json",
    ".visual-hive/hive/hive-validation-summary.json",
    ".visual-hive/hive/hive-setup-pack.json",
    ".visual-hive/hive/hive-setup-pack.md",
    ".visual-hive/hive/hive-integration-smoke.json",
    ".visual-hive/hive/hive-integration-smoke.md",
    ".visual-hive/hive/knowledge-facts.json",
    ".visual-hive/hive/knowledge-graph.json",
    ".visual-hive/hive/wiki-index.json",
    ".visual-hive/hive/issue-context.md",
    ".visual-hive/hive/repair-work-orders.json",
    ".visual-hive/hive/hive-agent-policy.json",
    ".visual-hive/hive/guarded-repair-preview.json",
    ".visual-hive/hive/repair-request-envelope.json",
    ".visual-hive/hive/trusted-repair-consumer-summary.json",
    ".visual-hive/hive/trusted-repair-workflow-dry-run.json",
    ".visual-hive/hive-issue-dry-run.json"
  ],
  "Issue queue and agent handoff": [
    ".visual-hive/issues.json",
    ".visual-hive/issues.md",
    ".visual-hive/issue-queue.json",
    ".visual-hive/issue-publish-plan.json",
    ".visual-hive/issue-publish-dry-run.json",
    ".visual-hive/issue-publish-result.json",
    ".visual-hive/issue-lifecycle-proof.json",
    ".visual-hive/agent-validation.json",
    ".visual-hive/agents/*/agent-request.md",
    ".visual-hive/agents/*/agent-output.md",
    ".visual-hive/agents/*/agent-run.json",
    ".visual-hive/agents/*/write-preview.json"
  ],
  "Agent packets/tools/MCP/context": [
    ".visual-hive/test-creation-plan.json",
    ".visual-hive/agent-packet.json",
    ".visual-hive/handoff-agent-packet.json",
    ".visual-hive/provider-agent-packet.json",
    ".visual-hive/tools/tool-registry.json",
    ".visual-hive/mcp-manifest.json",
    ".visual-hive/context-ledger.json",
    ".visual-hive/schema-catalog.json"
  ],
  "Control Plane and UI": [".visual-hive/control-plane-snapshot.json", ".visual-hive/artifacts-index.json"],
  "External repo summary": [".visual-hive/external-full-run-summary.json", ".visual-hive/external-full-run-summary.md"]
};

const sections = [
  section("Setup/repo intelligence", ["build", "typecheck", "vh:doctor", "vh:analyze", "vh:graph:search", "vh:graph:impact", "vh:recommend"], verifySetup),
  section("Planning", ["vh:plan", "vh:plan:canary", "vh:plan:full", "vh:plans"], verifyPlanning),
  section("Clean deterministic run", ["vh:run:seed", "vh:run:ci", "vh:baselines"], verifyCleanRun),
  section("Seeded defect proof", ["vh:defect"], verifySeededDefect, restoreCleanArtifacts),
  section("Mutation adequacy", ["vh:mutate", "vh:mutation-proof"], verifyMutation),
  section("Coverage and visual-test maintenance", ["vh:coverage", "vh:flows", "vh:improve", "vh:targets", "vh:contracts", "vh:schedules"], verifyCoverage),
  section(
    "Governance/provider/safety",
    ["vh:workflows", "vh:providers", "vh:provider-plan", "vh:provider-handoff", "vh:provider-upload", "vh:risk", "vh:security", "vh:path-scan", "vh:costs", "vh:readiness", "vh:setup-status", "vh:runbook"],
    verifyGovernance
  ),
  section("Evidence/verdict/triage", ["vh:triage", "vh:llm", "vh:report", "vh:evidence", "vh:layers", "vh:verdict"], verifyEvidence),
  section(
    "Hive handoff and resource sharing",
    [
      "vh:handoff",
      "vh:hive-export",
      "vh:hive-beads",
      "vh:hive-validate",
      "vh:hive-setup-pack",
      "vh:hive-integration-smoke",
      "vh:hive-guarded-preview",
      "vh:hive-repair-envelope",
      "vh:hive-repair-consumer",
      "vh:hive-repair-workflow",
      "vh:handoff-validate",
      "vh:hive-modes",
      "vh:handoff-dry-run"
    ],
    verifyHandoff
  ),
  section("Issue queue and agent handoff", ["vh:issues", "vh:issues:publish", "vh:issues:lifecycle-proof", "vh:agent:issue", "vh:agent:validate", "vh:agent:write-preview"], verifyIssueQueue),
  section("Agent packets/tools/MCP/context", ["vh:test-creation", "vh:agent-packet", "vh:agent-packet:handoff", "vh:agent-packet:provider", "vh:tools", "vh:mcp", "vh:context", "vh:schemas"], verifyAgentTooling),
  section("Control Plane and UI", ["vh:snapshot", "vh:artifacts", "vh:control-plane-smoke"], verifyControlPlane),
  section("External repo summary", [], verifySummaryPlaceholder)
];

const results = [];
const metrics = {
  cleanReports: 0,
  seededDefects: 0,
  mutationResults: 0,
  evidencePackets: 0,
  handoffPackets: 0,
  issueDryRuns: 0,
  agentPackets: 0,
  controlPlaneSnapshots: 0,
  artifactIndexes: 0,
  mcpManifests: 0,
  toolRegistries: 0,
  externalCallsMade: 0,
  networkCallsMade: 0,
  sourceMutations: 0,
  repairBranchesOrPrsCreated: 0,
  realGithubIssuesCreated: 0
};

let seededDefectGeneratedAtMs = 0;
const cliResolution = await getCliResolution();

console.log("[external:full-run] starting Visual Hive external repo acceptance run");

for (const currentSection of sections) {
  const startedAt = Date.now();
  console.log(`\n[external:full-run] ${currentSection.name}`);
  try {
    for (const scriptName of currentSection.scripts) {
      await runScript(scriptName);
    }
    await currentSection.verify();
    if (currentSection.after) {
      await currentSection.after();
    }
    results.push({
      name: currentSection.name,
      status: "pass",
      commandsRun: currentSection.scripts,
      artifactsChecked: currentSection.artifactsChecked,
      durationMs: Date.now() - startedAt
    });
    console.log(`[external:full-run] ${currentSection.name}: pass`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: currentSection.name,
      status: "fail",
      commandsRun: currentSection.scripts,
      artifactsChecked: currentSection.artifactsChecked,
      durationMs: Date.now() - startedAt,
      failureMessage: message
    });
    await writeSummary("FAIL");
    console.error(`[external:full-run] ${currentSection.name}: fail`);
    console.error(message);
    process.exit(1);
  }
}

await verifyFinalMetrics();
await writeSummary("PASS");
console.log("[external:full-run] completed successfully");

function section(name, scripts, verify, after) {
  return { name, scripts, verify, after, artifactsChecked: artifactsBySection[name] ?? [] };
}

async function restoreCleanArtifacts() {
  console.log("[external:full-run] restoring clean artifacts after seeded defect");
  for (const scriptName of [
    "vh:plan",
    "vh:run:seed",
    "vh:run:ci",
    "vh:baselines",
    "vh:mutate",
    "vh:coverage",
    "vh:triage",
    "vh:evidence",
    "vh:layers",
    "vh:verdict",
    "vh:handoff",
    "vh:handoff-validate",
    "vh:test-creation",
    "vh:snapshot",
    "vh:artifacts"
  ]) {
    await runScript(scriptName);
  }
  await verifyCleanRun();
  for (const [file, label] of [
    ["report.json", "clean report"],
    ["mutation-report.json", "clean mutation report"],
    ["coverage.json", "clean coverage report"],
    ["triage.json", "clean triage report"],
    ["evidence-packet.json", "clean Evidence Packet"],
    ["verdict.json", "clean verdict"],
    ["handoff.json", "clean handoff"],
    ["hive-handoff-validation.json", "clean handoff validation"],
    ["test-creation-plan.json", "clean test-creation plan"],
    ["control-plane-snapshot.json", "clean Control Plane snapshot"],
    ["artifacts-index.json", "clean artifact index"]
  ]) {
    await assertFreshAfterSeededDefect(file, label);
  }
}

async function verifySetup() {
  const repoMap = await readJson("repo-map.json");
  const context = await readText("repo-context.md");
  const graph = await readJson("visual-graph.json");
  const vocab = await readJson("visual-graph-vocab.json");
  const unresolved = await readJson("visual-graph-unresolved.json");
  const impact = await readJson("visual-impact.json");
  assert(repoMap.outputResource, "repo-map.json must include outputResource metadata.");
  assert(repoMap.visualGraphOutputResources?.graph?.artifactPath === ".visual-hive/visual-graph.json", "repo map must reference the Visual Graph artifact.");
  assert(repoMap.visualMap?.nodes?.length > 0, "repo map visualMap must include nodes.");
  assert(repoMap.visualMap?.edges?.length > 0, "repo map visualMap must include edges.");
  const visualMapText = JSON.stringify(repoMap.visualMap);
  assert(/route|selector|target|contract|screenshot|mutation|coverage/i.test(visualMapText), "repo map must include useful visual QA relations.");
  assert(JSON.stringify(repoMap).includes("findings"), "repo map must include findings/lifecycle evidence.");
  assert(context.includes("Visual Hive Repo Context"), "repo-context.md must be human-readable Visual Hive context.");
  assert(graph.schemaVersion === "visual-hive.visual-graph.v1", "visual-graph.json must use the production graph schema.");
  assert(graph.summary?.nodes > 0 && graph.summary?.edges > 0, "Visual Graph must include nodes and edges.");
  assert(Array.isArray(graph.unresolvedReferences), "Visual Graph must include unresolved reference lifecycle evidence.");
  assert(vocab.schemaVersion === "visual-hive.visual-graph-vocab.v1" && vocab.entries?.length > 0, "Visual Graph vocabulary must be searchable.");
  assert(Array.isArray(unresolved.unresolvedReferences), "visual-graph-unresolved.json must include unresolvedReferences.");
  assert(impact.schemaVersion === "visual-hive.visual-impact.v1", "visual-impact.json must be written.");
  assert(impact.summary?.affectedNodeCount > 0, "visual impact must identify affected nodes.");
}

async function verifyPlanning() {
  const plan = await readJson("plan.json");
  const canary = await readJson("plan.canary.json");
  const full = await readJson("plan.full.json");
  const plans = await readJson("plans.json");
  assert(plan.items?.length > 0 || plan.selectedContracts?.length > 0, "PR plan must select contracts.");
  assert((plan.selectedTargets?.length ?? plan.targets?.length ?? 0) > 0, "PR plan must select targets.");
  const canaryExclusionText = JSON.stringify(canary.excludedContracts ?? canary.excluded ?? []);
  assert(canaryExclusionText.includes("unsafeHosted"), "planning evidence must document protected unsafeHosted exclusion in untrusted/canary mode.");
  assert(canary.outputResource || canary.schemaVersion, "canary plan must exist with structured metadata.");
  assert(full.outputResource || full.schemaVersion, "full plan must exist with structured metadata.");
  assert(JSON.stringify(plans).includes("pr") && JSON.stringify(plans).includes("canary") && JSON.stringify(plans).includes("full"), "plans.json must include PR/canary/full lane evidence.");
}

async function verifyCleanRun() {
  const report = await readJson("report.json");
  const baselines = await readJson("baselines.json");
  const text = JSON.stringify(report);
  assert(report.status === "passed", `clean report status must be passed, got ${report.status}.`);
  assert(text.includes("public-auth-boundary") || text.includes("app-shell-stability"), "report must include expected selected contracts.");
  assert(text.includes("selector") || text.includes("selectors"), "report must include selector evidence.");
  assert(text.includes("screenshots") || text.includes("screenshotAssertions"), "report must include screenshot evidence.");
  assert(report.outputResource, "report must include outputResource metadata.");
  assert(!text.includes("seeded-force-login-public-demo"), "clean report must not include seeded defect contract evidence.");
  assert(Array.isArray(baselines.entries) || Array.isArray(baselines.items) || Array.isArray(baselines.baselines), "baseline review artifact must exist.");
  metrics.cleanReports += 1;
}

async function verifySeededDefect() {
  const report = await readJson("report.json");
  const evidence = await readJson("evidence-packet.json");
  const handoff = await readJson("handoff.json");
  const issue = await readText("hive-issue.md");
  const testCreation = await readJson("test-creation-plan.json");
  const text = JSON.stringify(report);
  assert(report.status === "failed", `seeded defect report status must be failed, got ${report.status}.`);
  assert(text.includes("seeded-force-login-public-demo"), "seeded defect report must include seeded-force-login-public-demo.");
  assert(!text.includes("target_startup_failure"), "seeded defect must not fail from target startup.");
  assert(!text.includes("environment_failure"), "seeded defect must not fail from environment setup.");
  assert(evidence.verdictSummary?.visualHiveVerdict === "failed", "seeded defect Evidence Packet verdict must be failed.");
  assert(issue.includes("Visual Hive") && issue.includes("seeded-force-login-public-demo"), "seeded defect issue must include Visual Hive context.");
  assert(Array.isArray(testCreation.recommendations), "seeded defect must generate test-creation context.");
  assert(handoff.externalCallsMade === 0, "seeded defect handoff must remain no-network.");
  seededDefectGeneratedAtMs = timestampMs(report.generatedAt);
  metrics.seededDefects += 1;
}

async function verifyMutation() {
  const report = await readJson("mutation-report.json");
  const results = Array.isArray(report.results) ? report.results : [];
  assert(report.schemaVersion === 2, "mutation report schemaVersion must be 2.");
  assert(results.length > 0, "mutation report must include results.");
  const counts = { killed: 0, survived: 0, not_applicable: 0 };
  for (const result of results) {
    assert(result.operator || result.operator?.id, "mutation result must include operator.");
    assert(result.status, "mutation result must include status.");
    assert(Array.isArray(result.contractIds) || Array.isArray(result.selectedContracts), "mutation result must include contract IDs.");
    assert(Array.isArray(result.affectedSurfaces), "mutation result must include affected surfaces.");
    assert(result.validationCommand, "mutation result must include validationCommand.");
    assert(["runtime", "fixture"].includes(result.mutationMode), "mutation result must use runtime or fixture mutation mode.");
    assert(result.sourceMutation === false, "mutation result must not mutate source files.");
    if (result.status in counts) counts[result.status] += 1;
  }
  assert(mutationCounter(report, "killed") === counts.killed, "killed count must match results.");
  assert(mutationCounter(report, "survived") === counts.survived, "survived count must match results.");
  metrics.mutationResults = results.length;
  metrics.sourceMutations += results.filter((result) => result.sourceMutation !== false).length;
}

async function verifyCoverage() {
  const coverage = await readJson("coverage.json");
  const recommendations = await readJson("coverage-recommendations.json");
  assert(coverage.outputResource || coverage.schemaVersion, "coverage.json must be structured.");
  assert(Array.isArray(recommendations.maintenanceFindings), "coverage-recommendations.json must include maintenanceFindings.");
  assert(
    recommendations.maintenanceFindings.length > 0 || recommendations.summary?.recommendations === 0,
    "coverage recommendations must include findings or explicitly explain no recommendations."
  );
  assert(!JSON.stringify(recommendations).includes("approved_by_visual_hive"), "Visual Hive must not automatically approve baselines.");
}

async function verifyGovernance() {
  const workflows = await readJson("workflows.json");
  const integratedConfigPath = path.join(repoRoot, ".hive", "integrated.json");
  const integratedConfig = existsSync(integratedConfigPath)
    ? JSON.parse(await readFile(integratedConfigPath, "utf8"))
    : undefined;
  const providers = await readJson("provider-results.json");
  const providerHandoff = await readJson("provider-handoff.json");
  const providerUpload = await readJson("provider-upload/argos/manifest.json");
  const risk = await readJson("risk.json");
  const security = await readJson("security.json");
  const pathLeakScan = await readJson("path-leak-scan.json");
  const costs = await readJson("costs.json");
  const readiness = await readJson("readiness.json");
  assert(JSON.stringify(workflows).includes("pull_request"), "workflow audit must include PR workflow evidence.");
  const unsafePullRequestTargetWorkflows = (workflows.workflows ?? []).filter(
    (workflow) =>
      workflow.usesPullRequestTarget &&
      (workflow.usesSecrets ||
        workflow.usesWritePermissions ||
        workflow.risk === "high" ||
        (workflow.findings ?? []).length > 0)
  );
  assert(
    unsafePullRequestTargetWorkflows.length === 0,
    "workflow audit must not include unsafe pull_request_target execution."
  );
  const trustedStandaloneWriter = workflows.workflows?.some(
      (workflow) =>
        (workflow.kind === "trusted_handoff" || workflow.kind === "trusted_issue") &&
        workflow.permissions?.issues === "write"
    );
  const integratedSchemaVersion = integratedConfig?.schema_version;
  const hasSupportedIntegratedSchema =
    typeof integratedSchemaVersion === "string" &&
    /^hive\.integrated-(?:repository-)?config\.v\d+$/.test(integratedSchemaVersion);
  const integratedHiveOwner =
    hasSupportedIntegratedSchema &&
    integratedConfig?.visual_hive === true &&
    workflows.workflows?.some(
      (workflow) =>
        workflow.path?.replaceAll("\\", "/").endsWith("/.github/workflows/hive-visual-hive.yml") &&
        workflow.permissions?.issues !== "write" &&
        workflow.permissions?.["pull-requests"] !== "write"
    );
  assert(
    trustedStandaloneWriter || integratedHiveOwner,
    "workflow audit must identify either a trusted standalone writer or the read-only producer for a Hive-owned integrated lifecycle."
  );
  if (integratedHiveOwner) {
    assert(!trustedStandaloneWriter, "integrated mode must not retain a standalone issue writer alongside Hive.");
  }
  assert((providers.externalCallsMade ?? 0) === 0, "provider mock/list results must make zero external calls.");
  assert((providerHandoff.externalCallsMade ?? 0) === 0, "provider handoff must make zero external calls.");
  assert((providerUpload.externalCallsMade ?? 0) === 0, "provider upload dry-run must make zero external calls.");
  assert(pathLeakScan.status === "passed", "issue-facing path leak scan must pass.");
  assert((pathLeakScan.summary?.findings ?? 0) === 0, "issue-facing path leak scan must report zero findings.");
  assert(risk && security && costs && readiness, "risk/security/cost/readiness artifacts must exist.");
  assertNoSecretValues([workflows, providers, providerHandoff, providerUpload, risk, security, pathLeakScan, costs, readiness], "governance artifacts");
}

async function verifyEvidence() {
  const triage = await readJson("triage.json");
  const llm = await readJson("llm-usage.json");
  const evidence = await readJson("evidence-packet.json");
  const layers = await readJson("testing-layers.json");
  const verdict = await readJson("verdict.json");
  assert(Array.isArray(triage.findings), "triage.json must include findings.");
  assert(evidence.verdictSummary?.visualHiveVerdict === "passed", "clean Evidence Packet verdict must be passed.");
  assert((llm.callsMade ?? llm.summary?.callsMade ?? 0) === 0, "LLM usage callsMade must be 0.");
  assert(JSON.stringify(verdict).includes("Visual Hive") || JSON.stringify(verdict).includes("visualHiveVerdict"), "Visual Hive must be the verdict authority.");
  assert(JSON.stringify(layers).includes("deterministic") || JSON.stringify(layers).includes("layer"), "testing layers must exist.");
  metrics.evidencePackets += 1;
}

async function verifyHandoff() {
  const handoff = await readJson("handoff.json");
  const result = await readJson("hive-handoff-result.json");
  const validation = await readJson("hive-handoff-validation.json");
  const exportBundle = await readJson("hive/hive-export.json");
  const hiveBeads = await readJson("hive/hive-beads.json");
  const hiveImportManifest = await readJson("hive/hive-import-manifest.json");
  const hiveValidation = await readJson("hive/hive-validation-summary.json");
  const hiveWorkOrders = await readJson("hive/hive-agent-work-orders.json");
  const hiveSetupPack = await readJson("hive/hive-setup-pack.json");
  const hiveSmoke = await readJson("hive/hive-integration-smoke.json");
  const dryRun = await readJson("hive-issue-dry-run.json");
  const issue = await readText("hive-issue.md");
  assert(handoff.externalCallsMade === 0 && result.externalCallsMade === 0, "Hive handoff artifacts must remain no-network.");
  assert(validation.summary?.externalCallsMade === 0, "handoff validation must report zero external calls.");
  assert(exportBundle.externalCallsMade === 0, "Hive export must remain no-network.");
  const projectedHiveBeads = Array.isArray(hiveBeads) ? hiveBeads : hiveBeads.beads;
  assert(Array.isArray(projectedHiveBeads) && projectedHiveBeads.length > 0, "Hive beads must project at least one Visual Hive issue candidate.");
  assert(hiveImportManifest.status === "ready", "Hive import manifest must be ready for Hive import.");
  assert(hiveImportManifest.safety?.pathSanitizationStatus === "passed", "Hive import manifest must preserve path sanitization evidence.");
  assert(hiveValidation.status === "passed", "Hive validation summary must pass.");
  assert(Array.isArray(hiveWorkOrders.workOrders) && hiveWorkOrders.workOrders.length > 0, "Hive agent work orders must be generated.");
  assert(hiveSetupPack.schemaVersion === "visual-hive.hive-setup-pack.v1", "Hive setup pack must use the setup-pack schema.");
  assert(Array.isArray(hiveSetupPack.proposedFiles) && hiveSetupPack.proposedFiles.length > 0, "Hive setup pack must include proposed setup files.");
  assert(Array.isArray(hiveSetupPack.validationCommands) && hiveSetupPack.validationCommands.length > 0, "Hive setup pack must include validation commands.");
  assert(hiveSmoke.status === "passed", "Hive integration smoke must pass.");
  assert((hiveSmoke.externalCallsMade ?? 0) === 0, "Hive integration smoke must make zero external calls.");
  assert(dryRun.networkCallsMade === 0, "Issue dry-run must make zero network calls.");
  assert(dryRun.scenarios?.some((scenario) => scenario.name === "no_existing_issue" && scenario.decision === "create"), "issue dry-run must simulate create.");
  assert(dryRun.scenarios?.some((scenario) => scenario.name === "existing_issue_found" && scenario.decision === "update"), "issue dry-run must simulate update.");
  assert(dryRun.scenarios?.some((scenario) => scenario.name === "blocked_artifacts" && scenario.wouldCreateOrUpdate === false), "blocked issue dry-run must not create/update.");
  assert(issue.includes("Evidence Packet") || issue.includes("evidence-packet.json"), "issue must reference Evidence Packet path.");
  assert(issue.includes("repo-map.json") || issue.includes("Repo context"), "issue must reference repo map/context.");
  assert(issue.includes("test-creation-plan"), "issue must reference test creation plan.");
  assert(/screenshot|diff|artifact/i.test(issue), "issue must include screenshot/diff evidence.");
  assert(/mutation/i.test(issue), "issue must include mutation evidence.");
  metrics.handoffPackets += 1;
  metrics.issueDryRuns += 1;
  metrics.networkCallsMade += dryRun.networkCallsMade ?? 0;
}

async function verifyIssueQueue() {
  const issues = await readJson("issues.json");
  const queue = await readJson("issue-queue.json");
  const publish = await readJson("issue-publish-result.json");
  const lifecycle = await readJson("issue-lifecycle-proof.json");
  const validation = await readJson("agent-validation.json");
  const agentRun = await readJson(await findFirstAgentArtifact("agent-run.json"));
  const writePreview = await readJson(await findFirstAgentArtifact("write-preview.json"));
  const issuesMarkdown = await readText("issues.md");
  assert(issues.schemaVersion === "visual-hive.issues.v1", "issues.json must use the first-class issue schema.");
  assert(Array.isArray(issues.issues) && issues.issues.length > 0, "issues.json must include issue candidates.");
  assert(issues.issues.every((issue) => String(issue.dedupeFingerprint ?? "").startsWith("visual-hive:")), "every issue candidate must include a Visual Hive dedupe fingerprint.");
  assert(issuesMarkdown.includes("Visual Hive") && issuesMarkdown.includes("Dedupe"), "issues.md must be human-readable issue evidence.");
  assert(queue.schemaVersion === "visual-hive.issue-queue.v1", "issue-queue.json must use the issue queue schema.");
  assert(Array.isArray(queue.queues?.ready_for_hive), "issue queue must group issues for Hive readiness.");
  assert(publish.mode === "dry_run", "default issue publish script must remain dry-run.");
  assert(
    publish.status === "dry_run_written" || publish.status === "managed_by_hive",
    "default issue publish script must either write a dry-run plan or defer to Hive ownership."
  );
  if (publish.status === "managed_by_hive") {
    assert(publish.lifecycle?.owner === "hive", "Hive-managed issue publication must identify Hive as lifecycle owner.");
    assert(
      publish.decisions?.every((decision) => decision.action === "blocked" && decision.reason?.startsWith("managed_by_hive:")),
      "Hive-managed issue publication must block every standalone Visual Hive write."
    );
  }
  assert((publish.externalCallsMade ?? 0) === 0, "issue publish dry-run must make zero external calls.");
  assert((publish.networkCallsMade ?? 0) === 0, "issue publish dry-run must make zero network calls.");
  assert((publish.realGithubIssuesCreated ?? 0) === 0, "issue publish dry-run must create zero real issues.");
  assert(lifecycle.schemaVersion === "visual-hive.issue-lifecycle-proof.v1", "issue lifecycle proof must use the lifecycle proof schema.");
  assert(lifecycle.statuses?.initial === "open_candidate", "issue lifecycle proof must prove the open candidate state.");
  assert(lifecycle.statuses?.suppressed === "suppressed", "issue lifecycle proof must prove the suppression state.");
  assert(lifecycle.statuses?.resolved === "resolved_candidate", "issue lifecycle proof must prove the resolved candidate state.");
  assert((lifecycle.externalCallsMade ?? 0) === 0, "issue lifecycle proof must make zero external calls.");
  assert((lifecycle.networkCallsMade ?? 0) === 0, "issue lifecycle proof must make zero network calls.");
  assert((lifecycle.realGithubIssuesCreated ?? 0) === 0, "issue lifecycle proof must create zero real issues.");
  assert(agentRun.schemaVersion === "visual-hive.agent-issue-run.v1", "issue agent run must use the issue-run schema.");
  assert(agentRun.mode === "no_write", "default issue agent run must be no-write.");
  assert(agentRun.status === "completed", "default issue agent run must complete.");
  assert(agentRun.agentExecution?.status === "completed", "default issue agent run must execute the local no-network demo agent.");
  assert(String(agentRun.agentExecution?.stdoutExcerpt ?? "").includes("Local Visual Hive issue agent"), "issue agent output must include local agent evidence.");
  assert(agentRun.profile === "test_creator_agent", "first issue should route to the test creator agent.");
  assert(agentRun.safety?.sourceMutations === 0, "issue agent must not mutate source in default mode.");
  assert(agentRun.safety?.externalCallsMade === 0, "issue agent must make zero external calls in default mode.");
  assert(agentRun.safety?.realGithubIssuesCreated === 0, "issue agent must create zero real issues in default mode.");
  assert(agentRun.budgets?.allowWrite === false, "issue agent default budget must disallow writes.");
  assert(agentRun.budgets?.allowExternalNetwork === false, "issue agent default budget must disallow external network.");
  assert(validation.schemaVersion === "visual-hive.agent-artifacts-validation.v1", "agent validation must use the validation schema.");
  assert(validation.status === "passed", "agent validation must pass.");
  assert(validation.summary?.agentRuns >= 1, "agent validation must inspect at least one run.");
  assert(validation.summary?.forbiddenActionFailures === 0, "agent validation must report zero forbidden action failures.");
  assert(writePreview.schemaVersion === "visual-hive.agent-write-preview.v1", "write-preview proof must use the write-preview schema.");
  assert(writePreview.mode === "dry_run", "write-preview must default to dry_run mode.");
  assert(writePreview.status === "planned", "write-preview default proof must only plan guarded work.");
  assert(writePreview.validationCommand, "write-preview must preserve validation command context.");
  assert(writePreview.safety?.branchesCreated === 0, "write-preview default proof must not create branches.");
  assert(writePreview.safety?.commitsCreated === 0, "write-preview default proof must not create commits.");
  assert(writePreview.safety?.pullRequestsOpened === 0, "write-preview default proof must not open pull requests.");
  assert(writePreview.safety?.pushesPerformed === 0, "write-preview default proof must not push.");
  assert(writePreview.safety?.realGithubIssuesCreated === 0, "write-preview default proof must not create GitHub issues.");
  assert(writePreview.safety?.externalCallsMade === 0, "write-preview default proof must not make external calls.");
  metrics.issueDryRuns += 1;
}

async function findFirstAgentArtifact(fileName) {
  const agentsDir = path.join(hiveDir, "agents");
  const entries = await readdir(agentsDir, { withFileTypes: true });
  const candidateDir = entries.find((entry) => entry.isDirectory() && entry.name.startsWith("visual-hive-"));
  assert(candidateDir, "issue agent command must write an agent artifact directory.");
  const relativePath = path.join("agents", candidateDir.name, fileName);
  assert(existsSync(path.join(hiveDir, relativePath)), `issue agent command must write ${fileName}.`);
  return relativePath;
}

async function verifyAgentTooling() {
  const testCreation = await readJson("test-creation-plan.json");
  const agent = await readJson("agent-packet.json");
  const handoffAgent = await readJson("handoff-agent-packet.json");
  const providerAgent = await readJson("provider-agent-packet.json");
  const tools = await readJson("tools/tool-registry.json");
  const mcp = await readJson("mcp-manifest.json");
  const context = await readJson("context-ledger.json");
  const schemas = await readJson("schema-catalog.json");
  assert(Array.isArray(testCreation.recommendations), "test-creation-plan must include recommendations.");
  for (const packet of [agent, handoffAgent, providerAgent]) {
    assert(packet.budgets?.allowExternalNetwork === false, "agent packets must disallow external network.");
    assert(packet.budgets?.maxExternalCostUsd === 0, "agent packets must set maxExternalCostUsd to 0.");
  }
  assert(Array.isArray(tools.tools) && tools.tools.length > 0, "tool registry must include tools.");
  assert(Array.isArray(mcp.resources) && Array.isArray(mcp.tools), "MCP manifest must include resources and tools.");
  assert(JSON.stringify(context).includes("evidenceResources"), "Context Ledger must include evidenceResources links.");
  const toolNames = new Set(mcp.tools.map((tool) => tool.name ?? tool.id));
  assert(mcp.resources.every((resource) => !resource.readToolName || toolNames.has(resource.readToolName)), "MCP resources/read tools must align.");
  assert((schemas.summary?.failed ?? schemas.failed ?? 0) === 0, "schema verification must pass.");
  metrics.agentPackets += 3;
  metrics.mcpManifests += 1;
  metrics.toolRegistries += 1;
}

async function verifyControlPlane() {
  const snapshot = await readJson("control-plane-snapshot.json");
  const index = await readJson("artifacts-index.json");
  const text = JSON.stringify(snapshot);
  assert(snapshot.overview?.deterministicStatus, "snapshot must include deterministic status.");
  for (const token of ["report.json", "mutation-report.json", "evidence-packet.json", "test-creation-plan", "handoff.json", "hive-export"]) {
    assert(text.includes(token), `snapshot must include ${token}.`);
  }
  assert(Array.isArray(snapshot.runbook?.commands) && snapshot.runbook.commands.length > 0, "snapshot must expose runbook commands.");
  assert(/does not repair code|create branches|open pull requests/i.test(text), "snapshot must include safety boundary copy.");
  assert(Array.isArray(index.artifacts) && index.artifacts.length > 0, "artifact index must list artifacts.");
  metrics.controlPlaneSnapshots += 1;
  metrics.artifactIndexes += 1;
}

async function verifySummaryPlaceholder() {
  assert(true, "summary section is written after final metric validation.");
}

async function verifyFinalMetrics() {
  metrics.externalCallsMade += await collectNumericKeyFromArtifacts("externalCallsMade");
  metrics.repairBranchesOrPrsCreated += await collectNumericKeyFromArtifacts("repairBranchesOrPrsCreated");
  metrics.realGithubIssuesCreated += await collectNumericKeyFromArtifacts("realGithubIssuesCreated");
  assert(metrics.cleanReports >= 1, "at least one clean report is required.");
  assert(metrics.seededDefects >= 1, "at least one seeded defect is required.");
  assert(metrics.mutationResults >= 1, "at least one mutation result is required.");
  assert(metrics.evidencePackets >= 1, "at least one Evidence Packet is required.");
  assert(metrics.handoffPackets >= 1, "at least one Handoff Packet is required.");
  assert(metrics.issueDryRuns >= 1, "at least one issue dry-run is required.");
  assert(metrics.agentPackets >= 1, "at least one Agent Packet is required.");
  assert(metrics.controlPlaneSnapshots >= 1, "at least one Control Plane snapshot is required.");
  assert(metrics.artifactIndexes >= 1, "at least one artifact index is required.");
  assert(metrics.mcpManifests >= 1, "at least one MCP manifest is required.");
  assert(metrics.toolRegistries >= 1, "at least one Tool Registry is required.");
  assert(metrics.externalCallsMade === 0, `externalCallsMade must be 0, got ${metrics.externalCallsMade}.`);
  assert(metrics.networkCallsMade === 0, `networkCallsMade must be 0, got ${metrics.networkCallsMade}.`);
  assert(metrics.sourceMutations === 0, `sourceMutations must be 0, got ${metrics.sourceMutations}.`);
  assert(metrics.realGithubIssuesCreated === 0, `realGithubIssuesCreated must be 0, got ${metrics.realGithubIssuesCreated}.`);
  assert(metrics.repairBranchesOrPrsCreated === 0, `repairBranchesOrPrsCreated must be 0, got ${metrics.repairBranchesOrPrsCreated}.`);
}

async function writeSummary(finalResult) {
  await mkdir(hiveDir, { recursive: true });
  const summary = {
    schemaVersion: "visual-hive.external-full-run-summary.v1",
    project: "visual-hive-demo-site",
    generatedAt: new Date().toISOString(),
    visualHiveCliPath: cliResolution.displayPath,
    visualHiveCliSource: cliResolution.source,
    visualHiveVersion: await getVisualHiveVersion(),
    gitCommit: await getGitHeadSha(),
    sections: sections.map((currentSection) => {
      const result = results.find((entry) => entry.name === currentSection.name);
      return {
        name: currentSection.name,
        status: result?.status ?? (currentSection.name === "External repo summary" ? "pass" : "fail"),
        commandsRun: result?.commandsRun ?? currentSection.scripts,
        artifactsChecked: result?.artifactsChecked ?? currentSection.artifactsChecked,
        durationMs: result?.durationMs ?? 0,
        ...(result?.failureMessage ? { failureMessage: result.failureMessage } : {})
      };
    }),
    metrics: { ...metrics },
    finalResult,
    safety: {
      visualHiveDoesNotRepairCode: true,
      localRunDoesNotCreateBranches: true,
      localRunDoesNotOpenPullRequests: true,
      localRunDoesNotCreateGitHubIssues: true,
      localRunDoesNotCallHiveApi: true,
      localRunDoesNotCallLlm: true,
      localRunDoesNotCallPaidProvider: true
    }
  };
  await writeFile(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(summaryMarkdownPath, renderSummaryMarkdown(summary), "utf8");
  console.log(`Summary JSON: ${path.relative(repoRoot, summaryJsonPath).replaceAll("\\", "/")}`);
  console.log(`Summary Markdown: ${path.relative(repoRoot, summaryMarkdownPath).replaceAll("\\", "/")}`);
}

function renderSummaryMarkdown(summary) {
  return `${[
    "# Visual Hive External Full Run Summary",
    "",
    `- Project: ${summary.project}`,
    `- Final result: ${summary.finalResult}`,
    `- Visual Hive CLI: ${summary.visualHiveCliPath}`,
    `- Git commit: ${summary.gitCommit ?? "unknown"}`,
    "",
    "## Sections",
    "",
    "| Section | Status | Commands | Artifacts | Duration |",
    "| --- | --- | ---: | ---: | ---: |",
    ...summary.sections.map((entry) => `| ${entry.name} | ${entry.status} | ${entry.commandsRun.length} | ${entry.artifactsChecked.length} | ${entry.durationMs}ms |`),
    "",
    "## Metrics",
    "",
    ...Object.entries(summary.metrics).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Safety",
    "",
    ...Object.entries(summary.safety).map(([key, value]) => `- ${key}: ${value}`)
  ].join("\n")}\n`;
}

async function getCliResolution() {
  const result = await runCapture(process.execPath, ["scripts/visual-hive-cli.mjs", "--print-resolution"], 10_000);
  assert(result.status === 0, `Unable to resolve Visual Hive CLI: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

async function getVisualHiveVersion() {
  try {
    const cliPackagePath = path.resolve(cliResolution.displayPath, "..", "..", "package.json");
    const pkg = JSON.parse(await readFile(cliPackagePath, "utf8"));
    return pkg.version;
  } catch {
    return undefined;
  }
}

async function getGitHeadSha() {
  const result = await runCapture("git", ["rev-parse", "HEAD"], 10_000);
  return result.status === 0 ? result.stdout.trim() : undefined;
}

async function runScript(scriptName) {
  const timeoutMs = TIMEOUTS[scriptName] ?? DEFAULT_TIMEOUT_MS;
  console.log(`[external:full-run] running ${scriptName} (${Math.round(timeoutMs / 1000)}s timeout)`);
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = await runCommand(command, ["run", scriptName], timeoutMs);
  assert(result.status === 0, `${scriptName} failed with exit code ${result.status}.`);
}

function runCapture(command, args, timeoutMs) {
  return runCommand(command, args, timeoutMs, { capture: true });
}

function runCommand(command, args, timeoutMs, options = {}) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
      shell: process.platform === "win32" && command.endsWith(".cmd")
    });
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child.pid);
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

function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Already exited.
    }
  }
}

async function assertFreshAfterSeededDefect(relativePath, label) {
  if (!seededDefectGeneratedAtMs) return;
  const artifact = await readJson(relativePath);
  const generatedAtMs = timestampMs(artifact.generatedAt);
  assert(generatedAtMs > seededDefectGeneratedAtMs, `${label} must be regenerated after seeded defect proof.`);
}

async function collectNumericKeyFromArtifacts(key) {
  let total = 0;
  for (const file of ["provider-results.json", "provider-handoff.json", "provider-upload/argos/manifest.json", "handoff.json", "hive-handoff-result.json", "hive-handoff-validation.json", "hive/hive-export.json", "hive-issue-dry-run.json"]) {
    if (!existsSync(path.join(hiveDir, file))) continue;
    total += collectNumericKey(await readJson(file), key);
  }
  return total;
}

function collectNumericKey(value, key) {
  if (!value || typeof value !== "object") return 0;
  let total = typeof value[key] === "number" ? value[key] : 0;
  for (const item of Array.isArray(value) ? value : Object.values(value)) {
    total += collectNumericKey(item, key);
  }
  return total;
}

function mutationCounter(report, key) {
  const value = report.summary?.[key] ?? report[key];
  return typeof value === "number" ? value : 0;
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(hiveDir, relativePath), "utf8");
}

function timestampMs(value) {
  const parsed = Date.parse(String(value ?? ""));
  assert(Number.isFinite(parsed), `Artifact timestamp is missing or invalid: ${value ?? "missing"}.`);
  return parsed;
}

function assertNoSecretValues(values, label) {
  const text = JSON.stringify(values);
  const forbidden = [
    /gh[pousr]_[A-Za-z0-9_]+/,
    /Bearer\s+[A-Za-z0-9._-]{8,}/i,
    /ARGOS_TOKEN\s*[:=]\s*[^,\s"'}]+/i,
    /client_secret\s*[:=]\s*[^,\s"'}]+/i,
    /set-cookie\s*[:=]\s*[^,\s"'}]+/i
  ];
  for (const pattern of forbidden) {
    assert(!pattern.test(text), `${label} must not contain secret-like values matching ${pattern}.`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
