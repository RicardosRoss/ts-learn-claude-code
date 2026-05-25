# s07 阶段 API 参考文档：Permissions 权限系统

## 1. `PermissionManager`

**文件**: `src/core/permission-manager.ts`

最小权限决策器。它不执行工具，只负责把一次工具调用判定成：

- `allow`
- `deny`
- `ask`

---

## 2. 类型定义

### `PermissionBehavior`

```typescript
type PermissionBehavior = "allow" | "deny" | "ask";
```

### `PermissionMode`

```typescript
type PermissionMode = "default" | "plan" | "auto";
```

### `PermissionRule`

```typescript
interface PermissionRule {
  tool: string;
  behavior: PermissionBehavior;
  path?: string;
  content?: string;
}
```

**字段说明**:

- `tool`: 规则作用到哪个工具名
- `behavior`: 命中后的行为
- `path`: 仅当输入里存在 `file_path` 或 `path` 字段时参与匹配
- `content`: 仅当输入里存在 `command` 或 `content` 字段时参与匹配

### `PermissionDecision`

```typescript
interface PermissionDecision {
  behavior: PermissionBehavior;
  reason: string;
}
```

**返回值的精确格式**:

- `behavior` 只能是 `"allow"` / `"deny"` / `"ask"`
- `reason` 必须是单行字符串
- 本阶段不额外返回嵌套对象

示例：

```json
{ "behavior": "deny", "reason": "matched deny rule (bash content: sudo *)" }
```

### `PermissionCheckContext`

```typescript
interface PermissionCheckContext {
  toolName: string;
  input: Record<string, unknown>;
  mode: PermissionMode;
  allowRules: PermissionRule[];
  denyRules: PermissionRule[];
  readOnlyTools: Set<string>;
  writeTools: Set<string>;
  toolPolicies: Map<string, PermissionToolPolicy>;
}
```

这是每个权限检查步骤共享的上下文。它把当前工具调用、session mode、显式规则、工具集合和策略表放在同一个对象里。

### `PermissionCheck`

```typescript
type PermissionCheck = (context: PermissionCheckContext) => PermissionDecision | null;
```

返回 `PermissionDecision` 表示该步骤已经给出结论；返回 `null` 表示继续执行后续检查。

### `PermissionToolPolicy`

```typescript
type PermissionToolPolicy = (context: PermissionCheckContext) => PermissionDecision | null;
```

单个工具的策略函数。当前默认策略只给只读工具注册自动放行策略。

---

## 3. 构造函数

```typescript
constructor(options?: PermissionManagerOptions)
```

### `PermissionManagerOptions`

```typescript
interface PermissionManagerOptions {
  mode?: PermissionMode;
  allowRules?: PermissionRule[];
  denyRules?: PermissionRule[];
  readOnlyTools?: Set<string>;
  writeTools?: Set<string>;
  toolPolicies?: Map<string, PermissionToolPolicy>;
}
```

### 行为说明

- `mode` 默认值：`"default"`
- `allowRules` 默认值：空数组
- `denyRules` 默认值：

```typescript
[
  { tool: "bash", behavior: "deny", content: "sudo " },
  { tool: "write_file", behavior: "deny", path: ".git/" },
  { tool: "edit_file", behavior: "deny", path: ".git/" }
]
```

- `readOnlyTools` 默认值：

```typescript
new Set(["read_file", "todo", "load_skill", "compact"])
```

- `writeTools` 默认值：

```typescript
new Set(["write_file", "edit_file", "bash"])
```

- `toolPolicies` 默认值：由 `readOnlyTools` 生成，默认给 `read_file`、`todo`、`load_skill`、`compact` 注册 `allowReadOnlyTool`
- 传入 `toolPolicies` 时，会覆盖或补充默认策略表里的同名工具策略

### 边界情况

- 不传 `options` 时，使用默认 mode、默认工具集合、默认 deny rules 和默认只读工具策略表
- 即使 `allowRules` / `denyRules` 为空，`check()` 也必须返回合法的 `PermissionDecision`
- 如果传入空的 `denyRules: []`，会替换默认 deny rules

### 所用 Node.js 方法

本构造函数**不依赖 Node.js 标准库方法**。  
它只保存内存中的配置对象，不执行 I/O。

---

## 4. `check(toolName: string, input: Record<string, unknown>): PermissionDecision`

对一次工具调用做权限判定。

### 参数

- `toolName: string` — 工具名，例如 `read_file`
- `input: Record<string, unknown>` — 工具输入对象

### 决策顺序

1. 先检查 `denyRules`
2. 再检查当前 `mode`
3. 再检查 `toolPolicies`
4. 再检查 `allowRules`
5. 都没命中时，返回 `ask`

