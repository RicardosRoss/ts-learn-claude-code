# s08 阶段 API 参考文档：Hooks Hook 系统

## 1. `HookRunner`

**文件**: `src/core/hook-runner.ts`

最小 Hook 调度器。它不执行工具、不做权限判断，只负责把固定事件交给注册的 hook handler，并返回统一的 `HookResult`。

---

## 2. 类型定义

### `HookEventName`

```typescript
type HookEventName = "SessionStart" | "PreToolUse" | "PostToolUse";
```

### `HookPayloadMap`

```typescript
interface HookPayloadMap {
  SessionStart: {
    cwd: string;
  };
  PreToolUse: {
    toolName: string;
    toolUseId: string;
    input: Record<string, unknown>;
  };
  PostToolUse: {
    toolName: string;
    toolUseId: string;
    input: Record<string, unknown>;
    output: string;
    isError: boolean;
  };
}
```

### `HookEvent`

```typescript
type HookEvent<N extends HookEventName = HookEventName> = {
  name: N;
  payload: HookPayloadMap[N];
};
```

**返回值的精确格式**:

`HookEvent` 本身不是函数返回值，但所有 handler 都接收这个结构。它必须包含：

- `name`: 三个事件名之一
- `payload`: 与 `name` 精确对应的上下文字段

示例：

```json
{
  "name": "PreToolUse",
  "payload": {
    "toolName": "bash",
    "toolUseId": "toolu_01",
    "input": { "command": "npm test" }
  }
}
```

### `HookResult`

```typescript
interface HookResult {
  exitCode: 0 | 1 | 2;
  message: string;
}
```

**返回值的精确格式**:

- `exitCode` 只能是 `0` / `1` / `2`
- `message` 必须是字符串
- `exitCode: 0` 时 `message` 应为空字符串
- `exitCode: 1` 时 `message` 是要注入给模型的 warning
- `exitCode: 2` 时 `message` 是要注入给模型的 note

示例：

```json
{ "exitCode": 0, "message": "" }
```

```json
{ "exitCode": 1, "message": "bash command is not allowed by hook" }
```

```json
{ "exitCode": 2, "message": "prefer read_file before edit_file" }
```

### `HookHandler`

```typescript
type HookHandler<N extends HookEventName = HookEventName> = (
  event: HookEvent<N>
) => HookResult | Promise<HookResult>;
```

### `HookRunnerOptions`

```typescript
interface HookRunnerOptions {
  handlers?: Partial<{
    [N in HookEventName]: Array<HookHandler<N>>;
  }>;
}
```

### 边界情况

- 没有注册 handler 的事件必须正常返回 continue 结果
- handler 可以同步返回，也可以异步返回
- handler 抛错时，本阶段建议返回 `exitCode: 1`，把错误包装成 warning

### 所用 Node.js 方法

这些类型定义**不依赖 Node.js 标准库方法**。  
它们只描述 TypeScript 层面的事件、payload 和返回协议。

---

## 3. 构造函数

```typescript
constructor(options?: HookRunnerOptions)
```

### 参数

- `options.handlers`: 可选的事件到 handler 列表映射

### 返回值

构造函数返回一个 `HookRunner` 实例。

### 输入/输出示例

```typescript
const hookRunner = new HookRunner({
  handlers: {
    SessionStart: [() => ({ exitCode: 2, message: "Welcome to s08 hooks." })],
    PreToolUse: [
      (event) =>
        event.payload.toolName === "bash"
          ? { exitCode: 2, message: "Running bash through hook pipeline." }
          : { exitCode: 0, message: "" }
    ]
  }
});
```

### 边界情况

- 不传 `options` 时，所有事件都没有 handler
- `handlers` 里只配置部分事件时，其它事件仍按空 handler 处理
- 构造函数不应该执行 handler

### 所用 Node.js 方法

本构造函数**不依赖 Node.js 标准库方法**。  
它只保存内存中的 handler 映射。

