import { afterEach, beforeEach, describe, expect, test } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { MemoryStore } from "../src/core/memory-store.js";

// ---------------------------------------------------------------------------
// MemoryStore — s09 最小长期记忆存储器
//
// 测试覆盖：
//   1. 正常保存与加载
//   2. 校验拒绝（空字段、非法 type）
//   3. safe filename 规范化
//   4. 空目录时 loadMemorySection() 返回空字符串
//   5. MEMORY.md 索引正确重建
//   6. listMemories 按 name 排序
//   7. 多条 memory 共存
// ---------------------------------------------------------------------------

describe("MemoryStore", () => {
  let memoryDir: string;
  let store: MemoryStore;

  beforeEach(async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "s09-memory-"));
    memoryDir = path.join(tmp, ".memory");
    store = new MemoryStore({ memoryDir });
  });

  afterEach(async () => {
    await fs.rm(path.dirname(memoryDir), { recursive: true, force: true });
  });

  // --- saveMemory: 正常保存 ------------------------------------------------

  test("saveMemory() creates .memory/ directory and writes a memory file", async () => {
    const saved = await store.saveMemory({
      name: "prefer_chinese",
      description: "User prefers Chinese answers",
      type: "user",
      content: "The user prefers concise Chinese answers."
    });

    expect(saved.name).toBe("prefer_chinese");
    expect(saved.type).toBe("user");
    expect(saved.filePath).toBe(path.join(memoryDir, "prefer_chinese.md"));

    const content = await fs.readFile(saved.filePath, "utf-8");
    expect(content).toContain("name: prefer_chinese");
    expect(content).toContain("type: user");
    expect(content).toContain("The user prefers concise Chinese answers.");
  });

  test("saveMemory() returns filePath pointing to the written file", async () => {
    const saved = await store.saveMemory({
      name: "test-abc",
      description: "desc",
      type: "feedback",
      content: "body"
    });

    const stat = await fs.stat(saved.filePath);
    expect(stat.isFile()).toBe(true);
  });

  // --- saveMemory: 校验拒绝 ------------------------------------------------

  test("saveMemory() rejects empty name", async () => {
    await expect(
      store.saveMemory({ name: "", description: "d", type: "user", content: "c" })
    ).rejects.toThrow(/name.*must not be empty/i);
  });

  test("saveMemory() rejects empty description", async () => {
    await expect(
      store.saveMemory({ name: "n", description: "", type: "user", content: "c" })
    ).rejects.toThrow(/description.*must not be empty/i);
  });

  test("saveMemory() rejects empty content", async () => {
    await expect(
      store.saveMemory({ name: "n", description: "d", type: "user", content: "" })
    ).rejects.toThrow(/content.*must not be empty/i);
  });

  test("saveMemory() rejects invalid type", async () => {
    await expect(
      store.saveMemory({ name: "n", description: "d", type: "invalid" as "user", content: "c" })
    ).rejects.toThrow(/invalid memory type/i);
  });

  // --- saveMemory: safe filename -------------------------------------------

  test("saveMemory() normalizes spaces in name to underscores", async () => {
    const saved = await store.saveMemory({
      name: "my cool memory",
      description: "desc",
      type: "project",
      content: "body"
    });

    expect(saved.filePath).toMatch(/my_cool_memory\.md$/);
  });

  test("saveMemory() strips double dots from name", async () => {
    const saved = await store.saveMemory({
      name: "some..thing",
      description: "desc",
      type: "reference",
      content: "body"
    });

    expect(saved.filePath).toMatch(/something\.md$/);
  });

  test("saveMemory() lowercases the name", async () => {
    const saved = await store.saveMemory({
      name: "MyMemory",
      description: "desc",
      type: "user",
      content: "body"
    });

    expect(saved.filePath).toMatch(/mymemory\.md$/);
  });

  // --- loadMemorySection: 空目录 -------------------------------------------

  test("loadMemorySection() returns empty string when no memories exist", async () => {
    const section = await store.loadMemorySection();
    expect(section).toBe("");
  });

  // --- loadMemorySection: 有内容 -------------------------------------------

  test("loadMemorySection() returns formatted section with one memory", async () => {
    await store.saveMemory({
      name: "prefer_chinese",
      description: "User prefers Chinese answers",
      type: "user",
      content: "Some detail."
    });

    const section = await store.loadMemorySection();
    expect(section).toContain("<memory>");
    expect(section).toContain("</memory>");
    expect(section).toContain("prefer_chinese [user]: User prefers Chinese answers");
  });

  // --- listMemories: 排序 ---------------------------------------------------

  test("listMemories() returns memories sorted by name", async () => {
    await store.saveMemory({
      name: "zebra",
      description: "Z desc",
      type: "reference",
      content: "Z body"
    });
    await store.saveMemory({
      name: "alpha",
      description: "A desc",
      type: "user",
      content: "A body"
    });

    const list = await store.listMemories();
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe("alpha");
    expect(list[1].name).toBe("zebra");
  });

  // --- MEMORY.md 索引 -------------------------------------------------------

  test("saveMemory() rebuilds MEMORY.md index", async () => {
    await store.saveMemory({
      name: "first",
      description: "First memory",
      type: "feedback",
      content: "Body 1"
    });

    const indexPath = path.join(memoryDir, "MEMORY.md");
    const index = await fs.readFile(indexPath, "utf-8");
    expect(index).toContain("[first](first.md)");
    expect(index).toContain("First memory");
  });

  test("MEMORY.md index includes all memories after multiple saves", async () => {
    await store.saveMemory({
      name: "m1",
      description: "Memory one",
      type: "user",
      content: "Body 1"
    });
    await store.saveMemory({
      name: "m2",
      description: "Memory two",
      type: "project",
      content: "Body 2"
    });

    const indexPath = path.join(memoryDir, "MEMORY.md");
    const index = await fs.readFile(indexPath, "utf-8");
    expect(index).toContain("m1");
    expect(index).toContain("m2");
  });

  // --- 多条 memory 共存 ------------------------------------------------------

  test("multiple memories coexist and loadMemorySection includes all", async () => {
    await store.saveMemory({
      name: "user_pref",
      description: "Prefers short answers",
      type: "user",
      content: "Keep it brief."
    });
    await store.saveMemory({
      name: "bug_policy",
      description: "Always write failing test first",
      type: "feedback",
      content: "TDD approach for bugs."
    });

    const section = await store.loadMemorySection();
    expect(section).toContain("user_pref [user]: Prefers short answers");
    expect(section).toContain("bug_policy [feedback]: Always write failing test first");
  });

  // --- listMemories: 空目录 --------------------------------------------------

  test("listMemories() returns empty array when directory does not exist", async () => {
    const emptyStore = new MemoryStore({ memoryDir: path.join(memoryDir, "nope") });
    const list = await emptyStore.listMemories();
    expect(list).toEqual([]);
  });
});
