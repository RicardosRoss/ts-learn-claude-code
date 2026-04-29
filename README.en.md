# ts-claude-code

English | [中文](./README.md)

A staged TypeScript reconstruction of the [learn-claude-code](https://learn.shareai.run/zh/) curriculum for building an agent system that stays understandable, testable, and reviewable.

This repository now follows an explicit alignment policy:

- `s01-s06` keep the repository's historical numbering because they still match the current upstream course closely
- Starting from `s07`, all later stages align to the upstream course structure verified on `2026-04-26`
- Existing `feat(s04)` / `feat(s05)` / `feat(s06)` history is preserved; only the forward learning path is realigned

See:

- [docs/feat/learn-claude-code-realignment.md](./docs/feat/learn-claude-code-realignment.md)
- [docs/feat/staged-branch-workflow.md](./docs/feat/staged-branch-workflow.md)

## Current Alignment Status

The current working baseline has advanced through `s07 Permissions`, and this branch prepares `s08 Hooks`:

- [docs/feat/s07-permissions-development.md](./docs/feat/s07-permissions-development.md)
- [docs/feat/s07-permissions-api-reference.md](./docs/feat/s07-permissions-api-reference.md)
- [docs/feat/s08-hooks-development.md](./docs/feat/s08-hooks-development.md)
- [docs/feat/s08-hooks-api-reference.md](./docs/feat/s08-hooks-api-reference.md)

That means:

- The first seven stages already exist in code and docs
- The next stage is no longer the old planned `s07 task system`
- Current work should resume from **`s08 Hooks`** to keep matching the upstream course

## Current Base Structure

```text
src/
├── core/
│   ├── types.ts
│   ├── tool-registry.ts
│   ├── anthropic-model-client.ts
│   ├── agent-runner.ts
│   ├── todo-manager.ts
│   ├── subagent-factory.ts
│   └── compactor.ts
├── tools/
│   ├── bash-tool.ts
│   ├── file-tools.ts
│   ├── path-policy.ts
│   └── builtin-tools.ts
└── cli/
    └── repl.ts
```

## Quick Start

```bash
npm install
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY and MODEL_ID

npm test
npm run repl
```

## Scripts

| Command         | Description                     |
| --------------- | ------------------------------- |
| `npm run build` | TypeScript build                |
| `npm run lint`  | ESLint check                    |
| `npm run test`  | Run tests                       |
| `npm run repl`  | Start the interactive Agent CLI |

## Stage and Branch Mapping

### Part 1: Preserve historical numbering

| Branch               | Upstream lesson       | Core capability                                | Repo status |
| -------------------- | --------------------- | ---------------------------------------------- | ----------- |
| `lab/s01-agent-loop` | `s01 Agent Loop`      | while loop + tool_result feedback              | Implemented |
| `lab/s02-tool-use`   | `s02 Tool Use`        | multi-tool dispatch + file tools + path safety | Implemented |
| `lab/s03-todo-write` | `s03 Todo Write`      | in-session todo + active step + reminders      | Implemented |
| `lab/s04-subagents`  | `s04 Subagents`       | isolated subtask context                       | Implemented |
| `lab/s05-skills`     | `s05 Skills`          | skill indexing and on-demand loading           | Implemented |
| `lab/s06-compact`    | `s06 Context Compact` | micro/auto/manual compaction pipeline          | Implemented |

### Part 2: Align `s07+` to the current upstream course

| Branch                       | Upstream lesson          | Core capability                                          | Repo status |
| ---------------------------- | ------------------------ | -------------------------------------------------------- | ----------- |
| `lab/s07-permissions`        | `s07 Permissions`        | execution intent passes through a permission gate        | Completed   |
| `lab/s08-hooks`              | `s08 Hooks`              | inject behavior at fixed lifecycle points                | Current     |
| `lab/s09-memory`             | `s09 Memory`             | persist only cross-session knowledge that remains useful | Pending     |
| `lab/s10-system-prompt`      | `s10 System Prompt`      | build model input as a pipeline                          | Pending     |
| `lab/s11-error-recovery`     | `s11 Error Recovery`     | continue/retry/recover instead of crashing               | Pending     |
| `lab/s12-task-system`        | `s12 Task System`        | persistent task graph and dependencies                   | Pending     |
| `lab/s13-background-tasks`   | `s13 Background Tasks`   | move slow execution off the foreground path              | Pending     |
| `lab/s14-scheduling`         | `s14 Scheduling`         | time-based future work                                   | Pending     |
| `lab/s15-agent-teams`        | `s15 Agent Teams`        | persistent teammates, roster, inboxes                    | Pending     |
| `lab/s16-team-protocols`     | `s16 Team Protocols`     | request-response collaboration contracts                 | Pending     |
| `lab/s17-autonomous-agents`  | `s17 Autonomous Agents`  | idle teammates claim work autonomously                   | Pending     |
| `lab/s18-worktree-isolation` | `s18 Worktree Isolation` | isolated directories and execution lanes                 | Pending     |
| `lab/s19-mcp-plugins`        | `s19 MCP and Plugins`    | external capability bus and unified routing              | Pending     |

## Learning Mode

- `src/` remains a practice skeleton with Chinese implementation notes
- Each stage should finish its main flow before adding broader hardening
- A new stage should branch from the previous stage tag instead of running multiple stages in parallel
