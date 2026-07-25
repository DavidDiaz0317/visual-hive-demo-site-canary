#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parseArguments(process.argv.slice(2));
const requestedRoot = path.resolve(repoRoot, options.root);
const requestedIndex = path.resolve(repoRoot, options.index ?? path.join(options.root, "artifacts-index.json"));
const artifactRoot = await secureDirectory(requestedRoot, "artifact root");
const indexPath = await secureFile(requestedIndex, "artifact index");

if (!insideOrEqual(artifactRoot, indexPath)) {
  fail(`Artifact index is outside the artifact root: ${display(indexPath)}`);
}

const indexBytes = await stableRead(indexPath, "artifact index");
let index;
try {
  index = JSON.parse(indexBytes.toString("utf8"));
} catch {
  fail(`Artifact index is not valid JSON: ${display(indexPath)}`);
}

if (
  index?.schemaVersion !== 1 ||
  index?.contentAddressed !== true ||
  index?.complete !== true ||
  typeof index?.root !== "string" ||
  !index.root ||
  !Array.isArray(index?.artifacts) ||
  !index?.summary ||
  typeof index.summary !== "object"
) {
  fail("Artifact index is not a complete content-addressed v1 index.");
}

const indexedRoot = normalizeIndexedRoot(index.root);
const indexedPrefix = `${indexedRoot}/`;
const expected = new Map();
for (const entry of index.artifacts) {
  if (
    !entry ||
    typeof entry !== "object" ||
    typeof entry.path !== "string" ||
    !entry.path.startsWith(indexedPrefix) ||
    !Number.isSafeInteger(entry.bytes) ||
    entry.bytes < 0 ||
    typeof entry.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(entry.sha256)
  ) {
    fail("Artifact index contains an invalid entry.");
  }
  if (expected.has(entry.path)) fail(`Artifact index contains a duplicate path: ${entry.path}`);
  expected.set(entry.path, entry);
}

const actual = await enumerateFiles(artifactRoot, indexedRoot);
actual.delete(`${indexedPrefix}${normalizeRepoPath(path.relative(artifactRoot, indexPath))}`);

const missing = [...expected.keys()].filter((entryPath) => !actual.has(entryPath)).sort();
const extra = [...actual].filter((entryPath) => !expected.has(entryPath)).sort();
const mismatches = [];

for (const [entryPath, entry] of expected) {
  if (!actual.has(entryPath)) continue;
  const absolute = path.resolve(artifactRoot, entryPath.slice(indexedPrefix.length));
  if (!insideOrEqual(artifactRoot, absolute)) fail(`Indexed artifact escapes the artifact root: ${entryPath}`);
  const bytes = await stableRead(await secureFile(absolute, `indexed artifact ${entryPath}`), `indexed artifact ${entryPath}`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== entry.bytes || sha256 !== entry.sha256) {
    mismatches.push({
      path: entryPath,
      expectedBytes: entry.bytes,
      actualBytes: bytes.byteLength,
      expectedSha256: entry.sha256,
      actualSha256: sha256
    });
  }
}

const summary = {
  schemaVersion: "visual-hive.artifact-index-verification.v1",
  status: missing.length === 0 && extra.length === 0 && mismatches.length === 0 ? "passed" : "failed",
  index: normalizeRepoPath(path.relative(repoRoot, indexPath)),
  indexSha256: createHash("sha256").update(indexBytes).digest("hex"),
  indexedArtifacts: expected.size,
  actualArtifacts: actual.size,
  missing,
  extra,
  mismatches
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (summary.status !== "passed") process.exitCode = 1;

async function enumerateFiles(root, indexedRoot) {
  const files = new Set();
  const walk = async (directory) => {
    const canonicalDirectory = await secureDirectory(directory, `artifact directory ${display(directory)}`);
    const entries = await readdir(canonicalDirectory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const target = path.join(canonicalDirectory, entry.name);
      const stat = await lstat(target);
      if (stat.isSymbolicLink()) fail(`Artifact tree contains a symbolic link: ${display(target)}`);
      if (stat.isDirectory()) {
        await walk(target);
        continue;
      }
      if (!stat.isFile()) fail(`Artifact tree contains a non-regular entry: ${display(target)}`);
      files.add(`${indexedRoot}/${normalizeRepoPath(path.relative(root, target))}`);
    }
  };
  await walk(root);
  return files;
}

async function secureDirectory(target, label) {
  const stat = await lstat(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`${label} is not a secure directory: ${display(target)}`);
  const canonical = await realpath(target);
  if (!insideOrEqual(repoRoot, canonical)) fail(`${label} resolves outside the repository: ${display(target)}`);
  return canonical;
}

async function secureFile(target, label) {
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} is not a regular file: ${display(target)}`);
  const canonical = await realpath(target);
  if (!insideOrEqual(repoRoot, canonical)) fail(`${label} resolves outside the repository: ${display(target)}`);
  return canonical;
}

async function stableRead(target, label) {
  const before = await lstat(target, { bigint: true });
  const bytes = await readFile(target);
  const after = await lstat(target, { bigint: true });
  if (
    !before.isFile() ||
    !after.isFile() ||
    before.isSymbolicLink() ||
    after.isSymbolicLink() ||
    before.ino !== after.ino ||
    (process.platform !== "win32" && before.dev !== after.dev) ||
    before.size !== after.size ||
    before.mtimeNs !== after.mtimeNs
  ) {
    fail(`${label} changed while it was read: ${display(target)}`);
  }
  return bytes;
}

function parseArguments(args) {
  const parsed = { root: ".visual-hive" };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--root" || argument === "--index") {
      const value = args[index + 1];
      if (!value) fail(`${argument} requires a path.`);
      parsed[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    fail(`Unknown argument: ${argument}`);
  }
  return parsed;
}

function normalizeRepoPath(value) {
  return value.replaceAll("\\", "/");
}

function normalizeIndexedRoot(value) {
  const normalized = normalizeRepoPath(value).replace(/^\.\//, "").replace(/\/$/, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").some((segment) => !segment || segment === "..")) {
    fail(`Artifact index root is unsafe: ${value}`);
  }
  return normalized;
}

function insideOrEqual(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function display(target) {
  return normalizeRepoPath(path.relative(repoRoot, target)) || ".";
}

function fail(message) {
  throw new Error(message);
}