---

## 4. `run<N extends HookEventName>(eventName: N, payload: HookPayloadMap[N]): Promise<HookResult>`

按事件名执行对应的一组 handler。

### 参数

- `eventName`: 当前事件名，只能是 `"SessionStart"` / `"PreToolUse"` / `"PostToolUse"`
- `payload`: 当前事件上下文，字段必须与事件名对应

### 执行顺序

1. 从内部映射中取出 `eventName` 对应的 handler 列表
2. 如果列表为空，直接返回 continue
3. 按注册顺序依次调用 handler
4. 如果某个 handler 返回 `exitCode: 1` 或 `exitCode: 2`，立即返回该结果
5. 所有 handler 都返回 `exitCode: 0` 时，返回 `{ exitCode: 0, message: "" }`

### 返回值的精确格式

返回值始终是：

```typescript
{
  exitCode: 0 | 1 | 2;
  message: string;
}
```

不会返回 `null`、不会返回布尔值、不会直接返回 handler 数组。

### 输入/输出示例

```typescript
await hookRunner.run("SessionStart", {
  cwd: "/project"
});
// -> { exitCode: 2, message: "Welcome to s08 hooks." }
```

```typescript
await hookRunner.run("PreToolUse", {
  toolName: "bash",
  toolUseId: "toolu_01",
  input: { command: "npm test" }
});
// -> { exitCode: 2, message: "Running bash through hook pipeline." }
```

```typescript
await hookRunner.run("PostToolUse", {
  toolName: "read_file",
  toolUseId: "toolu_02",
  input: { path: "README.md" },
  output: "file content",
  isError: false
});
// -> { exitCode: 0, message: "" }
```

### 边界情况

- `payload.input` 是空对象时也必须正常传给 handler
- `PostToolUse.output` 是空字符串时也必须正常传给 handler
- `PostToolUse.isError` 为 `true` 时，不代表 HookRunner 抛错，只代表工具执行结果是错误
- handler 返回 `exitCode: 2` 但 `message` 为空字符串时，本阶段建议仍按 inject 处理，但注入文本为空

### 所用 Node.js 方法

本函数**不依赖 Node.js 标准库方法**。  
它只做内存中的数组遍历和 async 调用。

---

## 5. `AgentRunner` 集成变更

**文件**: `src/core/agent-runner.ts`

### `AgentRunnerOptions` 新字段

```typescript
interface AgentRunnerOptions {
  // ... s07 已有字段
  hookRunner?: HookRunner;
}
```

### `SessionStart`

建议在 `run()` 进入主循环前触发一次：

```typescript
await hookRunner.run("SessionStart", {
  cwd: workspaceRoot
});
```

#### 返回值处理

- `exitCode: 0`: 不改动消息，直接进入主循环
- `exitCode: 1`: 把 `message` 追加为一条用户侧 warning，再进入主循环
- `exitCode: 2`: 把 `message` 追加为一条用户侧 note，再进入主循环

#### 输入/输出示例

```typescript
// hook result:
{ exitCode: 2, message: "Use hooks to observe tool execution." }

// messages append:
{ role: "user", content: "Hook note from SessionStart: Use hooks to observe tool execution." }
```

### `PreToolUse`

建议在权限检查通过后、真实工具执行前触发：

```typescript
await hookRunner.run("PreToolUse", {
  toolName: block.name,
  toolUseId: block.id,
  input: block.input
});
```

#### 返回值处理

##### `exitCode: 1`

追加 warning，然后继续真实工具执行：

```text
Hook warning from PreToolUse: <message>
```

##### `exitCode: 2`

先记录补充消息：

```text
Hook note from PreToolUse: <message>
```

然后继续进入真实工具执行。

##### `exitCode: 0`

不做额外处理，继续进入真实工具执行。

### `PostToolUse`

建议在真实工具执行完成后触发：

