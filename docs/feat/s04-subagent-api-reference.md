# s04 阶段 API 参考文档：Subagent 子代理

## 1. 使用范围

本阶段以**架构层代码**为主，新增的 Node.js 运行时 API 依赖极少：

核心路径：
- `process.cwd()` — SubagentFactory 默认 workspaceRoot
- `Map` — ToolRegistry.filterByNames() 内部遍历父 registry 的 tools 映射
- `Set` — filterByNames() 的 whitelist 参数类型及内部查找

辅助 / 测试用途：
- 无新增

本阶段的核心工作量在**项目自定义接口**：`SubagentFactory`、`filterByNames()`、`readOptionalString()`、`registerBuiltinTools` 签名变更。这些在第 5 节之后展开。

## 2. Node.js / 运行时 API 逐项说明

### `process.cwd(): string`

作用：
- 返回 Node.js 进程的当前工作目录的绝对路径

常用形式：

```ts
// SubagentFactory 构造函数中的默认值
this.workspaceRoot = options.workspaceRoot ?? process.cwd();
```

返回值类型：

```ts
string // 绝对路径，末尾无斜杠（除根目录 "/"）
```

运行示例：

```ts
process.cwd(); // "/Users/qingcongyu/aiagents/ts-claude-code"
```

理解重点：
- 它是**运行时动态值**，可以通过 `process.chdir()` 改变，但本项目不会这么做
- 返回的是进程启动时的目录（或最后一次 `chdir` 的目录），不一定是脚本所在目录
- `__dirname` 是脚本文件的目录，`process.cwd()` 是进程的工作目录——两者经常不同
- 在 SubagentFactory 中，如果调用方传了 `workspaceRoot`，就不会走 `process.cwd()`

---

### `Map.prototype.forEach(callback): void`

作用：
- 按插入顺序遍历 Map 中的所有键值对

常用形式：

```ts
// filterByNames() 内部：遍历父 registry 的所有工具，筛选白名单中的
this.tools.forEach((tool, name) => {
  if (whitelist.has(name)) {
    result.register(tool);
  }
});
```

返回值类型：

```ts
void // forEach 不返回值，通过回调副作用操作
```

运行示例：

```ts
const m = new Map([["bash", { name: "bash" }], ["task", { name: "task" }]]);
const whitelist = new Set(["bash"]);
const result: string[] = [];
m.forEach((val, key) => {
  if (whitelist.has(key)) result.push(val.name);
});
// result → ["bash"]
```

理解重点：
- 遍历顺序**保证是插入顺序**，不像普通对象
- 回调签名是 `(value, key, map)`，注意**值在前、键在后**，和 `Array.forEach` 的 `(item, index)` 一致
- `forEach` 中不能 `break`，如需提前退出用 `for...of`

---

### `Map.prototype.keys(): IterableIterator<string>`

作用：
- 返回 Map 中所有键的迭代器

常用形式：

```ts
// 获取父 registry 的所有工具名，用于构建白名单
const allNames = new Set(this.parentToolRegistry["tools"].keys());
allNames.delete("task"); // 排除 task，得到子代理可用工具白名单
```

返回值类型：

```ts
IterableIterator<K> // K 为 Map 泛型键类型，这里是 string
```

运行示例：

```ts
const m = new Map([["bash", 1], ["read_file", 2]]);
const keys = [...m.keys()]; // ["bash", "read_file"]
```

理解重点：
- 返回的是**迭代器**，不是数组。需要 `[...iter]` 或 `Array.from()` 才能得到数组
- `new Set(map.keys())` 是快速去重并转为 Set 的常用模式

---

### `Set.prototype.has(value): boolean`

作用：
- 检查 Set 中是否包含指定值

常用形式：

```ts
// filterByNames 内部：判断工具名是否在白名单中
if (whitelist.has(name)) {
  result.register(tool);
}
```

返回值类型：

```ts
boolean
```

运行示例：

```ts
const whitelist = new Set(["bash", "read_file"]);
whitelist.has("bash");      // true
whitelist.has("task");      // false
whitelist.has("BASH");      // false — 区分大小写
```

理解重点：
- 使用 `SameValueZero` 比较（类似 `===`，但 `NaN === NaN` 为 true）
- 时间复杂度平均 O(1)，不是线性查找

---

### `Set.prototype.delete(value): boolean`

作用：
- 从 Set 中移除指定值

常用形式：

```ts
// 从所有工具名中删除 "task"，得到子代理可用工具白名单
const whitelist = new Set(allNames);
whitelist.delete("task");
```

返回值类型：

```ts
boolean // true 表示成功删除，false 表示值不存在
```

运行示例：

```ts
const s = new Set(["bash", "task"]);
s.delete("task");   // true
s.delete("missing"); // false — 静默，不报错
// s → Set { "bash" }
```

理解重点：
- 删除不存在的值不报错，返回 `false`
- 适合"复制一份白名单再排除"的模式，比 `filter` 更直观

## 3. 常见误区

- **误区 1**：认为 `filterByNames` 返回的是原 registry 的视图/引用。
  实际上它返回**全新的 ToolRegistry 实例**，后续对原 registry 的注册/删除不影响子 registry。
- **误区 2**：认为 `process.cwd()` 在子代理中会自动变成子任务的工作目录。
  实际上 `process.cwd()` 是进程级状态，子代理和父代理共享同一个值。子代理的 workspaceRoot 来自 SubagentFactory 构造时传入的值。
- **误区 3**：认为 `Map.forEach` 可以用 `break` 提前退出。
  `forEach` 中 `break`/`return` 都不能终止遍历，需要提前退出应用 `for...of`。

## 4. 本阶段必答四问

