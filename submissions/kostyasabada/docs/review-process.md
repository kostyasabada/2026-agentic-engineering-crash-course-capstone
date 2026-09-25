# Task ownership and independent review

## Roles

- Maker: one identified agent implements the task, runs appropriate checks, and records evidence.
- Checker: a different agent reviews the requirements, changed files, and evidence, and independently runs appropriate checks. A second pass by the maker does not qualify.
- The coordinating agent tracks scope, assigns roles, and reports results. It may act as maker, but cannot also be checker for that task.

This applies to implementation, documentation, configuration, and specification tasks. Use checks appropriate to the change; documentation edits do not require application tests.

## Workflow

1. Identify the task and acceptance criteria, with a link to its OpenSpec task when available. For setup work before an OpenSpec change exists, use a descriptive setup task ID.
2. Assign the maker. Implement the task and save the actual check results.
3. Freeze the review scope at a commit SHA or a file manifest containing SHA-256 hashes. Include all changed files, including untracked files. Store the snapshot in the task evidence directory.
4. Assign a different checker with the task criteria, snapshot, relevant files, and maker report. The checker reads the underlying requirements and changes rather than relying only on the maker summary.
5. The checker records findings, independently executed checks, limitations, and a verdict: `accepted`, `changes requested`, or `blocked`. The checker does not silently repair the maker's work.
6. The maker resolves findings; the checker reviews the updated snapshot and reruns affected checks. Preserve previous findings and their resolution.
7. Mark the task complete only after all acceptance criteria are met, required checks pass, and the checker accepts the final snapshot. If a required check cannot run or no checker is available, report the task as pending or blocked.

Any changes to reviewed deliverables invalidate acceptance for those changed files until reviewed again. Evidence reports may be added after the snapshot; list them separately and do not include a report's own hash inside itself. They must describe the reviewed snapshot accurately.

## Evidence per task

Use `docs/evidence/<task-id>/` with:

- `implementation.md`: task criteria, maker identity, changes, snapshot reference, checks and results, and known limitations.
- `review.md`: checker identity, reviewed snapshot, findings with file references, independent checks, and verdict. Include each review round and resolution of findings.
- `snapshot.txt`: commit SHA or file paths and SHA-256 hashes for the reviewed deliverables.
- Supporting output files as needed: actual command output with exit codes, screenshots for visual criteria, or other verifiable artifacts. Do not store secrets or personal chat content.

Do not fabricate failures or clean results. A review with no findings is valid when explicitly recorded. Screenshots supplement behavioral checks; they do not prove message delivery or persistence by themselves.