```typescript
await hookRunner.run("PostToolUse", {
  toolName: block.name,
  toolUseId: block.id,
  input: block.input,
  output: toolResult,
  isError: false
});
```

#### 返回值处理

- `exitCode: 0`: 返回原始工具结果
- `exitCode: 1`: 本阶段不重写已经完成的工具结果，追加说明 `Hook warning from PostToolUse: <message>`
- `exitCode: 2`: 追加说明 `Hook note from PostToolUse: <message>`

### 边界情况

- 没有传 `hookRunner` 时，`AgentRunner` 行为必须与 s07 一致
- 权限拒绝后，不应该继续触发 `PreToolUse`
- `PreToolUse` 不负责阻止真实 handler；是否允许调用工具只由权限系统决定
- 未知工具仍保持原有 `"Unknown tool: <name>"` 行为
- 工具 handler 抛错时，仍返回原有 `Error: <message>`，再把 `isError: true` 交给 `PostToolUse`

### 所用 Node.js 方法

`AgentRunner` 的 Hook 接入本身**不新增 Node.js 标准库方法**。  
它复用已有执行上下文中的 `workspaceRoot`，并在已有 async 主循环里调用 `HookRunner.run()`。

---

## 6. `REPL` 集成变更

**文件**: `src/cli/repl.ts`

### 推荐装配形态

```typescript
const hookRunner = new HookRunner({
  handlers: {
    SessionStart: [() => ({ exitCode: 2, message: "s08 hook system ready." })],
    PostToolUse: [
      (event) =>
        event.payload.isError
          ? { exitCode: 2, message: `${event.payload.toolName} returned an error.` }
          : { exitCode: 0, message: "" }
    ]
  }
});
```

### 精确 I/O 约定

启动提示从：

```text
s07> real model ready. Type `exit` to quit.
```

改成：

```text
s08> real model ready. Type `exit` to quit.
```

输入提示从：

```text
s07 >>
```

改成：

```text
s08 >>
```

### 边界情况

- Hook 示例输出不能替代真实模型输出
- Hook 示例 handler 不应该写文件或执行 shell
- 权限确认仍由 s07 的 `requestPermissionFromUser()` 负责

### 所用 Node.js 方法

#### `readline.createInterface(options)`

- **作用**: 创建终端交互接口
- **参数**:
  - `options.input`: 输入流，当前使用 `process.stdin`
  - `options.output`: 输出流，当前使用 `process.stdout`
- **返回值**: `readline.Interface`
- **举例场景**: REPL 启动时创建 `rl`，s08 只是在同一入口旁边装配 `HookRunner`

#### `readline.Interface.question(prompt)`

- **作用**: 打印提示并等待用户输入
- **参数**:
  - `prompt: string` — 例如 `"s08 >> "`
- **返回值**: `Promise<string>` — 用户输入内容
- **举例场景**: 继续读取用户消息，同时保留 s07 的权限确认能力

#### `process.stdout.write(text)`

- **作用**: 向标准输出写文本
- **参数**:
  - `text: string` — 要输出的内容
- **返回值**: `boolean`
- **举例场景**: 打印 `s08> real model ready. Type \`exit\` to quit.`

#### `process.cwd()`

- **作用**: 返回当前 Node.js 进程工作目录
- **参数**: 无
- **返回值**: `string`
- **举例场景**: 构造 `SessionStart` 的 `cwd` payload，以及继续生成系统提示中的项目路径

---

## 7. 这一阶段不应出现的 API 设计

- 不要把 Hook 结果设计成布尔值
- 不要让 HookRunner 直接执行工具
- 不要让 HookRunner 直接做权限确认
- 不要在 `s08` 引入持久化 hook 配置
- 不要在教学版里为每种事件都设计不同返回协议

## 8. 一句话结论

`s08` 的 API 重点不是“更多工具”或“更复杂权限”，而是：

**给主循环增加一组稳定扩展点，并用统一的 `HookResult` 表达继续、warning 和 note。**
