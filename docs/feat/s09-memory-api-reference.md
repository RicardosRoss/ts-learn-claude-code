# s09 阶段 API 参考文档：Memory 记忆系统

## 1. `MemoryStore`

**文件**: `src/core/memory-store.ts`

最小长期记忆存储器。它不负责判断当前任务进度、不替代读取代码，只负责把明确值得跨会话保留的信息保存到 `.memory/`，并在新会话开始时重新加载。

---

## 2. 类型定义

### `MemoryType`

```typescript
type MemoryType = "user" | "feedback" | "project" | "reference";
```

### `MemoryEntry`

```typescript
interface MemoryEntry {
  name: string;
  description: string;
  type: MemoryType;
  content: string;
}
```

**字段含义**:

- `name`: memory 的稳定短名，会被转换为文件名
- `description`: 一句话说明，用于索引和 memory section
- `type`: 四种类型之一
- `content`: 正文，保存真正需要跨会话留下的信息

### `SavedMemory`

```typescript
interface SavedMemory extends MemoryEntry {
  filePath: string;
}
```

**返回值的精确格式**:

- 包含原始 `MemoryEntry` 的四个字段
- 额外包含 `filePath`
- `filePath` 是写入后的绝对路径或 workspace 相对路径，本阶段建议使用绝对路径便于测试断言

示例：

```json
{
  "name": "prefer_chinese_short_answer",
  "description": "User prefers concise Chinese answers",
  "type": "user",
  "content": "The user prefers concise Chinese answers.",
  "filePath": "/repo/.memory/prefer_chinese_short_answer.md"
}
```

### `MemoryStoreOptions`

```typescript
interface MemoryStoreOptions {
  memoryDir: string;
}
```

### 边界情况

- `name` 为空字符串时应拒绝
- `description` 为空字符串时应拒绝
- `content` 为空字符串时应拒绝
- `type` 不是四种合法类型时应拒绝
- `name` 里出现 `/`、`..`、空格或特殊字符时必须规范化为 safe filename

### 所用 Node.js 方法

这些类型定义本身**不依赖 Node.js 标准库方法**。  
它们只描述 TypeScript 层面的输入、输出和构造选项。

---

## 3. 构造函数

```typescript
constructor(options: MemoryStoreOptions)
```

### 参数

- `options.memoryDir`: memory 根目录，推荐为 `path.resolve(workspaceRoot, ".memory")`

### 返回值

构造函数返回一个 `MemoryStore` 实例。

### 输入/输出示例

```typescript
const memoryStore = new MemoryStore({
  memoryDir: path.resolve(workspaceRoot, ".memory")
});
```

### 边界情况

- 构造函数不应立即写文件
- `memoryDir` 可以暂时不存在，由保存或加载函数按需创建

### 所用 Node.js 方法

本构造函数不直接依赖 Node.js 标准库方法。  
调用方通常会用 `path.resolve(workspaceRoot, ".memory")` 生成传入路径。

#### `path.resolve(...paths)`

- **作用**: 把多个路径片段解析为绝对路径
- **参数**: `...paths: string[]`，例如 `workspaceRoot` 和 `".memory"`
- **返回值**: `string`，绝对路径
- **举例场景**: REPL 中把 memory 目录固定在当前 workspace 下

---

## 4. `saveMemory(entry: MemoryEntry): Promise<SavedMemory>`

保存一条 memory，并重建索引文件。

### 参数

- `entry.name`: 稳定短名
- `entry.description`: 索引用一句话说明
- `entry.type`: `"user"` / `"feedback"` / `"project"` / `"reference"`
- `entry.content`: 正文

### 执行顺序

1. 校验 `entry`
2. 将 `entry.name` 转成 safe filename
3. 确保 `.memory/` 目录存在
4. 写入 `.memory/<safe-name>.md`
5. 重新扫描 memory 文件并生成 `.memory/MEMORY.md`
6. 返回 `SavedMemory`

### 返回值的精确格式

```typescript
{
  name: string;
  description: string;
  type: MemoryType;
  content: string;
  filePath: string;
}
```