### 返回值的精确格式

返回值始终是：

```typescript
{
  behavior: "allow" | "deny" | "ask",
  reason: string
}
```

不会返回 `null`、不会抛异常、不会返回布尔值。

### 推荐返回 reason 文本格式

#### deny

```text
matched deny rule (bash content: sudo *)
```

或：

```text
plan mode blocks write tool: write_file
```

#### allow

```text
matched allow rule (tool: read_file)
```

#### ask

```text
requires confirmation: write_file
```

### 输入/输出示例

```typescript
// 1. deny rule 命中
permissionManager.check("bash", { command: "sudo rm -rf /tmp/demo" })
// -> { behavior: "deny", reason: "matched deny rule (bash content: sudo *)" }

// 2. plan mode 阻止写操作
permissionManager.check("write_file", { path: "src/app.ts", content: "hello" })
// -> { behavior: "deny", reason: "plan mode blocks write tool: write_file" }

// 3. 默认只读工具策略放行
permissionManager.check("read_file", { path: "README.md" })
// -> { behavior: "allow", reason: "matched allow rule (tool: read_file)" }

// 4. 默认灰区走 ask
permissionManager.check("edit_file", {
  path: "src/app.ts",
  old_text: "foo",
  new_text: "bar"
})
// -> { behavior: "ask", reason: "requires confirmation: edit_file" }

// 5. 自定义工具策略覆盖默认只读放行
const permissionManager = new PermissionManager({
  toolPolicies: new Map([
    [
      "read_file",
      () => ({ behavior: "ask", reason: "custom read policy" })
    ]
  ])
});
permissionManager.check("read_file", { path: "README.md" })
// -> { behavior: "ask", reason: "custom read policy" }
```

### 边界情况

- `input` 为空对象时也必须正常返回决策
- 工具名未知时建议返回：

```json
{ "behavior": "ask", "reason": "requires confirmation: unknown tool <name>" }
```

- 如果规则里声明了 `path`，但 `input.file_path` 和 `input.path` 都不是字符串，则该规则视为未命中，不抛异常
- 如果规则里声明了 `content`，但 `input.command` / `input.content` 都不是字符串，则该规则视为未命中，不抛异常
- `mode: "auto"` 当前没有额外分支，行为与 `default` 一样依赖 deny rules、tool policies、allow rules 和 default ask
- `mode: "plan"` 会在 `toolPolicies` 之前拒绝 `writeTools` 中的工具

### 所用 Node.js 方法

本函数**不依赖 Node.js 标准库方法**。  
它只做内存中的字符串匹配和集合判断。

---

## 5. `matchesRule(rule: PermissionRule, toolName: string, input: Record<string, unknown>): boolean`

内部辅助函数。用于判断一条规则是否命中当前工具调用。

### 推荐匹配语义

- `rule.tool` 必须与 `toolName` 完全相等
- `rule.path` 存在时，先取 `input.file_path`，不存在时再取 `input.path`；取到的值必须是字符串并且 `includes(rule.path)`
- `rule.content` 存在时：
  - 若规则是 `{ tool: "bash", content: "sudo " }`，则要求 `input.command.trimStart().startsWith("sudo ")`
  - 其它规则先取 `input.command`，不存在时再取 `input.content`；取到的值必须是字符串并且 `includes(rule.content)`
- `path` 与 `content` 同时存在时，两者都要命中

### 输入/输出示例

```typescript
matchesRule(
  { tool: "bash", behavior: "deny", content: "sudo " },
  "bash",
  { command: "sudo npm install" }
)
// -> true

matchesRule(
  { tool: "bash", behavior: "deny", content: "sudo " },
  "bash",
  { command: "echo sudo ls" }
)
// -> false

matchesRule(
  { tool: "write_file", behavior: "deny", path: ".git/" },
  "write_file",
  { path: "src/app.ts", content: "x" }
)
// -> false
```

### 边界情况

- `toolName` 不相等时立即返回 `false`
- 没有 `path` 和 `content` 的规则，只要工具名相等就命中
- `bash` 的 `sudo ` deny 规则只匹配去掉左侧空白后的命令开头，不匹配命令中间的 `sudo`
- `file_path` 和 `path` 都不存在时，带 `path` 的规则不命中

### 所用 Node.js 方法

本函数**不依赖 Node.js 标准库方法**。

---

## 6. `AgentRunner` 集成变更

**文件**: `src/core/agent-runner.ts`

### `AgentRunnerOptions` 新字段

```typescript
interface AgentRunnerOptions {
  // ... s06 已有字段
  permissionManager?: PermissionManager;
  requestPermission?: (request: PermissionRequest) => Promise<boolean> | boolean;
}
```

