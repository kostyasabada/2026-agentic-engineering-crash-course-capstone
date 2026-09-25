# Project organization

## Accepted decisions

- The entire project lives in `submissions/kostyasabada/`.
- OpenSpec stores requirements and individual changes.
- The user selected Next.js as the application framework.
- `AGENTS.md` contains concise rules and a reading map; details are read as needed.
- Organize code by responsibility and keep related parts together. Reference: https://nextjs.org/docs/app/getting-started/project-structure.

## Open decisions

The Next.js version, router, message transport, storage, and deployment approach will be defined in the design of the first OpenSpec change. Socket.IO and SQLite remain preliminary suggestions; dependencies have not been installed.

## Context management

Directory structure alone does not reduce reading: the agent selects files based on the task. For example, fixing history involves reading history requirements, storage code, and related tests, followed by any necessary dependencies.

Do not create empty code modules in advance. Add code directories during implementation. Do not copy the entire Next.js documentation into the project.