### 写入文件的精确格式

```markdown
---
name: <name>
description: <description>
type: <type>
---

<content>
```

### 输入/输出示例

```typescript
await memoryStore.saveMemory({
  name: "review_tests_first",
  description: "Run tests before review conclusions",
  type: "feedback",
  content: "When reviewing completed code, run targeted tests before giving a verdict."
});
```

返回：

```json
{
  "name": "review_tests_first",
  "description": "Run tests before review conclusions",
  "type": "feedback",
  "content": "When reviewing completed code, run targeted tests before giving a verdict.",
  "filePath": "/repo/.memory/review_tests_first.md"
}
```

### 边界情况

- `name: "../secret"` 应保存为类似 `secret.md`，不能写出 `.memory/`
- 重名 memory 本阶段可以覆盖同名文件
- 覆盖后必须重建索引
- 非法 `type` 应抛出错误，例如 `Invalid memory type: task`

### 所用 Node.js 方法

#### `fs.promises.mkdir(path, options)`

- **作用**: 创建目录
- **参数**:
  - `path: string` — 要创建的目录路径
  - `options.recursive: boolean` — 为 `true` 时允许多级目录已存在
- **返回值**: `Promise<string | undefined>`
- **举例场景**: `await mkdir(memoryDir, { recursive: true })`

#### `fs.promises.writeFile(file, data, options?)`

- **作用**: 写入文本文件
- **参数**:
  - `file: string` — 目标文件路径
  - `data: string` — Markdown 文件内容
  - `options.encoding` — 当前建议使用 `"utf-8"`
- **返回值**: `Promise<void>`
- **举例场景**: 写入 `.memory/review_tests_first.md` 和 `.memory/MEMORY.md`

#### `path.join(...paths)`

- **作用**: 拼接路径片段
- **参数**: `...paths: string[]`
- **返回值**: `string`
- **举例场景**: `path.join(memoryDir, `${safeName}.md`)`

---

## 5. `listMemories(): Promise<SavedMemory[]>`

读取 `.memory/` 下所有单条 memory 文件。

### 参数

无。

### 返回值的精确格式

返回数组：

```typescript
Array<{
  name: string;
  description: string;
  type: MemoryType;
  content: string;
  filePath: string;
}>;
```

数组排序必须稳定，本阶段建议按 `name` 字典序排序。

### 输入/输出示例

```typescript
await memoryStore.listMemories();
```

返回：

```json
[
  {
    "name": "prefer_chinese_short_answer",
    "description": "User prefers concise Chinese answers",
    "type": "user",
    "content": "The user prefers concise Chinese answers.",
    "filePath": "/repo/.memory/prefer_chinese_short_answer.md"
  }
]
```

### 边界情况

- `.memory/` 不存在时返回 `[]`
- `MEMORY.md` 是索引文件，不应作为单条 memory 返回
- 非 `.md` 文件应跳过
- frontmatter 缺字段的文件应跳过或抛错；本阶段建议抛错，避免静默污染

### 所用 Node.js 方法

#### `fs.promises.readdir(path, options?)`

- **作用**: 枚举目录内容
- **参数**:
  - `path: string` — 目录路径
  - `options.withFileTypes?: boolean` — 如果为 `true`，返回 `Dirent[]`
- **返回值**: `Promise<string[]>` 或 `Promise<Dirent[]>`
- **举例场景**: 找出 `.memory/` 下的 `.md` 文件

#### `fs.promises.readFile(path, options?)`

- **作用**: 读取文件内容
- **参数**:
  - `path: string` — 文件路径
  - `options.encoding` — 当前建议使用 `"utf-8"`
- **返回值**: `Promise<string>` 如果传入 `encoding`
- **举例场景**: 解析每条 memory 文件的 frontmatter 和正文

---

## 6. `loadMemorySection(): Promise<string>`

加载所有 memory，并组装成可注入模型上下文的文本。

### 参数

无。

### 返回值的精确格式

如果没有 memory，返回空字符串：

```text

```

如果存在 memory，返回：

```text
<memory>
- <name> [<type>]: <description>
- <name> [<type>]: <description>
</memory>
```

