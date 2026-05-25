/**
 * s09: MemoryStore — 最小长期记忆存储器
 *
 * 只保存跨会话仍有价值、且不容易从当前环境重新推导的信息。
 * 每条 memory 独立落盘为 .memory/<name>.md，MEMORY.md 作为索引。
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// ── 类型定义 ──────────────────────────────────────────────

/** 四种合法 memory 类型。 */
type MemoryType = "user" | "feedback" | "project" | "reference";

/** 调用方传入的 memory 条目。 */
interface MemoryEntry {
  name: string;
  description: string;
  type: MemoryType;
  content: string;
}

/** saveMemory 的返回值，在 MemoryEntry 基础上追加写入路径。 */
interface SavedMemory extends MemoryEntry {
  filePath: string;
}

/** MemoryStore 构造参数。 */
interface MemoryStoreOptions {
  memoryDir: string;
}

// ── 导出类型 ──────────────────────────────────────────────
export type { MemoryType, MemoryEntry, SavedMemory, MemoryStoreOptions };

// ── 常量 ──────────────────────────────────────────────────

const VALID_TYPES = new Set<string>(["user", "feedback", "project", "reference"]);
const MEMORY_INDEX_FILE = "MEMORY.md";

// ── 辅助函数（被调用者先于调用者） ─────────────────────────

/**
 * 将 memory name 规范化为安全文件名。
 * 去除路径分隔符、点号前缀、空格等，转为小写并用下划线连接。
 */
function toSafeFileName(name: string): string {
  return name.trim().replace(/\.\./g, "").replace(/\s+/g, "_").toLowerCase();
}

/**
 * 校验 MemoryEntry 的四个字段。
 * 为空 / type 非法 时抛出描述性错误。
 */
function validateEntry(entry: MemoryEntry): void {
  const { type, ...fields } = entry;
  const errors: string[] = [];

  for (const [key, value] of Object.entries(fields)) {
    if (!value) errors.push(`${key} must not be empty`);
  }
  if (!VALID_TYPES.has(type)) errors.push(`Invalid memory type: ${type}`);

  if (errors.length > 0) throw new Error(errors.join("; "));
}

/**
 * 将单条 memory 文件内容格式化为带 frontmatter 的 Markdown。
 */
function formatMemoryFile(entry: MemoryEntry): string {
  return `---\nname: ${entry.name}\ndescription: ${entry.description}\ntype: ${entry.type}\n---\n\n${entry.content}`;
}

// ── 对外类 ────────────────────────────────────────────────

/**
 * 最小长期记忆存储器。
 *
 * 职责边界：
 * - 什么信息值得长期保存 → 只接受四种 type
 * - 以什么格式落盘 → .memory/<safe-name>.md (frontmatter + body)
 * - 新会话如何重新进入上下文 → loadMemorySection() 输出摘要
 */
export class MemoryStore {
  private readonly memoryDir: string;

  constructor(options: MemoryStoreOptions) {
    this.memoryDir = options.memoryDir;
  }

  /**
   * 保存一条 memory 并重建索引。
   *
   * 执行顺序：
   * 1. 校验 entry
   * 2. 转 safe filename
   * 3. 确保 .memory/ 存在
   * 4. 写入 .memory/<safe-name>.md
   * 5. 重建 .memory/MEMORY.md 索引
   * 6. 返回 SavedMemory
   */
  async saveMemory(entry: MemoryEntry): Promise<SavedMemory> {
    validateEntry(entry);
    const safeName = toSafeFileName(entry.name);
    const filePath = path.join(this.memoryDir, `${safeName}.md`);

    await mkdir(this.memoryDir, { recursive: true });
    await writeFile(filePath, formatMemoryFile(entry), "utf-8");
    await this.rebuildIndex();

    return { ...entry, filePath };
  }

  /**
   * 列出 .memory/ 下所有单条 memory（不含 MEMORY.md 索引）。
   * 按 name 字典序排序。目录不存在时返回 []。
   * frontmatter 解析内联于此方法中。
   */
  async listMemories(): Promise<SavedMemory[]> {
    let entries;
    try {
      entries = await readdir(this.memoryDir);
    } catch {
      return [];
    }

    const results: SavedMemory[] = [];
    for (const fileName of entries) {
      if (!fileName.endsWith(".md") || fileName === MEMORY_INDEX_FILE) continue;

      const filePath = path.join(this.memoryDir, fileName);
      const content = await readFile(filePath, "utf-8");

      const parts = content.split("---");
      if (parts.length < 3) continue;

      const frontmatter = parts[1].trim();
      const body = parts.slice(2).join("---").trim();

      const fields: Record<string, string> = {};
      for (const line of frontmatter.split("\n")) {
        const colonIndex = line.indexOf(":");
        if (colonIndex === -1) continue;
        fields[line.slice(0, colonIndex).trim()] = line.slice(colonIndex + 1).trim();
      }

      if (!fields.name || !fields.description || !fields.type) {
        throw new Error(`Malformed memory file: ${fileName}`);
      }

      results.push({
        name: fields.name,
        description: fields.description,
        type: fields.type as MemoryType,
        content: body,
        filePath
      });
    }

    results.sort((a, b) => a.name.localeCompare(b.name));
    return results;
  }

  /**
   * 加载所有 memory 并组装为可注入模型上下文的摘要文本。
   *
   * 无 memory 时返回 ""。
   * 有 memory 时返回：
   * <memory>
   * - <name> [<type>]: <description>
   * </memory>
   */
  async loadMemorySection(): Promise<string> {
    const memories = await this.listMemories();
    if (memories.length === 0) return "";

    const lines = memories.map((m) => `- ${m.name} [${m.type}]: ${m.description}`);
    return `<memory>\n${lines.join("\n")}\n</memory>`;
  }

  /**
   * 扫描所有 memory 文件，重建 .memory/MEMORY.md 索引。
   * 每行格式：- [name](<safe-name>.md) — description
   */
  private async rebuildIndex(): Promise<void> {
    const memories = await this.listMemories();
    const lines = memories.map((m) => `- [${m.name}](${path.basename(m.filePath)}) — ${m.description}`);
    const indexPath = path.join(this.memoryDir, MEMORY_INDEX_FILE);
    await writeFile(indexPath, lines.join("\n") + "\n", "utf-8");
  }
}
