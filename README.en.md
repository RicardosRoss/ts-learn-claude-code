# ts-claude-code

English | [中文](./README.md)

A stage-by-stage TypeScript reimplementation of the [learn-claude-code](https://learn.shareai.run/zh/) `s01-s12` curriculum. Each stage strictly aligns with the original lesson's capabilities — no jumping ahead.

## Current Stage: s03 — Todo Write + Session Planning

Stage development doc:

- [docs/feat/s03-todo-write-development.md](./docs/feat/s03-todo-write-development.md)
- [docs/feat/s03-todo-write-api-reference.md](./docs/feat/s03-todo-write-api-reference.md)

Keep the `s02` tool layer unchanged, then add a session todo plan, a single active step, and reminder nudges.

## Current Base Structure (Inherited from s01)

```
src/
├── core/
│   ├── types.ts                  # Runtime protocol types
│   ├── tool-registry.ts          # Tool registry
│   ├── anthropic-model-client.ts # Anthropic-compatible model client
│   └── agent-runner.ts           # Agent main loop
├── tools/
│   ├── bash-tool.ts              # Bash tool implementation
│   └── builtin-tools.ts          # Tool assembly layer (s01: bash only)
└── cli/
    └── repl.ts                   # Interactive REPL entry point
```

## Quick Start

```bash
# Install dependencies
npm install

# Copy and fill in environment variables
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY and MODEL_ID

# Run tests
npm test

# Start REPL
npm run repl
```

## Available Scripts

| Command         | Description                 |
| --------------- | --------------------------- |
| `npm run build` | TypeScript compilation      |
| `npm run lint`  | ESLint check                |
| `npm run test`  | Run tests                   |
| `npm run repl`  | Start interactive Agent CLI |

## Branch & Stage Mapping

Each stage maps to a dedicated branch `lab/s0N-*`, strictly aligning with the [learn-claude-code](https://learn.shareai.run/zh/) curriculum examples:

| Branch            | Curriculum                  | Core Capability                                | Status     |
| ----------------- | --------------------------- | ---------------------------------------------- | ---------- |
| `lab/s01-*`       | `s01_agent_loop.py`         | While loop + bash tool + tool_result feedback  | In Progress |
| `lab/s02-*`       | `s02_tool_use.py`           | Multi-tool dispatch + file tools + path safety | In Progress |
| `lab/s03-*`       | `s03_todo_write.py`         | Explicit task state + reminder mechanism       | In Progress |
| `lab/s04-*`       | `s04_subagent.py`           | Subtask context isolation                      | Not Started |
| `lab/s05-*`       | `s05_skill_loading.py`      | On-demand skill loading                        | Not Started |
| `lab/s06-*`       | `s06_context_compact.py`    | Context compaction                             | Not Started |
| `lab/s07-*`       | `s07_task_system.py`        | Persistent task graph                          | Not Started |
| `lab/s08-*`       | `s08_background_tasks.py`   | Background execution + notification queue      | Not Started |
| `lab/s09-*`       | `s09_agent_teams.py`        | Persistent teammates + communication           | Not Started |
| `lab/s10-*`       | `s10_team_protocols.py`     | Structured negotiation protocols               | Not Started |
| `lab/s11-*`       | `s11_autonomous_agents.py`  | Idle-poll-claim cycle                          | Not Started |
| `lab/s12-*`       | `s12_worktree_task_isolation.py` | Task and directory isolation              | Not Started |

## Completed Stages

(None yet. A stage is marked complete after passing lint, build, tests, and being tagged `s0N-done`.)

## Learning Mode

- `src/` — Your own stage-by-stage implementations
- Each stage must pass validation gates before advancing to the next