### 输入/输出示例

```typescript
await memoryStore.loadMemorySection();
```

返回：

```text
<memory>
- prefer_chinese_short_answer [user]: User prefers concise Chinese answers
- review_tests_first [feedback]: Run tests before review conclusions
</memory>
```

### 边界情况

- `.memory/` 不存在时返回 `""`
- 只有 `MEMORY.md` 索引、没有单条 memory 时返回 `""`
- 排序应与 `listMemories()` 保持一致
- 本函数只输出摘要 section，不输出全部正文，避免 prompt 被长期记忆淹没

### 所用 Node.js 方法

本函数通常复用 `listMemories()`，因此间接依赖：

- `fs.promises.readdir()`
- `fs.promises.readFile()`
- `path.join()`

---

## 7. `save_memory` 工具

**文件**: `src/tools/builtin-tools.ts`

### 输入 schema

```typescript
{
  name: string;
  description: string;
  type: "user" | "feedback" | "project" | "reference";
  content: string;
}
```

### 返回值的精确格式

成功时返回：

```text
Saved memory: <name> [<type>]
```

失败时返回工具错误文本：

```text
Error: <message>
```

### 输入/输出示例

输入：

```json
{
  "name": "prefer_chinese_short_answer",
  "description": "User prefers concise Chinese answers",
  "type": "user",
  "content": "The user prefers concise Chinese answers with direct actionable conclusions."
}
```

输出：

```text
Saved memory: prefer_chinese_short_answer [user]
```

### 边界情况

- 不允许保存密钥、密码、token 或凭证
- 不应该保存当前任务进度、当前分支名、PR 号
- 如果内容明显是代码结构或函数路径，应拒绝或提示重新读取当前仓库
- 本阶段先做显式工具调用，不做自动抽取

### 所用 Node.js 方法

工具函数本身不直接操作 Node.js 文件 API；它调用 `MemoryStore.saveMemory()`。  
实际文件写入由 `MemoryStore` 负责。

---

## 8. `AgentRunner` 集成变更

**文件**: `src/core/agent-runner.ts`

### `AgentRunnerOptions` 新字段

```typescript
interface AgentRunnerOptions {
  // ... s08 已有字段
  memoryStore?: MemoryStore;
}
```

### 会话开始加载

建议在 `run()` 进入主循环前加载：

```typescript
const memorySection = await memoryStore.loadMemorySection();
```

#### 返回值处理

- `memorySection === ""`: 不改动消息，直接进入主循环
- `memorySection !== ""`: 把它作为一条用户侧 text message 加入 `messages`

### 输入/输出示例

```typescript
// memory section:
<memory>
- prefer_chinese_short_answer [user]: User prefers concise Chinese answers
</memory>

// messages append:
{
  role: "user",
  content: "<memory>\n- prefer_chinese_short_answer [user]: User prefers concise Chinese answers\n</memory>"
}
```

### 边界情况

- 没有传 `memoryStore` 时，`AgentRunner` 行为必须与 s08 一致
- memory 加载失败时，本阶段建议返回工具错误或抛错，让测试暴露问题，不静默吞掉
- memory section 不应该覆盖用户原始输入
- `s10` 会把这一步迁移进更完整的 prompt assembly pipeline

### 所用 Node.js 方法

`AgentRunner` 集成本身不新增 Node.js 标准库方法。  
它只调用 `MemoryStore.loadMemorySection()`。

---

## 9. 这一阶段不应出现的 API 设计

- 不要把 memory 做成当前任务状态数据库
- 不要保存密钥、密码、token 或凭证
- 不要把当前代码结构、函数路径和文件列表写入 memory
- 不要把 memory 当作比当前文件系统更可信的事实来源
- 不要在 `s09` 引入向量库、SQLite 或自动抽取器
- 不要让 `save_memory` 绕过用户明确边界自动保存所有内容

## 10. 一句话结论

`s09` 的 API 重点不是“记得更多”，而是：

**只把跨会话仍有价值、且不容易从当前环境重新推导的信息保存成可审查的长期记忆。**
