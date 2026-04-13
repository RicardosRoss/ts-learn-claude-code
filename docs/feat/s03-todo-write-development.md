# s03 阶段开发文档：Todo Write + 会话内规划

## 1. 阶段目标

在保持 `s02` 工具层可用的前提下，把当前项目推进到 `s03`：

- 增加一个会话内计划工具：`todo`
- 让模型把当前多步任务显式写成计划，而不是只放在“脑内”
- 约束同一时间最多只有一个 `in_progress` 步骤
- 如果连续多轮推进都没有刷新计划，给模型一个轻量 reminder
- 让当前计划状态在终端里可见，而不是只藏在消息历史里

这一阶段的重点不是“做一个完整任务系统”，而是先把当前会话的主线计划外显出来。

这里必须守住边界：

- 不做磁盘持久化
- 不做任务 ID / `blockedBy` / 依赖图
- 不做跨会话恢复
- 不做后台任务或多 agent 协作

这些都属于更后面的阶段，不应该提前塞进 `s03`。

## 2. 本阶段文档清单

- 开发文档：[s03-todo-write-development.md](./s03-todo-write-development.md)
- 接口文档：[s03-todo-write-api-reference.md](./s03-todo-write-api-reference.md)

从 `s02` 开始，阶段文档继续保持成对输出：

1. 开发文档讲“为什么要加、怎么拆、如何验收”
2. 接口文档讲“这阶段直接依赖什么接口、入参和返回长什么样”

## 3. 当前代码基线

以当前仓库状态看，`s03` 可以直接复用 `s02` 的主骨架：

- `src/core/agent-runner.ts`
  - 已经能循环调用模型
  - 已经能处理单轮内多个 `tool_use`
  - 已经能把执行结果包装成 `tool_result`
- `src/core/tool-registry.ts`
  - 已经是通用注册表，不需要为 `s03` 重写
- `src/tools/builtin-tools.ts`
  - 已经接好了 `bash`、`read_file`、`write_file`、`edit_file`
  - `s03` 只需要在现有注册层上再接一个 `todo`
- `src/cli/repl.ts`
  - 现在只会把 `bash` 的执行过程打印出来
  - 计划状态目前还没有终端可见性
- `src/core/types.ts`
  - 已经有 `TextPart` / `ToolResultPart`
  - 这对 reminder 注入很重要，因为提醒本质上不是工具输出，而是额外文本块

同时要注意一个容易误判的点：

- `tests/task-manager.test.ts` 虽然名字里有 task manager，但文件头已经明确标注是 `s07`
- 它讲的是更后面的持久化任务系统，不应拿来指导 `s03`

所以 `s03` 的新增状态应该是轻量会话计划，不是“提前实现一个缩水版 s07”。

## 4. 当前阶段拆解

### 第一步：先把会话计划状态独立成 `TodoManager`

建议新增：

- `src/core/todo-manager.ts`

建议把下面几类内容都收在这个文件里，而不是散到 `types.ts` 或 `agent-runner.ts`：

- `TodoStatus`
- `PlanItem`
- `PlanningState`
- `TodoManager`

`TodoManager` 最少要负责四件事：

1. 接收模型重写后的整份计划
2. 做最小合法性校验
3. 把计划渲染成稳定字符串
4. 记录“已经多少轮没有更新计划”

建议先保持和上游教学版一致的最小约束：

- 最多 `12` 条计划项
- `content` 不能为空
- `status` 只能是 `pending` / `in_progress` / `completed`
- 同一时间最多一个 `in_progress`

这里不要过度抽象。  
`s03` 的目标不是造一个通用 planner，而是做一个足够小、足够清楚、能接进主循环的状态管理器。

### 第二步：把 `todo` 工具接进 `builtin-tools`

虽然阶段文件名叫 `todo_write`，但暴露给模型的工具名仍建议保持简短的：

```ts
todo
```

原因很简单：

- 这是“当前会话计划”的写入口
- 名字短，更符合模型实际调用习惯
- 和上游教学版语义保持一致

建议输入结构：

```ts
{
  items: Array<{
    content: string;
    status: "pending" | "in_progress" | "completed";
    activeForm?: string;
  }>;
}
```

这里推荐延续教学版思路：每次整体重写当前计划，而不是做局部增删改。

这样做的好处是：

- 数据流更直接
- 校验逻辑集中
- 模型更容易在同一个工具调用里把计划状态写完整

### 第三步：在 `AgentRunner` 里接入 reminder 机制

这一阶段真正的新能力，不只是“多了一个 `todo` 工具”，而是主循环开始维护一份额外状态：

- `messages` 负责对话历史
- `planning state` 负责当前会话计划

也就是说，`AgentRunner` 需要在执行完一轮 `tool_use` 以后知道：

1. 这轮有没有用到 `todo`
2. 如果用了，重置 `roundsSinceUpdate`
3. 如果没用，递增计数
4. 如果超过阈值，而且当前确实已有计划，向下一条用户消息里插入 reminder

建议 reminder 的注入位置保持和上游一致：

- 不是加到 assistant 输出
- 不是改 system prompt
- 而是加到本轮返回模型的 `user.content[]` 里，作为一个额外 `text` part

