# ts-claude-code

[English](./README.en.md) | 中文

基于 [learn-claude-code](https://learn.shareai.run/zh/) 的 `s01-s12` 课程，用 TypeScript 逐步复现一个完整的 AI Agent 架构。每个阶段严格对齐原课程能力，不超前开发。

## 当前阶段：s02 — Tool Use + 文件工具

阶段开发文档：

- [docs/feat/s02-tool-use-development.md](./docs/feat/s02-tool-use-development.md)
- [docs/feat/s02-tool-use-api-reference.md](./docs/feat/s02-tool-use-api-reference.md)

在保留 `s01` 主循环不变的前提下，引入多工具分发、文件工具和路径安全。

## 当前基础结构（继承自 s01）

```
src/
├── core/
│   ├── types.ts                  # 运行时协议类型
│   ├── tool-registry.ts          # 工具注册表
│   ├── anthropic-model-client.ts # Anthropic 兼容模型客户端
│   └── agent-runner.ts           # Agent 主循环
├── tools/
│   ├── bash-tool.ts              # Bash 工具实现
│   └── builtin-tools.ts          # 工具装配层（s01 仅注册 bash）
└── cli/
    └── repl.ts                   # 交互式 REPL 入口
```

## 快速开始

```bash
# 安装依赖
npm install

# 复制并填写环境变量
cp .env.example .env
# 编辑 .env，填入 ANTHROPIC_API_KEY 和 MODEL_ID

# 运行测试
npm test

# 启动 REPL
npm run repl
```

## 可用脚本

| 命令            | 说明                 |
| --------------- | -------------------- |
| `npm run build` | TypeScript 编译      |
| `npm run lint`  | ESLint 检查          |
| `npm run test`  | 运行测试             |
| `npm run repl`  | 启动交互式 Agent CLI |

## 分支与阶段对应

每个阶段对应一个独立分支 `lab/s0N-*`，严格对齐 [learn-claude-code](https://learn.shareai.run/zh/) 的原课程示例：

| 分支              | 对应课程                    | 核心能力                                  | 状态       |
| ----------------- | --------------------------- | ----------------------------------------- | ---------- |
| `lab/s01-*`       | `s01_agent_loop.py`         | while 循环 + bash 工具 + tool_result 反馈 | 进行中     |
| `lab/s02-*`       | `s02_tool_use.py`           | 多工具分发 + 文件工具 + 路径安全          | 进行中     |
| `lab/s03-*`       | `s03_todo_write.py`         | 任务状态外显 + 提醒机制                   | 未开始     |
| `lab/s04-*`       | `s04_subagent.py`           | 子任务上下文隔离                          | 未开始     |
| `lab/s05-*`       | `s05_skill_loading.py`      | 按需技能加载                              | 未开始     |
| `lab/s06-*`       | `s06_context_compact.py`    | 上下文压缩                                | 未开始     |
| `lab/s07-*`       | `s07_task_system.py`        | 持久化任务图                              | 未开始     |
| `lab/s08-*`       | `s08_background_tasks.py`   | 后台执行 + 通知队列                       | 未开始     |
| `lab/s09-*`       | `s09_agent_teams.py`        | 持久队友 + 通信                           | 未开始     |
| `lab/s10-*`       | `s10_team_protocols.py`     | 结构化协商协议                            | 未开始     |
| `lab/s11-*`       | `s11_autonomous_agents.py`  | 自治轮询 + 任务认领                       | 未开始     |
| `lab/s12-*`       | `s12_worktree_task_isolation.py` | 任务与目录隔离                       | 未开始     |

## 已完成阶段

（暂无。每个阶段通过 lint、build、测试并打标签 `s0N-done` 后计入。）

## 学习模式

- `src/` — 自己动手实现的阶段代码
- 每个阶段通过验收门槛后才进入下一阶段
