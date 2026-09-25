# Implementation: setup-agent-delegation

- Maker: `/root/delegation_rule_maker`, a separate task subagent.
- Acceptance criteria: make the main agent coordinator only; require a fresh maker for each task and a distinct checker with scoped handoffs; return fixes to the same maker; align project and OpenSpec workflow rules; preserve existing evidence and record the user decision.
- Changes: updated `AGENTS.md`, `docs/review-process.md`, `docs/workflow.md`, `openspec/config.yaml`, and `docs/evidence/README.md`. The detailed process defines handoff fields, no full history by default (`fork_turns="none"`), selective dependency reading, reports to the coordinator, and review of changed deliverables after acceptance.
- Reviewed deliverables: the five repository-relative paths and SHA-256 hashes in `snapshot.txt`.
- Checks: `checks.txt` records the successful whitespace check, rule/handoff content assertions, and preservation of prior evidence README content.
- Limitations: application tests and OpenSpec CLI validation were not run for these process-only edits. Content assertions verify presence, not semantic correctness; independent checker review is pending.
- Open issues: none identified by the maker. This report does not claim checker acceptance.

Evidence reports `implementation.md`, `checks.txt`, and the future `review.md` are separate from the deliverable snapshot. No prior evidence reports were modified.
