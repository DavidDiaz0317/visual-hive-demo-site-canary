import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyGitHubAppArtifactSmoke } from "../scripts/github-app-artifact-smoke-disposition.mjs";

test("accepts a standalone issue preview", () => {
  const result = classifyGitHubAppArtifactSmoke(
    [{ action: "create_or_update_visual_hive_issue" }],
    1,
  );
  assert.deepEqual(result, {
    publishesIssue: true,
    lifecycleDisposition: "standalone_issue_preview",
  });
});

test("accepts Hive-owned lifecycle delegation", () => {
  const result = classifyGitHubAppArtifactSmoke(
    [{ action: "ignore", reason: "managed_by_hive: Hive owns lifecycle writes." }],
    1,
  );
  assert.deepEqual(result, {
    publishesIssue: false,
    lifecycleDisposition: "managed_by_hive",
  });
});

test("accepts a clean run with no issue candidate", () => {
  const result = classifyGitHubAppArtifactSmoke(
    [
      {
        action: "ignore",
        reason:
          "workflow_run event did not include a repository and Visual Hive issue artifact summary.",
      },
    ],
    0,
  );
  assert.deepEqual(result, {
    publishesIssue: false,
    lifecycleDisposition: "no_issue_candidate",
  });
});

test("rejects a missing artifact summary when issue candidates exist", () => {
  assert.throws(
    () =>
      classifyGitHubAppArtifactSmoke(
        [
          {
            action: "ignore",
            reason:
              "workflow_run event did not include a repository and Visual Hive issue artifact summary.",
          },
        ],
        1,
      ),
    /must publish an issue preview, delegate issue ownership to Hive, or safely ignore a clean run/,
  );
});
