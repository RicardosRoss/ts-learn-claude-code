# s05: Skill Loading API 参考

## SkillLoader

**文件**: `src/core/skill-loader.ts`

Skill 加载器，负责扫描、解析和提供 Skill 内容。

### 构造函数

```typescript
constructor(skillsDir: string)
```

- `skillsDir`: Skill 目录的绝对路径（如 `/path/to/project/skills`）
- 构造时立即扫描目录下所有 `SKILL.md` 文件

#### 所用 Node.js 方法

##### `fs.existsSync(path)`

- **作用**: 同步检查路径是否存在
- **参数**: `path: string` — 要检查的路径
- **返回值**: `boolean` — 存在返回 `true`，否则 `false`
- **举例场景**: 构造时先检查 `skillsDir` 是否存在，不存在则跳过扫描，`this.skills` 保持空 Map

##### `fs.readdirSync(dirPath, options)`

- **作用**: 同步读取目录内容，返回条目列表
- **参数**:
  - `dirPath: string` — 目录路径
  - `options: { withFileTypes: true }` — 返回 `fs.Dirent` 对象（可调用 `.isDirectory()`）
- **返回值**: `fs.Dirent[]` — 目录中的条目数组
- **举例场景**: 枚举 `skills/` 下的所有子目录（如 `pdf/`、`code-review/`），过滤出 `.isDirectory() === true` 的条目

##### `fs.readFileSync(filePath, encoding)`

- **作用**: 同步读取文件全部内容
- **参数**:
  - `filePath: string` — 文件路径
  - `encoding: string` — 如 `"utf-8"`，指定后返回字符串而非 Buffer
- **返回值**: `string` — 文件文本内容
- **举例场景**: 读取 `skills/pdf/SKILL.md` 的完整文本，交给 `parseFrontmatter()` 解析

##### `path.join(...segments)`

- **作用**: 拼接路径片段，处理分隔符
- **参数**: `...segments: string[]` — 路径片段
- **返回值**: `string` — 拼接后的规范化路径
- **举例场景**: `path.join(skillsDir, entry.name, "SKILL.md")` → `"/project/skills/pdf/SKILL.md"`

##### `path.dirname(filePath)`

- **作用**: 返回文件路径的目录部分
- **参数**: `filePath: string` — 文件路径
- **返回值**: `string` — 目录路径
- **举例场景**: `path.dirname("/project/skills/pdf/SKILL.md")` → `"/project/skills/pdf"`

##### `path.basename(dirPath)`

- **作用**: 返回路径的最后一部分（目录名或文件名）
- **参数**: `dirPath: string` — 路径
- **返回值**: `string` — 最后一部分
- **举例场景**: `path.basename("/project/skills/pdf")` → `"pdf"`，用作 `name` 的缺省值

---

### `getDescriptions(): string`

返回 Layer 1 文本，用于注入系统提示。

**返回值格式**：

```
  - pdf: Process PDF files - extract text, create PDFs...
  - code-review: Perform thorough code reviews...
```

每行格式: `  - {name}: {description}`

**无 skill 时返回**: `"(no skills available)"`

**输入/输出示例**：

```typescript
// 有 skills 时
loader.getDescriptions()
// → "  - pdf: Process PDF files...\n  - code-review: Review code..."

// 无 skills 时（目录不存在或无 SKILL.md）
loader.getDescriptions()
// → "(no skills available)"
```

#### 所用 Node.js 方法

无额外 Node.js 调用。仅遍历构造时已加载的 `this.skills` Map，拼接字符串。

---

### `getContent(name: string): string`

返回 Layer 2 完整 Skill body，用于 tool_result。

**返回值格式**：

```
<skill name="pdf">

# PDF Processing Skill
...完整 body 内容...

</skill>
```

**未知 skill 返回**:

```
Error: Unknown skill 'xxx'. Available: pdf, code-review
```

**输入/输出示例**：

```typescript
// 成功
loader.getContent("pdf")
// → "<skill name=\"pdf\">\n\n# PDF Processing Skill\n\n...\n\n</skill>"

// 失败
loader.getContent("unknown")
// → "Error: Unknown skill 'unknown'. Available: pdf, code-review"
```

#### 所用 Node.js 方法

无额外 Node.js 调用。仅从 `this.skills` Map 中查找并格式化已缓存的内容。

---

### `parseFrontmatter(raw: string, fallbackName: string): ParsedSkill`

（私有辅助函数）解析 SKILL.md 的 YAML frontmatter。

#### 所用 Node.js 方法

##### `String.prototype.match(regexp)`

- **作用**: 用正则表达式匹配字符串，提取捕获组
- **参数**: `regexp: RegExp` — 正则表达式（需带 `s` 标志使 `.` 匹配换行）
- **返回值**: `RegExpMatchArray | null` — 匹配成功返回数组（`[0]` 全文，`[1]`/`[2]`... 捕获组），失败返回 `null`
- **举例场景**: 用 `/^---\n(.*?)\n---\n(.*)/s` 匹配 frontmatter，`[1]` 是 YAML 头，`[2]` 是 body

---

## load_skill 工具

**名称**: `load_skill`
**描述**: Load specialized knowledge by name.

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string", "description": "Skill name to load" }
  },
  "required": ["name"]
}
```

### 返回值

调用 `SkillLoader.getContent(name)` 的结果，即 `<skill>` 包裹的完整 body 或错误信息。

### 输入/输出示例

**成功**:

```json
// input
{ "name": "pdf" }

// output
"<skill name=\"pdf\">\n\n# PDF Processing Skill\n...\n</skill>"
```

**失败**:

```json
// input
{ "name": "nonexistent" }

// output
"Error: Unknown skill 'nonexistent'. Available: pdf, code-review"
```

#### 所用 Node.js 方法

无。handler 仅调用 `skillLoader.getContent(name)`，所有 Node.js 调用封装在 SkillLoader 内部。

---

## 系统提示变更

s05 的系统提示在 s04 基础上追加 Skill 描述：

```
You are a coding agent at /path/to/workspace.
Use load_skill to access specialized knowledge.

Skills available:
  - pdf: Process PDF files...
  - code-review: Perform thorough code reviews...
```

- `SkillLoader.getDescriptions()` 的返回值追加到系统提示末尾
- 无 skill 时显示 `(no skills available)`

## SKILL.md 文件格式

```markdown
---
name: pdf
description: Process PDF files - extract text, create PDFs.
---

# PDF Processing Skill

完整 skill body 内容...
```

- frontmatter 使用 `---` 分隔
- `name`: Skill 标识（可选，默认用目录名）
- `description`: 简短描述（用于系统提示）
- body: `---` 之后的完整内容（用于按需加载）

### frontmatter 解析规则

- 只解析第一个 `---...---` 块
- 支持简单 `key: value` 格式
- 不支持嵌套对象或数组（够用即可）
- 解析失败时返回空 meta + 原始文本作为 body
- `name` 缺省时使用 SKILL.md 父目录名
