# ts-claude-code

[English](./README.en.md) | 中文

基于 [learn-claude-code](https://learn.shareai.run/zh/) 的课程，用 TypeScript 逐阶段复现一个可学习、可验证的 Agent 系统。

本仓库采用一条明确的对齐策略：

- `s01-s06` 保留仓库既有历史编号，因为它们与官网当前前六章仍基本同构
- 自 `s07` 起，后续阶段严格对齐 `2026-04-26` 检查到的官网新结构
- 不回写改名已有 `feat(s04)` / `feat(s05)` / `feat(s06)` 提交历史，只修正后续学习路线

迁移说明见：

- [docs/feat/learn-claude-code-realignment.md](./docs/feat/learn-claude-code-realignment.md)
- [docs/feat/staged-branch-workflow.md](./docs/feat/staged-branch-workflow.md)

## 当前对齐状态

当前仓库工作基线已经推进到 `s07 权限系统`，本分支开始准备 `s08 Hook 系统`：

- [docs/feat/s07-permissions-development.md](./docs/feat/s07-permissions-development.md)
- [docs/feat/s07-permissions-api-reference.md](./docs/feat/s07-permissions-api-reference.md)
- [docs/feat/s08-hooks-development.md](./docs/feat/s08-hooks-development.md)
- [docs/feat/s08-hooks-api-reference.md](./docs/feat/s08-hooks-api-reference.md)

这意味着：

- 前七阶段的主干学习闭环已经落到代码与文档
- 后续推进起点不再是旧计划里的 `s07 task system`
- 当前阶段应从 **`s08 Hook 系统`** 开始，与官网新课程继续对齐

## 当前基础结构

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

## 快速开始

```bash
npm install
cp .env.example .env
# 编辑 .env，填入 ANTHROPIC_API_KEY 和 MODEL_ID

npm test
npm run repl
```

## 可用脚本

| 命令            | 说明                 |
| --------------- | -------------------- |
| `npm run build` | TypeScript 编译      |
| `npm run lint`  | ESLint 检查          |
| `npm run test`  | 运行测试             |
| `npm run repl`  | 启动交互式 Agent CLI |

## 阶段与分支映射

### 第一段：保留既有历史编号

| 分支                 | 官网阶段         | 核心能力                             | 仓库状态 |
| -------------------- | ---------------- | ------------------------------------ | -------- |
| `lab/s01-agent-loop` | `s01 Agent 循环` | while loop + tool_result 闭环        | 已有实现 |
| `lab/s02-tool-use`   | `s02 工具使用`   | 多工具分发 + 文件工具 + 路径安全     | 已有实现 |
| `lab/s03-todo-write` | `s03 待办写入`   | 会话内 todo + active step + reminder | 已有实现 |
| `lab/s04-subagents`  | `s04 子代理`     | 子任务隔离上下文                     | 已有实现 |
| `lab/s05-skills`     | `s05 技能系统`   | 技能索引与按需加载                   | 已有实现 |
| `lab/s06-compact`    | `s06 上下文压缩` | micro/auto/manual 三层压缩           | 已有实现 |

### 第二段：自 `s07` 起按官网新结构推进

| 分支                         | 官网阶段            | 核心能力                       | 仓库状态 |
| ---------------------------- | ------------------- | ------------------------------ | -------- |
| `lab/s07-permissions`        | `s07 权限系统`      | 意图先过安全闸门               | 已完成   |
| `lab/s08-hooks`              | `s08 Hook 系统`     | 在固定时机扩展系统行为         | 当前阶段 |
| `lab/s09-memory`             | `s09 记忆系统`      | 只保存跨会话仍成立的信息       | 待开始   |
| `lab/s10-system-prompt`      | `s10 系统提示词`    | 将模型输入组装为流水线         | 待开始   |
| `lab/s11-error-recovery`     | `s11 错误恢复`      | 续写、压缩恢复、退避重试       | 待开始   |
| `lab/s12-task-system`        | `s12 任务系统`      | 持久化任务图与依赖关系         | 待开始   |
| `lab/s13-background-tasks`   | `s13 后台任务`      | 慢执行移入后台，主循环继续前进 | 待开始   |
| `lab/s14-scheduling`         | `s14 定时调度`      | 时间触发的未来工作             | 待开始   |
| `lab/s15-agent-teams`        | `s15 Agent 团队`    | 持久队友、名册、邮箱           | 待开始   |
| `lab/s16-team-protocols`     | `s16 团队协议`      | request-response 协作协议      | 待开始   |
| `lab/s17-autonomous-agents`  | `s17 自主代理`      | 空闲队友自主认领任务           | 待开始   |
| `lab/s18-worktree-isolation` | `s18 Worktree 隔离` | 独立目录与执行车道             | 待开始   |
| `lab/s19-mcp-plugins`        | `s19 MCP 与插件`    | 外部能力总线与统一路由         | 待开始   |

## 学习模式

- `src/` 只保留练习骨架与中文实现思路注释
- 每个阶段都要先完成主体功能，再补最小测试与最小约束
- 下一阶段默认从上一阶段完成标签创建，不并行跳阶段
