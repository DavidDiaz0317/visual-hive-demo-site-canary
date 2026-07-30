# Hive + Visual Hive

This repository is managed by Hive with `comprehensive` coverage and `issues` automation authority. Visual Hive runs deterministic checks; Hive alone owns issues, repair branches, pull requests, merges, and closure. Hive keeps at most 5 managed findings active as GitHub issues at once and permits at most 4 bounded repair attempts per finding; every additional finding remains durable as a bead until capacity is available.

## Operator commands

Hive automatically selects this repository's isolated persistent state. Run:

```sh
hive doctor --json
hive status --json
hive run --json
hive start --json
hive stop --json
hive pause
hive resume
hive approve-merge --pr NUMBER --head EXACT_HEAD_SHA --plan --json
hive approve-merge --pr NUMBER --head EXACT_HEAD_SHA --base EXACT_BASE_SHA --diff-digest EXACT_DIFF_SHA256 --reason "reviewed exact path-held repair" --json
hive revoke-merge-approval --reason "review withdrawn" --json
hive retry-repair --finding FINGERPRINT --recurrence N --attempt N --failure-class infrastructure --failure-id FAILURE_ID --reason "dependency restored" --json
```

If status reports `workflow_dispatch_recovery`, use its exact `revoke_plan_command` (preferred for uncertain transport) or `retry_plan_command`; never delete the dispatch state manually.

Default branch: `main`. Detected languages: TypeScript/JavaScript.