1. **参数是什么？** — `filterByNames` 接受 `Set<string>` 白名单；`runSubagent` 接受 `prompt`（必填）、`description` 和 `maxTurns`（可选）
2. **返回值类型是什么？** — `filterByNames` → 新 `ToolRegistry`；`runSubagent` → `Promise<string>`
3. **真实返回值长什么样？** — `filterByNames` 返回包含部分工具的新 registry；`runSubagent` 返回如 `"Found 3 TODO comments:\n1. src/core/agent-runner.ts:45 - TODO: add retry logic\n2. ..."`
4. **哪些边界行为最容易误解？** — whitelist 中不存在的名称静默跳过；空 whitelist 返回空 registry；子代理异常不抛出而是返回错误字符串

---

## 5. 新增类型（types.ts）

### SubagentOptions

```typescript
export interface SubagentOptions {
  prompt: string;
  description?: string;
  maxTurns?: number;
}
```

### SubagentResult

```typescript
export interface SubagentResult {
  summary: string;
}
```

**边界情况**：
- 如果 subagent 没有输出文本，`summary` 为空字符串 `""`
- 如果 subagent 因 maxTurns 超限被终止，`summary` 为最后收到的文本

---

## 6. ToolRegistry 新增方法（tool-registry.ts）

### filterByNames()

```typescript
filterByNames(whitelist: Set<string>): ToolRegistry;
```

**输入示例**：
```typescript
const whitelist = new Set(["bash", "read_file"]);
const filtered = registry.filterByNames(whitelist);
filtered.list(); // [{ name: "bash", ... }, { name: "read_file", ... }]
```

**输出示例**：
- 返回新的 `ToolRegistry` 实例
- 原始 registry 不受影响
- 如果 whitelist 中的工具名不存在于原 registry 中，静默忽略（不报错）

**边界情况**：
- 空 whitelist → 返回空 registry
- whitelist 包含不存在的名称 → 静默跳过

---

## 7. SubagentFactory（subagent-factory.ts）— 新增模块

### SubagentFactoryOptions

```typescript
export interface SubagentFactoryOptions {
  modelClient: ModelClient;
  parentToolRegistry: ToolRegistry;
  todoManager: TodoManager;
  workspaceRoot?: string;
  subagentSystemPrompt?: string;
}
```

### SubagentFactory 类

```typescript
export class SubagentFactory {
  constructor(options: SubagentFactoryOptions);

  async runSubagent(prompt: string, description?: string, maxTurns?: number): Promise<string>;
}
```

**输入示例**：
```typescript
await factory.runSubagent("Find all TODO comments in src/");
await factory.runSubagent("Fix the lint errors", "lint fix", 15);
```

**输出示例**：
```
"Found 3 TODO comments:\n1. src/core/agent-runner.ts:45 - TODO: add retry logic\n2. ..."
```

**边界情况**：
- `prompt` 为空字符串 → child agent 收到空消息，行为由模型决定
- `maxTurns` 超限 → AgentRunner 抛出 Error，被 catch 后返回错误字符串
- Child 抛出异常 → 返回 `"Error: <message>"` 形式的字符串

---

## 8. registerBuiltinTools 签名变更（builtin-tools.ts）

### 原签名（s03）

```typescript
function registerBuiltinTools(registry: ToolRegistry, todoManager: TodoManager): void;
```

### 新签名（s04）

```typescript
interface RegisterBuiltinToolsOptions {
  registry: ToolRegistry;
  todoManager: TodoManager;
  subagentFactory?: SubagentFactory;
}

function registerBuiltinTools(options: RegisterBuiltinToolsOptions): void;
```

**注意**：这是一个**签名破坏性变更**，所有调用点（repl.ts、测试）都需要更新。
由于项目处于学习阶段且只有一处调用，直接修改即可。

### task 工具定义

```typescript
{
  name: "task",
  description: "Spawn a subagent with fresh context. It shares the filesystem but not conversation history.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "The task to delegate" },
      description: { type: "string", description: "Short description of the task" }
    },
    required: ["prompt"]
  },
  handler: async (input) => {
    const prompt = readString(input, "prompt");
    const description = readOptionalString(input, "description");
    return subagentFactory.runSubagent(prompt, description ?? "subtask");
  }
}
```

**task 工具输入示例**：
```json
{ "prompt": "Analyze the codebase structure and list all modules", "description": "codebase exploration" }
```

**task 工具输出示例**：
```
"The project has the following modules:\n1. core/ - agent loop, types, tool registry\n2. tools/ - bash, file tools\n3. cli/ - REPL"
```

---

## 9. 新增辅助函数（builtin-tools.ts）

### readOptionalString()

```typescript
function readOptionalString(input: Record<string, unknown>, key: string): string | undefined;
```

**输入示例**：
```typescript
readOptionalString({ prompt: "hello" }, "description"); // undefined
readOptionalString({ prompt: "hello", description: "test" }, "description"); // "test"
readOptionalString({ prompt: "hello", description: 123 }, "description"); // throws Error
```

---

## 10. REPL 变更（cli/repl.ts）

### 变更点

1. 导入 `SubagentFactory`
2. 在 `main()` 中创建 `SubagentFactory` 实例
3. 将 `registerBuiltinTools` 调用改为 options 对象形式
4. 更新 system prompt 加上 task 工具引导
5. 更新提示符 `s03 >>` → `s04 >>`
6. 更新欢迎消息

### Parent System Prompt

```
You are a coding agent at {cwd}. Use the task tool to delegate exploration or subtasks.
```

### Subagent System Prompt

```
You are a coding subagent at {cwd}. Complete the given task, then summarize your findings.
```
