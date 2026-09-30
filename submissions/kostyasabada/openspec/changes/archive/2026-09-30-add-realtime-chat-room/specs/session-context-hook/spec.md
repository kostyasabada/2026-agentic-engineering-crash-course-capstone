# Spec Delta

## Purpose

Gives every new Claude Code session in this project an up-to-date list of active OpenSpec changes, so agents start from the current planning state without reading the whole repository.

## ADDED Requirements

### Requirement: Active changes injected at session start
The project SHALL configure a Claude Code `SessionStart` hook in the committed project settings that runs the project-pinned OpenSpec CLI `list --json` command from the project root and adds its result to the session context, prefixed by a short line identifying the source.

#### Scenario: Session starts with an active change
- **WHEN** a Claude Code session starts in the project directory while the change `add-realtime-chat-room` is active
- **THEN** the session context contains the OpenSpec list JSON naming `add-realtime-chat-room`

#### Scenario: Session starts with no active changes
- **WHEN** a session starts and no change is active
- **THEN** the session context contains the OpenSpec list JSON with an empty changes list

### Requirement: Hook failure does not block the session
If the OpenSpec command fails, is missing, or does not finish within 10 seconds, the hook SHALL still exit successfully, SHALL add a one-line notice to the session context saying that active changes could not be loaded and how to load them manually, and MUST NOT block or abort the session.

#### Scenario: Dependencies not installed
- **WHEN** a session starts in a checkout where project dependencies have not been installed
- **THEN** the session starts normally and its context contains the notice that active OpenSpec changes could not be loaded

#### Scenario: Command hangs
- **WHEN** the OpenSpec command does not finish within 10 seconds
- **THEN** the hook stops waiting, adds the notice, and the session starts normally

### Requirement: Hook has no side effects
The hook MUST only read project state: it MUST NOT create, modify, or delete files, install dependencies, or access the network beyond what the pinned local OpenSpec CLI does for `list --json`.

#### Scenario: Working tree unchanged
- **WHEN** a session starts and the hook runs
- **THEN** `git status --short` shows the same output as before the session started
