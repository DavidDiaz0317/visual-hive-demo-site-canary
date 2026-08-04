const missingArtifactSummaryReason =
  "workflow_run event did not include a repository and Visual Hive issue artifact summary.";

export function classifyGitHubAppArtifactSmoke(actions, issueCandidateCount) {
  const publishesIssue = actions.some(
    (action) => action.action === "create_or_update_visual_hive_issue",
  );
  const delegatesToHive = actions.some(
    (action) =>
      action.action === "ignore" &&
      String(action.reason ?? "").startsWith("managed_by_hive:"),
  );
  const cleanRunWithoutCandidate =
    issueCandidateCount === 0 &&
    actions.length === 1 &&
    actions[0]?.action === "ignore" &&
    String(actions[0]?.reason ?? "") === missingArtifactSummaryReason;

  const dispositions = [publishesIssue, delegatesToHive, cleanRunWithoutCandidate];
  if (dispositions.filter(Boolean).length !== 1) {
    throw new Error(
      "GitHub App artifact smoke must publish an issue preview, delegate issue ownership to Hive, or safely ignore a clean run with no issue candidate.",
    );
  }

  return {
    publishesIssue,
    lifecycleDisposition: publishesIssue
      ? "standalone_issue_preview"
      : delegatesToHive
        ? "managed_by_hive"
        : "no_issue_candidate",
  };
}