也就是类似下面这种结构：

```ts
[
  { type: "text", text: "<reminder>Refresh your current plan before continuing.</reminder>" },
  { type: "tool_result", toolUseId: "tool-1", content: "..." }
]
```

这样做的关键好处是：

- 不改坏 `s01/s02` 的主循环结构
- reminder 只在真正需要时出现
- 模型仍然通过标准消息流收到状态提醒

### 第四步：让计划状态在 REPL 里可见

本仓库对 `s03` 的阶段描述不是“planning only”，而是：

> 任务状态外显 + 提醒机制

所以终端里至少要做到两件事：

1. 当 `todo` 工具执行完成后，把渲染后的计划打印出来
2. 把 REPL 提示从 `s02` 更新到 `s03`

当前 `repl.ts` 已经有 `onToolExecution` 钩子，不需要重新发明机制。  
只需要在现有 `printToolExecution` 里补一条分支：

- `bash` 继续按现有方式打印命令和预览输出
- `todo` 在 `after` 阶段打印当前计划内容

这样用户才能在终端里直接看到：

- 当前总共有几步
- 哪一步正在进行
- 已完成了多少

如果计划状态只存在内存里而终端看不见，那“外显”就还没完成。

### 第五步：测试只补本阶段真正需要的最小集

建议新增和修改的测试分三类：

1. `tests/todo-manager.test.ts`
   - 空计划渲染
   - 合法计划写入
   - 多个 `in_progress` 报错
   - 非法状态报错
   - 超过最大条目数报错
   - `roundsSinceUpdate` 与 reminder 行为
2. `tests/agent-runner.test.ts`
   - 一轮未调用 `todo` 时不立即提醒
   - 连续多轮未更新且已有计划时插入 reminder
   - 一旦调用 `todo`，提醒计数被重置
3. `tests/repl-smoke.test.ts`
   - 提示符从 `s02` 切到 `s03`
   - 至少保证 REPL 仍能正常退出，不被新增打印逻辑破坏

这里依然遵循当前仓库的学习模式：

- 只补 `s03` 主流程成立所需的最小测试
- 不提前扩展到依赖管理、任务编号、磁盘落盘这些后续机制

## 5. 当前推荐顺序

按现在代码结构，推荐这样推进：

1. 新建 `src/core/todo-manager.ts`，先把状态与渲染逻辑锁定
2. 在 `src/tools/builtin-tools.ts` 注册 `todo`
3. 修改 `src/core/agent-runner.ts`，接入 reminder 计数与注入
4. 修改 `src/cli/repl.ts`，把计划状态打印出来
5. 补 `tests/todo-manager.test.ts` 与相关 runner / repl 测试
6. 跑 `npm test` 与 `npm run build`
7. 最后回头同步文档中的“完成状态”

这个顺序的理由是：

- `TodoManager` 是本阶段所有行为的中心
- `builtin-tools` 只是模型入口，不应先承载状态逻辑
- reminder 机制一定要等 `todo` 状态模型确定后再接
- REPL 外显应该建立在计划渲染文本已经稳定的前提上

## 6. 当前进度判断

截至当前：

- 已完成：`lab/s03-todo-write` 分支创建与切换
- 已完成：`s03` 阶段开发文档
- 已完成：`s03` 阶段接口文档

仍未完成：

- `TodoManager` 的 TypeScript 实现
- `todo` 工具注册
- `AgentRunner` 中的 reminder 注入
- REPL 中的计划外显
- 对应测试补齐

所以当前状态应该被视为：

`s03` 的文档基线已经建立，但主体功能还没有开始实现，不能宣称阶段完成。

## 7. 验收标准

满足下面条件，才算 `s03` 主体能力完成：

1. 模型可以调用 `todo` 重写当前会话计划
2. 同一时间最多一个 `in_progress`，非法输入会返回明确错误
3. 已有计划且连续多轮未刷新时，主循环会注入 reminder
4. 一旦重新调用 `todo`，提醒计数会被重置
5. 终端里能看见当前计划状态，而不是只有 bash 输出
6. 现有 `bash` / 文件工具行为不被改坏
7. `npm test` 通过
8. `npm run build` 通过
9. 开发文档与接口文档同步更新

## 8. 本阶段最容易做错的地方

最容易偏掉的不是实现细节，而是阶段边界：

### 错误方向 1：把 `s03` 直接做成持久任务系统

如果你开始设计：

- 任务 ID
- `blockedBy`
- 落盘目录
- 任务恢复
- 依赖链清理

那你已经滑到后续阶段了。

### 错误方向 2：把 reminder 做成“全局提示词拼接器”

`s03` 需要的是轻量会话提醒，不是 prompt framework。  
当前阶段直接把 reminder 作为用户消息里的 `text` part 注回主循环，已经足够。

### 错误方向 3：为了抽象整齐，把状态拆得过散

当前阶段最应该保证的是：

- 一眼看懂计划状态放在哪
- 一眼看懂 reminder 计数在哪更新
- 一眼看懂 `todo` 工具如何改写状态

不要为了“以后可能复用”而把简单逻辑拆成过多小层。