### `PermissionRequest`

```typescript
interface PermissionRequest {
  toolName: string;
  toolUseId: string;
  input: Record<string, unknown>;
  reason: string;
}
```

### `requestPermission` 的返回值格式

- 返回 `true`：允许继续执行真实 tool handler
- 返回 `false` 或其它非 `true` 值：拒绝执行
- 如果该回调不存在，而 `decision.behavior === "ask"`，当前实现会把 `approved` 视为 `undefined`，因此直接拒绝

### `executeTool()` 的精确返回文本

#### deny

```typescript
{
  type: "tool_result",
  toolUseId: block.id,
  content: `Permission denied: ${decision.reason}`
}
```

#### ask 且用户拒绝

```typescript
{
  type: "tool_result",
  toolUseId: block.id,
  content: `Permission denied by user: ${decision.reason}`
}
```

#### allow 或 ask 且用户允许

返回真实工具执行结果：

```typescript
{
  type: "tool_result",
  toolUseId: block.id,
  content: toolResult
}
```

### 输入/输出示例

```typescript
// deny
// -> { type: "tool_result", toolUseId: "toolu_01", content: "Permission denied: matched deny rule (bash content: sudo *)" }

// ask + reject
// -> { type: "tool_result", toolUseId: "toolu_02", content: "Permission denied by user: requires confirmation: edit_file" }

// allow
// -> { type: "tool_result", toolUseId: "toolu_03", content: "Wrote /project/src/app.ts" }
```

### 边界情况

- 工具不存在时，仍保持原有 `"Unknown tool: <name>"` 行为
- 权限系统不应该吞掉真实工具异常；工具异常仍沿用原有：

```text
Error: <message>
```

### 所用 Node.js 方法

`executeTool()` 本身**不新增 Node.js 标准库方法**。  
它只是新增一层权限决策与回调分支。

---

## 7. `requestPermissionFromUser()` 推荐形态

**文件**: `src/cli/repl.ts`

当前实现把确认函数放在 `src/cli/permission-prompt.ts`，REPL 只负责传入 `readline` 和 `stdout`：

```typescript
async function requestPermissionFromUser(
  rl: PermissionPromptReadline,
  output: PermissionPromptOutput,
  request: PermissionPromptRequest
): Promise<boolean>
```

### `PermissionPromptRequest`

```typescript
interface PermissionPromptRequest {
  toolName: string;
  reason: string;
  input: Record<string, unknown>;
}
```

### 精确 I/O 约定

打印提示：

```text
Permission required: write_file (requires confirmation: write_file)
{
  "path": "src/app.ts"
}
Allow this tool call? [y/N]
```

最后一行源码里的 prompt 字符串在 `]` 后还有一个空格，用来把光标和提示文本隔开。

#### 用户输入 `y` 或 `yes`

返回：

```typescript
true
```

#### 用户输入其它内容，或直接回车

返回：

```typescript
false
```

### 输入/输出示例

```typescript
await requestPermissionFromUser(rl, output, {
  toolName: "write_file",
  reason: "requires confirmation: write_file",
  input: { path: "src/app.ts" }
})
// 用户输入: y
// -> true

await requestPermissionFromUser(rl, output, {
  toolName: "bash",
  reason: "requires confirmation: bash",
  input: { command: "npm publish" }
})
// 用户直接回车
// -> false
```

### 边界情况

- 大小写不敏感，`Y` / `YES` 也视为允许
- 读到 EOF 或 readline 已关闭时，返回 `false`
- `question()` 抛出非 readline 关闭错误时，继续向外抛出，不吞掉未知异常
- `request.input` 会用 `JSON.stringify(request.input, null, 2)` 完整打印

### 所用 Node.js 方法

#### `readline.Interface.question(prompt)`

- **作用**: 在终端打印提示并等待用户输入
- **参数**:
  - `prompt: string` — 要显示的提示文本
- **返回值**: `Promise<string>` — 用户输入内容
- **举例场景**: `await rl.question("Allow this tool call? [y/N] ")`

#### `process.stdout.write(text)`

- **作用**: 向标准输出直接写文本
- **参数**:
  - `text: string` — 输出内容
- **返回值**: `boolean`
- **举例场景**: 打印权限说明和 reason

---

## 8. 这一阶段不应出现的 API 设计

- 不要把权限结果设计成布尔值
- 不要把用户确认逻辑塞进 `PermissionManager`
- 不要在 `check()` 里直接执行工具
- 不要在 `s07` 提前做持久化规则数据库

## 9. 一句话结论

`s07` 的 API 重点不是“更多工具”，而是：

**给所有现有工具执行路径前面插入一层可解释的 `PermissionDecision`。**
