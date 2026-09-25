# Task ownership and independent review

## Roles

- Coordinator: the main agent tracks scope, delegates tasks, receives results, and reports completion. It may orchestrate tools, Git, and integration, but does not implement task deliverables or silently edit them after accepted review.
- Maker: a fresh, separate subagent for each task implements its deliverables, runs appropriate checks, and records evidence. Return fixes to that task's maker; use a fresh maker for unrelated tasks.
- Checker: a separate subagent, distinct from the coordinator and maker, reviews requirements, changed files, and evidence, and independently runs appropriate checks. A second pass by the maker does not qualify.

This applies to implementation, documentation, configuration, and specification tasks. Use checks appropriate to the change; documentation edits do not require application tests.

## Scoped handoffs

Spawn makers and checkers with their own task context and no inherited full conversation history by default (Codex: `fork_turns="none"`; Claude Code: a fresh Agent-tool subagent, see `../CLAUDE.md`). Provide the task ID, acceptance criteria, relevant specification/design paths, owned files, required checks, and constraints. Include the maker report and snapshot in the checker handoff. Agents may read dependencies as needed; do not preload unrelated documentation or evidence. Makers and checkers need not delegate recursively.

Each agent returns its changes or findings, actual checks and results, evidence paths, and open issues to the coordinator. The coordinator uses these results to arrange fixes and review before reporting completion.

## Workflow

1. Identify the task and acceptance criteria, with a link to its OpenSpec task when available. For setup work before an OpenSpec change exists, use a descriptive setup task ID.
2. Spawn a fresh maker with the scoped handoff. The maker implements the task and saves actual check results.
3. Freeze the review scope at a commit SHA or a file manifest containing SHA-256 hashes. Include all changed files, including untracked files. Store the snapshot in the task evidence directory.
4. Spawn a separate checker with the scoped handoff, snapshot, and maker report. The checker reads the underlying requirements and changes rather than relying only on the maker summary.
5. The checker records findings, independently executed checks, limitations, and a verdict: `accepted`, `changes requested`, or `blocked`. The checker does not silently repair the maker's work.
6. Return findings to the same task maker to resolve; the checker reviews the updated snapshot and reruns affected checks. Preserve previous findings and their resolution.
7. Mark the task complete only after all acceptance criteria are met, required checks pass, and the checker accepts the final snapshot. If a required check cannot run or no checker is available, report the task as pending or blocked.

Any changes to reviewed deliverables invalidate acceptance for those changed files until reviewed again. Evidence reports may be added after the snapshot; list them separately and do not include a report's own hash inside itself. They must describe the reviewed snapshot accurately.

## Evidence per task

Use `docs/evidence/<task-id>/` with:

- `implementation.md`: task criteria, maker identity, changes, snapshot reference, checks and results, and known limitations.
- `review.md`: checker identity, reviewed snapshot, findings with file references, independent checks, and verdict. Include each review round and resolution of findings.
- `snapshot.txt`: commit SHA or file paths and SHA-256 hashes for the reviewed deliverables.
- Supporting output files as needed: actual command output with exit codes, screenshots for visual criteria, or other verifiable artifacts. Do not store secrets or personal chat content.

Do not fabricate failures or clean results. A review with no findings is valid when explicitly recorded. Screenshots supplement behavioral checks; they do not prove message delivery or persistence by themselves.
