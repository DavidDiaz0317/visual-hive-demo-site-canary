#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshot = JSON.parse(await readFile(path.join(repoRoot, ".visual-hive", "control-plane-snapshot.json"), "utf8"));
const text = JSON.stringify(snapshot);

const projectName = snapshot.project?.name ?? snapshot.project ?? snapshot.config?.project?.name;
const expectedProjectName =
  process.env.VISUAL_HIVE_EXPECTED_PROJECT?.trim() ||
  process.env.GITHUB_REPOSITORY?.split("/").at(-1)?.trim() ||
  projectNameFromOrigin() ||
  "visual-hive-demo-site";
assert(projectName === expectedProjectName, `Snapshot must describe ${expectedProjectName}, got ${projectName ?? "missing"}.`);
assert(snapshot.overview?.deterministicStatus, "Snapshot must include deterministic status.");
assert(text.includes("report.json"), "Snapshot must include report artifact evidence.");
assert(text.includes("mutation-report.json"), "Snapshot must include mutation report evidence.");
assert(text.includes("evidence-packet.json"), "Snapshot must include Evidence Packet evidence.");
assert(text.includes("test-creation-plan"), "Snapshot must include test-creation plan evidence.");
assert(text.includes("handoff.json"), "Snapshot must include handoff packet evidence.");
assert(text.includes("hive-export"), "Snapshot must include Hive export evidence.");
assert(text.includes("issue") && text.includes("handoff"), "Snapshot must include issue/handoff readiness evidence.");
assert(Array.isArray(snapshot.runbook?.commands) && snapshot.runbook.commands.length > 0, "Snapshot must expose runbook commands.");
assert(snapshot.guidanceState?.primaryAction || snapshot.overview?.nextAction, "Snapshot must expose next safe action guidance.");
assert(Array.isArray(snapshot.artifacts?.items) || Array.isArray(snapshot.artifacts), "Snapshot must include artifact links.");
assert(text.includes("artifacts-index.json"), "Snapshot must include artifact index evidence.");
assert(/does not repair code|create branches|open pull requests/i.test(text), "Snapshot must include safety boundary copy.");

console.log("Visual Hive Control Plane snapshot smoke passed.");

function projectNameFromOrigin() {
  const result = spawnSync("git", ["config", "--get", "remote.origin.url"], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) return undefined;
  const remote = result.stdout.trim().replace(/\.git$/i, "");
  return remote.split(/[/:]/).at(-1)?.trim() || undefined;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
