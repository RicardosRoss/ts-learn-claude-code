# s05: Skill Loading 开发文档

## 阶段目标

实现两层 Skill 按需加载机制：系统提示放元数据（便宜），模型按需加载完整内容（贵）。

## 核心概念

```
Layer 1 (system prompt, ~100 token/skill):
  Skills available:
    - pdf: Process PDF files...
    - code-review: Review code...

Layer 2 (tool_result, on demand):
  模型调用 load_skill("pdf") → 返回 <skill name="pdf">完整指令</skill>
```

## 相对 s04 的变更

| 组件 | s04 | s05 |
|---|---|---|
| 工具 | bash + file + todo + task | bash + file + todo + **load_skill** |
| 系统提示 | 静态 | + Skill 描述列表（Layer 1） |
| 知识库 | 无 | `skills/*/SKILL.md` |
| 注入 | 无 | 两层注入 |

## 需要新建的文件

1. **`src/core/skill-loader.ts`** — SkillLoader 类
   - 构造时扫描 `skills/*/SKILL.md`
   - 解析 YAML frontmatter（name, description）
   - `getDescriptions()` 返回 Layer 1 文本
   - `getContent(name)` 返回 Layer 2 完整 body

2. **`skills/pdf/SKILL.md`** — 示例 skill
3. **`skills/code-review/SKILL.md`** — 示例 skill

## 需要修改的文件

1. **`src/tools/builtin-tools.ts`**
   - 移除 `subagentFactory` 参数和 `task` 工具
   - 新增 `skillLoader` 参数和 `load_skill` 工具

2. **`src/cli/repl.ts`**
   - 创建 SkillLoader 实例
   - 系统提示追加 Skill 描述列表
   - 提示符从 `s04` 更新为 `s05`
   - 移除 SubagentFactory 相关代码

3. **`tests/repl-smoke.test.ts`**
   - 断言 `s04` → `s05`

## 实现顺序

1. 实现 `SkillLoader` 类 + 单元测试
2. 创建示例 `skills/` 目录
3. 修改 `builtin-tools.ts`（task → load_skill）
4. 修改 `repl.ts`（接入 SkillLoader + 更新系统提示）
5. 更新冒烟测试
6. 验收：build + test + tag

## 需要 用到的 Node.js 方法

| 功能 | Python (参考) | Node.js |
|---|---|---|
| 检查目录存在 | `Path.exists()` | `fs.existsSync(dir)` |
| 遍历子目录找 SKILL.md | `Path.rglob("SKILL.md")` | `fs.readdirSync(dir, { withFileTypes: true })` + `path.join()` |
| 读文件内容 | `Path.read_text()` | `fs.readFileSync(filePath, "utf-8")` |
| 解析 frontmatter | `re.match()` + `yaml.safe_load()` | `String.match()` + 手写简易解析（正则 `^---\n(.*?)\n---\n(.*)` / `s` 标志） |
| 获取目录名作为 name fallback | `f.parent.name` | `path.basename(path.dirname(filePath))` |

参考源码关键片段（Python → TS 对照）：

```python
# Python 参考实现
if not self.skills_dir.exists():
    return
for f in sorted(self.skills_dir.rglob("SKILL.md")):
    text = f.read_text()
    meta, body = self._parse_frontmatter(text)
    name = meta.get("name", f.parent.name)
```

对应 TypeScript 伪代码：

```typescript
if (!fs.existsSync(skillsDir)) return;
const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue;
  const skillFile = path.join(skillsDir, entry.name, "SKILL.md");
  if (!fs.existsSync(skillFile)) continue;
  const text = fs.readFileSync(skillFile, "utf-8");
  const { meta, body } = parseFrontmatter(text, entry.name);
  // ...
}
```

## 设计决策

- **YAML 解析**：不引入外部依赖，手写简易 frontmatter 解析器（只支持 `key: value` 和 `key: |` 多行值）
- **skill 目录**：使用 `skills/` 放在项目根目录，SkillLoader 接收 `skillsDir` 参数
- **错误处理**：未知 skill 返回错误提示，包含可用 skill 列表
