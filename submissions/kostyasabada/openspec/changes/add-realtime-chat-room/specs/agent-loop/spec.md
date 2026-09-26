# Spec Delta

## Purpose

Gives the task maker a reproducible, bounded loop that runs the project's checks and hands failures to a non-interactive fixer agent, leaving a per-iteration record that a separate checker can review.

## ADDED Requirements

### Requirement: Loop invocation and arguments
The project SHALL provide an executable `scripts/agent-loop.sh` that requires a task identifier and a task brief file, and accepts an optional agent selection and an optional iteration limit. The task identifier MUST match `^[a-z0-9][a-z0-9-]*$`. Invalid or missing arguments MUST cause the script to print usage to standard error and exit with code 64 without running checks or agents. The script SHALL always operate on the project root (the parent directory of `scripts/`), regardless of the directory it is invoked from.

#### Scenario: Missing task identifier
- **WHEN** the script is run without a task identifier
- **THEN** it prints usage to standard error, exits with code 64, runs no check, and starts no agent

#### Scenario: Invalid iteration limit
- **WHEN** the script is run with an iteration limit of `0`, a negative number, a non-number, or a value above 10
- **THEN** it prints usage to standard error and exits with code 64

#### Scenario: Unknown agent
- **WHEN** the script is run with an agent value other than `claude` or `codex`
- **THEN** it prints usage to standard error and exits with code 64

#### Scenario: Invoked from another directory
- **WHEN** the script is invoked by path from a subdirectory of the project or from outside it
- **THEN** it runs the checks in the project root and writes the log under the project's `docs/evidence/<task-id>/`

### Requirement: Agent selection and defaults
The script SHALL use Claude Code (`claude -p`) as the fixer agent by default and SHALL use Codex (`codex exec`) when `codex` is selected. The iteration limit SHALL default to 5. Each fixer run MUST be a fresh non-interactive process that receives only the task brief, the failing check output, and the list of files the task owns; it MUST NOT resume a previous session.

#### Scenario: Default agent and limit
- **WHEN** the script is run with only a task identifier and a task brief file
- **THEN** the run record shows agent `claude` and an iteration limit of 5

#### Scenario: Selected agent CLI is not installed
- **WHEN** the selected agent's executable is not found on `PATH` and the initial check fails
- **THEN** the script stops with stop reason `agent_error`, exits with code 2, and records the cause in the run log

### Requirement: Check-and-fix iteration
The script SHALL first run the fast check command (`npm run check:loop`: lint, type check, unit tests, and browser end-to-end tests without a production build) once as iteration 0. While the fast check fails and the number of fixer runs is below the iteration limit, the script SHALL run the fixer agent once and then run the fast check again; each fixer run plus its following check is one iteration. The iteration limit is the maximum number of fixer runs. When the fast check passes, the script SHALL run the full check command (`npm run check`, including the production build) once as the final gate; the loop is green only if the full check passes, and a failing full check is treated like a failing fast check.

#### Scenario: Checks already green
- **WHEN** the initial fast check and the full check both exit with code 0
- **THEN** the script starts no agent, records stop reason `checks_passed`, and exits with code 0

#### Scenario: Fixed within the limit
- **WHEN** the initial fast check fails, the fast check passes after the second fixer run, and the full check then passes
- **THEN** the script records iterations 0, 1, and 2 and the final full check, stops with stop reason `checks_passed`, and exits with code 0

#### Scenario: Full check fails after fast check passes
- **WHEN** the fast check passes but the full check fails and fixer runs remain
- **THEN** the script runs the fixer with the full check's failure output and continues iterating

#### Scenario: Iteration limit reached
- **WHEN** the checks still fail after the fixer has run as many times as the iteration limit
- **THEN** the script stops with stop reason `max_iterations_reached` and exits with code 1 without starting another agent run

### Requirement: Early stop conditions
Besides passing checks and reaching the iteration limit, the script SHALL stop early in exactly two cases: `agent_error` (exit 2) when the fixer executable is missing, exits non-zero, or exceeds the per-run time limit; and `no_progress` (exit 3) when a fixer run leaves the working tree unchanged while the checks still fail. The working tree comparison MUST cover tracked file content and the content of untracked files that are not ignored. Every stop MUST be recorded in the run log. When the script is interrupted, it MUST terminate its child processes and exit with code 130.

#### Scenario: Fixer process fails
- **WHEN** the fixer process exits with a non-zero code
- **THEN** the script stops with stop reason `agent_error`, exits with code 2, and records the fixer exit code

#### Scenario: Fixer exceeds the time limit
- **WHEN** a fixer run is still running when the per-run time limit expires
- **THEN** the script terminates it, stops with stop reason `agent_error`, exits with code 2, and records that the time limit was exceeded

#### Scenario: Fixer makes no changes
- **WHEN** a fixer run exits 0 but the working tree content is identical before and after it, and the checks still fail
- **THEN** the script stops with stop reason `no_progress` and exits with code 3

#### Scenario: Editing only an untracked file counts as progress
- **WHEN** a fixer run changes only the content of a file that is untracked and not ignored, and the checks still fail
- **THEN** the script does not stop with `no_progress` and continues with the next iteration

#### Scenario: Run is interrupted
- **WHEN** the script receives an interrupt (Ctrl+C or `SIGINT`) while a fixer or check process is running
- **THEN** that process and its children are terminated, no loop child process remains running, and the script exits with code 130

### Requirement: Run log
Each run SHALL append a record to `docs/evidence/<task-id>/loop-run.log`, creating the directory and file if needed. The record MUST contain a run header (start time in UTC, task identifier, agent, iteration limit, fast and full check commands, and the Git commit at start), one entry per check and fixer run (iteration number, phase, exit code, duration, and for checks the result `pass` or `fail`), a bounded excerpt of each failing check's output, and a run footer (end time, stop reason, fixer runs used, and exit code). The log MUST NOT contain secrets or environment variable values.

#### Scenario: Log records a successful loop
- **WHEN** a run fails the initial fast check and passes the fast and full checks after one fixer run
- **THEN** `loop-run.log` gains a header, a failing iteration 0 check entry with an output excerpt, an iteration 1 agent entry, a passing iteration 1 check entry, a passing full check entry, and a footer with stop reason `checks_passed` and exit code 0

#### Scenario: Repeated runs are preserved
- **WHEN** the script is run twice for the same task identifier
- **THEN** `loop-run.log` contains both run records in order and the first record is unchanged

### Requirement: Green loop is not acceptance
The script SHALL NOT mark tasks complete, edit `tasks.md` checkboxes, commit, push, or write review verdicts. Its final message MUST state that checker review is still required.

#### Scenario: Loop ends green
- **WHEN** the loop stops with `checks_passed`
- **THEN** no task checkbox, commit, or review file is changed by the script, and its final output says that independent checker review is still required
