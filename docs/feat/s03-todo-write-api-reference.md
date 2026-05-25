# s03 接口文档：Todo Write 阶段 API 速查

## 1. 本阶段接口概览

`s03` 新增的不是 Node.js 层面的重型 API，而是一组会话内计划状态接口：

- `TodoManager.update(items)`
- `TodoManager.render()`
- `TodoManager.noteRoundWithoutUpdate()`
- `TodoManager.reminder()`
- `registerBuiltinTools()` 里的 `todo` 工具定义
- `AgentRunner` 写回模型时追加的 `TextPart`

这阶段最重要的不是“调用很多库”，而是把几种数据形状说清楚。

## 2. `todo` 工具输入结构

建议工具名：

```ts
todo
```

建议输入结构：

```ts
type TodoToolInput = {
  items: TodoItemInput[];
};

type TodoItemInput = {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
};
```

示例：

```json
{
  "items": [
    { "content": "Read failing test", "status": "completed" },
    {
      "content": "Inspect runner flow",
      "status": "in_progress",
      "activeForm": "Inspecting runner flow"
    },
    { "content": "Patch reminder logic", "status": "pending" }
  ]
}
```

本阶段建议的输入约束：

- `items.length <= 12`
- `content.trim().length > 0`
- `status` 必须在三个枚举值内
- `in_progress` 最多出现一次

## 3. `PlanItem` 与 `PlanningState`

建议内部状态定义：

```ts
type TodoStatus = "pending" | "in_progress" | "completed";

interface PlanItem {
  content: string;
  status: TodoStatus;
  activeForm: string;
}

interface PlanningState {
  items: PlanItem[];
  roundsSinceUpdate: number;
}
```

含义：

- `content`
  - 这一步要做什么
- `status`
  - 当前步骤状态
- `activeForm`
  - 当步骤正在进行时，用更自然的进行时描述
- `roundsSinceUpdate`
  - 连续多少轮过去了，模型还没有刷新当前计划

示例状态：

```ts
{
  items: [
    { content: "Read failing test", status: "completed", activeForm: "" },
    {
      content: "Inspect runner flow",
      status: "in_progress",
      activeForm: "Inspecting runner flow"
    }
  ],
  roundsSinceUpdate: 2
}
```

## 4. `TodoManager` 方法约定

### `update(items): string`

职责：

- 校验整份输入计划
- 归一化成内部状态
- 重置 `roundsSinceUpdate`
- 返回可显示给模型和终端的渲染文本

建议签名：

```ts
update(items: TodoItemInput[]): string
```

返回示例：

```text
[x] Read failing test
[>] Inspect runner flow <- Inspecting runner flow
[ ] Patch reminder logic

(1/3 completed)
```

错误示例：

```text
Error: Only one plan item can be in_progress
Error: Item 2: content required
Error: Keep the session plan short (max 12 items)
```

### `render(): string`

职责：

- 把当前计划转成稳定字符串
- 供 `tool_result`、终端输出、测试断言共用

**输出格式（严格）：**

每个计划项一行，用状态前缀标记：

| status | 前缀 | activeForm | 示例输出 |
|---|---|---|---|
| `completed` | `[x]` | 不显示 | `[x] Read failing test` |
| `in_progress` | `[>]` | 追加 ` <- {activeForm}`（仅当 activeForm 非空） | `[>] Inspect runner flow <- Inspecting runner flow` |
| `pending` | `[ ]` | 不显示 | `[ ] Patch reminder logic` |

末尾追加汇总行：`(N/M completed)`（N = completed 数量，M = 总数），前面有一个空行。

**完整示例（3 项计划，1 项完成）：**

```text
[x] Read failing test
[>] Inspect runner flow <- Inspecting runner flow
[ ] Patch reminder logic

(1/3 completed)
```

**空状态返回：**

```text
No session plan yet.
```

**关键规则：**
- 只有 `in_progress` 状态才会追加 `<- activeForm` 后缀，`completed` 和 `pending` 不追加
- `activeForm` 为空字符串时不追加后缀（即使状态是 `in_progress`）

### `noteRoundWithoutUpdate(): void`

职责：

- 在已有计划但本轮没有调用 `todo` 时递增提醒计数

### `reminder(): string | null`

职责：

- 根据当前状态决定是否产生 reminder 文本

建议返回：

```text
<reminder>Refresh your current plan before continuing.</reminder>
```

或：

```ts
null
```

触发条件建议保持最小化：

- 当前已经有计划
- `roundsSinceUpdate >= reminderInterval`

## 5. `registerBuiltinTools()` 中的 `todo` 定义

建议 schema 形状：

```ts
{
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          content: { type: "string" },
          status: {
            type: "string",
            enum: ["pending", "in_progress", "completed"]
          },
          activeForm: { type: "string" }
        },
        required: ["content", "status"]
      }
    }
  },
  required: ["items"]
}
```

handler 建议行为：

```ts
handler: async (input) => todoManager.update(readItems(input))
```

本阶段关键点：

- `builtin-tools.ts` 只负责 schema 和参数收窄
- 不把 reminder 逻辑塞进工具注册层
- 不在这里做多处重复校验

## 6. `AgentRunner` 写回消息的结构

当前仓库已经支持：

```ts
type UserContent = string | Array<ToolResultPart | TextPart>;
```

所以 `s03` 新增 reminder 时，不需要发明新协议。  
只要把 reminder 当成一个额外的 `TextPart` 插到 `tool_result` 前面即可。

建议形状：

```ts
[
  {
    type: "text",
    text: "<reminder>Refresh your current plan before continuing.</reminder>"
  },
  {
    type: "tool_result",
    toolUseId: "tool-1",
    content: "Edited src/core/agent-runner.ts"
  }
]
```

这样模型下一轮会同时看到：

- 本轮工具执行结果
- 系统补充的计划刷新提醒

## 7. REPL 侧的显示接口

`repl.ts` 当前已经消费：

```ts
type ToolExecutionEvent = {
  phase: "before" | "after";
  toolName: string;
  toolUseId: string;
  input: Record<string, unknown>;
  output: string;
  isError: boolean;
};
```

这意味着 `s03` 不需要再扩展事件协议，就已经能显示 `todo`：

- `phase === "after"` 时
- `toolName === "todo"` 时
- 直接打印 `output`

可见性原则：

- `bash` 继续显示命令和输出预览
- `todo` 显示完整计划文本
- 其他工具仍可保持静默

## 8. 本阶段最容易搞错的几点

### 1. `todo` 写的是“当前会话计划”，不是长期任务板

不要在 `s03` 的接口里引入：

- 任务 ID
- 依赖数组
- owner
- 持久化路径

### 2. reminder 是消息流补充，不是工具结果本身

如果把 reminder 混进 `tool_result.content`，语义会变脏。  
它应该是单独的 `TextPart`。

### 3. `activeForm` 只是显示辅助，不是新的状态枚举

真正状态仍然只有三种：

- `pending`
- `in_progress`
- `completed`

### 4. 计划更新建议整份重写，不做局部 patch

这能减少：

- 状态不一致
- 局部更新漏同步
- 多入口修改同一计划
