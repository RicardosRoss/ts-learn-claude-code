/**
 * File tool tests (s02 stage).
 * Comprehensive tests for safePath, runRead, runWrite, runEdit.
 *
 * Covers happy paths AND edge/boundary/error cases.
 */
import { describe, expect, test, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// --- safePath tests ---

describe("safePath", () => {
  // Dynamic import so the test file compiles even before the module exists.
  // When the module is implemented, these tests will actually run.
  async function importSafePath() {
    const mod = await import("../src/tools/path-policy.js");
    return mod.safePath as (inputPath: string, workspaceRoot: string) => string;
  }

  let workspace: string;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "s02-safe-"));
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true }).catch(() => {});
  });

  // --- happy path ---

  test("resolves simple relative path within workspace", async () => {
    const safePath = await importSafePath();
    const result = safePath("src/foo.ts", workspace);
    expect(result).toBe(path.resolve(workspace, "src/foo.ts"));
  });

  test("resolves path with ./ prefix", async () => {
    const safePath = await importSafePath();
    const result = safePath("./src/foo.ts", workspace);
    expect(result).toBe(path.resolve(workspace, "src/foo.ts"));
  });

  test("allows absolute path inside workspace", async () => {
    const safePath = await importSafePath();
    const absPath = path.resolve(workspace, "src/bar.ts");
    const result = safePath(absPath, workspace);
    expect(result).toBe(absPath);
  });

  test("resolves workspace root itself ('.')", async () => {
    const safePath = await importSafePath();
    const result = safePath(".", workspace);
    expect(result).toBe(workspace);
  });

  test("resolves empty string to workspace root", async () => {
    const safePath = await importSafePath();
    const result = safePath("", workspace);
    expect(result).toBe(workspace);
  });

  test("resolves deep nested relative path", async () => {
    const safePath = await importSafePath();
    const result = safePath("a/b/c/d/e/f", workspace);
    expect(result).toBe(path.resolve(workspace, "a/b/c/d/e/f"));
  });

  test("normalizes redundant segments (a/./b/../c)", async () => {
    const safePath = await importSafePath();
    const result = safePath("a/./b/../c", workspace);
    expect(result).toBe(path.resolve(workspace, "a/c"));
  });

  test("handles trailing slash", async () => {
    const safePath = await importSafePath();
    const result = safePath("src/", workspace);
    expect(result).toBe(path.resolve(workspace, "src"));
  });

  // --- path escape / security ---

  test("blocks escape via ../../..", async () => {
    const safePath = await importSafePath();
    expect(() => safePath("../../etc/passwd", workspace)).toThrow(/escapes workspace/i);
  });

  test("blocks absolute path outside workspace", async () => {
    const safePath = await importSafePath();
    expect(() => safePath("/etc/passwd", workspace)).toThrow(/escapes workspace/i);
  });

  test("blocks escape via deeply nested ..", async () => {
    const safePath = await importSafePath();
    expect(() => safePath("a/b/../../../etc/passwd", workspace)).toThrow(/escapes workspace/i);
  });

  test("blocks escape when relative path resolves exactly one level above workspace", async () => {
    const safePath = await importSafePath();
    expect(() => safePath("..", workspace)).toThrow(/escapes workspace/i);
  });

  // --- symlink handling ---

  test("allows symlink pointing inside workspace", async () => {
    const safePath = await importSafePath();
    const realDir = path.join(workspace, "real");
    const linkPath = path.join(workspace, "link");
    await fs.mkdir(realDir);
    await fs.symlink(realDir, linkPath);

    const result = safePath("link/file.txt", workspace);
    expect(result).toBe(path.resolve(workspace, "link/file.txt"));
  });

  test("blocks symlink pointing outside workspace", async () => {
    const safePath = await importSafePath();
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "s02-outside-"));
    const linkPath = path.join(workspace, "evil-link");
    await fs.symlink(outsideDir, linkPath);

    try {
      expect(() => safePath("evil-link/file.txt", workspace)).toThrow(/escapes workspace/i);
    } finally {
      await fs.rm(outsideDir, { recursive: true }).catch(() => {});
    }
  });

  test("blocks chained symlink escape when workspace root is already canonicalized", async () => {
    const safePath = await importSafePath();
    const canonicalWorkspace = await fs.realpath(workspace);
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "s02-chain-outside-"));
    await fs.symlink(outsideDir, path.join(workspace, "hop"));
    await fs.symlink("hop/file.txt", path.join(workspace, "link1"));

    try {
      expect(() => safePath("link1", canonicalWorkspace)).toThrow(/escapes workspace/i);
    } finally {
      await fs.rm(outsideDir, { recursive: true }).catch(() => {});
    }
  });

  test("allows dangling relative symlink whose target stays inside workspace", async () => {
    const safePath = await importSafePath();
    await fs.symlink("inner/missing.txt", path.join(workspace, "local-link"));

    const result = safePath("local-link", workspace);
    expect(result).toBe(path.resolve(workspace, "local-link"));
  });

  // --- boundary / edge cases ---

  test("workspace root with trailing slash still works", async () => {
    const safePath = await importSafePath();
    const wsTrailing = workspace + path.sep;
    const result = safePath("file.txt", wsTrailing);
    expect(result).toBe(path.resolve(workspace, "file.txt"));
  });

  test("handles path with spaces in directory name", async () => {
    const safePath = await importSafePath();
    const result = safePath("my project/file.txt", workspace);
    expect(result).toBe(path.resolve(workspace, "my project/file.txt"));
  });

  test("handles path with special characters", async () => {
    const safePath = await importSafePath();
    const result = safePath("dir_name-1.0/file.txt", workspace);
    expect(result).toBe(path.resolve(workspace, "dir_name-1.0/file.txt"));
  });
});

// --- runRead tests ---

describe("runRead", () => {
  async function importRunRead() {
    const mod = await import("../src/tools/file-tools.js");
    return mod.runRead as (
      inputPath: string,
      options: { workspaceRoot: string; limit?: number }
    ) => Promise<string>;
  }

  let workspace: string;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "s02-read-"));
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true }).catch(() => {});
  });

  // --- happy path ---

  test("reads an existing file", async () => {
    const runRead = await importRunRead();
    const filePath = path.join(workspace, "hello.txt");
    await fs.writeFile(filePath, "Hello, World!");

    const result = await runRead("hello.txt", { workspaceRoot: workspace });
    expect(result).toBe("Hello, World!");
  });

  test("reads file with multiple lines", async () => {
    const runRead = await importRunRead();
    const filePath = path.join(workspace, "lines.txt");
    await fs.writeFile(filePath, "line1\nline2\nline3");

    const result = await runRead("lines.txt", { workspaceRoot: workspace });
    expect(result).toBe("line1\nline2\nline3");
  });

  test("reads file in subdirectory", async () => {
    const runRead = await importRunRead();
    const subDir = path.join(workspace, "src");
    await fs.mkdir(subDir);
    const filePath = path.join(subDir, "index.ts");
    await fs.writeFile(filePath, "export {}");

    const result = await runRead("src/index.ts", { workspaceRoot: workspace });
    expect(result).toBe("export {}");
  });

  // --- limit truncation ---

  test("reads file with line limit", async () => {
    const runRead = await importRunRead();
    const filePath = path.join(workspace, "long.txt");
    const lines = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`);
    await fs.writeFile(filePath, lines.join("\n"));

    const result = await runRead("long.txt", { workspaceRoot: workspace, limit: 10 });
    const resultLines = result.split("\n");
    expect(resultLines).toHaveLength(11); // 10 lines + truncation notice
    expect(resultLines[10]).toContain("40 more lines");
  });

  test("reads file shorter than limit without truncation", async () => {
    const runRead = await importRunRead();
    const filePath = path.join(workspace, "short.txt");
    await fs.writeFile(filePath, "a\nb\nc");

    const result = await runRead("short.txt", { workspaceRoot: workspace, limit: 100 });
    expect(result).toBe("a\nb\nc");
    expect(result).not.toContain("more lines");
  });

  test("limit=0 returns only truncation notice", async () => {
    const runRead = await importRunRead();
    const filePath = path.join(workspace, "data.txt");
    await fs.writeFile(filePath, "line1\nline2\nline3");

    const result = await runRead("data.txt", { workspaceRoot: workspace, limit: 0 });
    expect(result).toContain("3 more lines");
  });

  test("limit=1 returns first line plus truncation notice", async () => {
    const runRead = await importRunRead();
    const filePath = path.join(workspace, "data.txt");
    await fs.writeFile(filePath, "first\nsecond\nthird");

    const result = await runRead("data.txt", { workspaceRoot: workspace, limit: 1 });
    expect(result).toContain("first");
    expect(result).toContain("2 more lines");
  });

  test("limit exactly equals line count", async () => {
    const runRead = await importRunRead();
    const filePath = path.join(workspace, "exact.txt");
    await fs.writeFile(filePath, "a\nb\nc");

    const result = await runRead("exact.txt", { workspaceRoot: workspace, limit: 3 });
    expect(result).toBe("a\nb\nc");
    expect(result).not.toContain("more lines");
  });

  // --- error cases ---

  test("returns error for nonexistent file", async () => {
    const runRead = await importRunRead();
    const result = await runRead("no-such-file.txt", { workspaceRoot: workspace });
    expect(result).toMatch(/^Error:/);
  });

  test("returns error when path is a directory", async () => {
    const runRead = await importRunRead();
    const subDir = path.join(workspace, "subdir");
    await fs.mkdir(subDir);

    const result = await runRead("subdir", { workspaceRoot: workspace });
    expect(result).toMatch(/^Error:/);
  });

  test("returns error for path escaping workspace", async () => {
    const runRead = await importRunRead();
    const result = await runRead("../../etc/passwd", { workspaceRoot: workspace });
    expect(result).toMatch(/^Error:/);
    expect(result).toMatch(/escapes workspace/i);
  });

  // --- edge cases ---

  test("handles empty file", async () => {
    const runRead = await importRunRead();
    const filePath = path.join(workspace, "empty.txt");
    await fs.writeFile(filePath, "");

    const result = await runRead("empty.txt", { workspaceRoot: workspace });
    expect(result).toBe("");
  });

  test("reads Unicode content correctly", async () => {
    const runRead = await importRunRead();
    const filePath = path.join(workspace, "unicode.txt");
    const unicodeContent = "你好世界 🌍 مرحبا";
    await fs.writeFile(filePath, unicodeContent, "utf-8");

    const result = await runRead("unicode.txt", { workspaceRoot: workspace });
    expect(result).toBe(unicodeContent);
  });

  test("reads file with CRLF line endings", async () => {
    const runRead = await importRunRead();
    const filePath = path.join(workspace, "crlf.txt");
    await fs.writeFile(filePath, "line1\r\nline2\r\nline3");

    const result = await runRead("crlf.txt", { workspaceRoot: workspace, limit: 2 });
    // CRLF splitting behavior depends on implementation,
    // but it should not crash and should return some content
    expect(result).toContain("line1");
  });

  test("reads file with only newlines", async () => {
    const runRead = await importRunRead();
    const filePath = path.join(workspace, "newlines.txt");
    await fs.writeFile(filePath, "\n\n\n");

    const result = await runRead("newlines.txt", { workspaceRoot: workspace });
    // Should return the newlines without error
    expect(result).toBeDefined();
  });

  test("reads file with single line (no trailing newline)", async () => {
    const runRead = await importRunRead();
    const filePath = path.join(workspace, "single.txt");
    await fs.writeFile(filePath, "single line");

    const result = await runRead("single.txt", { workspaceRoot: workspace });
    expect(result).toBe("single line");
  });

  test("reads file with trailing newline", async () => {
    const runRead = await importRunRead();
    const filePath = path.join(workspace, "trailing.txt");
    await fs.writeFile(filePath, "hello\n");

    const result = await runRead("trailing.txt", { workspaceRoot: workspace });
    // Splitting on \n with trailing newline produces ["hello", ""],
    // so output should be "hello\n" or "hello" depending on impl
    expect(result).toContain("hello");
  });
});

// --- runWrite tests ---

describe("runWrite", () => {
  async function importRunWrite() {
    const mod = await import("../src/tools/file-tools.js");
    return mod.runWrite as (
      inputPath: string,
      content: string,
      options: { workspaceRoot: string }
    ) => Promise<string>;
  }

  let workspace: string;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "s02-write-"));
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true }).catch(() => {});
  });

  // --- happy path ---

  test("writes a new file", async () => {
    const runWrite = await importRunWrite();
    const result = await runWrite("new.txt", "hello", { workspaceRoot: workspace });
    expect(result).toBe("Wrote 5 bytes to new.txt");

    const content = await fs.readFile(path.join(workspace, "new.txt"), "utf-8");
    expect(content).toBe("hello");
  });

  test("overwrites an existing file", async () => {
    const runWrite = await importRunWrite();
    const filePath = path.join(workspace, "exists.txt");
    await fs.writeFile(filePath, "old content");

    const result = await runWrite("exists.txt", "new content", { workspaceRoot: workspace });
    expect(result).toMatch(/Wrote \d+ bytes to exists\.txt/);

    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("new content");
  });

  test("creates parent directories automatically", async () => {
    const runWrite = await importRunWrite();
    const result = await runWrite("a/b/c/deep.txt", "deep", { workspaceRoot: workspace });
    expect(result).toMatch(/Wrote \d+ bytes to/);

    const content = await fs.readFile(
      path.join(workspace, "a/b/c/deep.txt"),
      "utf-8"
    );
    expect(content).toBe("deep");
  });

  // --- content edge cases ---

  test("writes empty content", async () => {
    const runWrite = await importRunWrite();
    const result = await runWrite("empty.txt", "", { workspaceRoot: workspace });
    expect(result).toBe("Wrote 0 bytes to empty.txt");

    const stat = await fs.stat(path.join(workspace, "empty.txt"));
    expect(stat.size).toBe(0);
  });

  test("writes Unicode content correctly", async () => {
    const runWrite = await importRunWrite();
    const unicodeContent = "你好世界 🌍 مرحبا";

    const result = await runWrite("unicode.txt", unicodeContent, {
      workspaceRoot: workspace
    });

    const written = await fs.readFile(path.join(workspace, "unicode.txt"), "utf-8");
    expect(written).toBe(unicodeContent);

    // Verify byte count matches Buffer.byteLength
    const byteLen = Buffer.byteLength(unicodeContent, "utf-8");
    expect(result).toBe(`Wrote ${byteLen} bytes to unicode.txt`);
  });

  test("writes content with special characters", async () => {
    const runWrite = await importRunWrite();
    const special = "tab\there\nnewline\r\nCRLF\n\"quotes\" 'apostrophe'";

    await runWrite("special.txt", special, { workspaceRoot: workspace });
    const written = await fs.readFile(path.join(workspace, "special.txt"), "utf-8");
    expect(written).toBe(special);
  });

  test("writes large content", async () => {
    const runWrite = await importRunWrite();
    const largeContent = "x".repeat(50_000);

    await runWrite("large.txt", largeContent, { workspaceRoot: workspace });
    const written = await fs.readFile(path.join(workspace, "large.txt"), "utf-8");
    expect(written.length).toBe(50_000);
  });

  test("writes multi-line content preserving newlines", async () => {
    const runWrite = await importRunWrite();
    const content = "line1\nline2\nline3";

    await runWrite("multi.txt", content, { workspaceRoot: workspace });
    const written = await fs.readFile(path.join(workspace, "multi.txt"), "utf-8");
    expect(written).toBe(content);
  });

  // --- error cases ---

  test("returns error for path escaping workspace", async () => {
    const runWrite = await importRunWrite();
    const result = await runWrite("../../tmp/evil.txt", "data", {
      workspaceRoot: workspace
    });
    expect(result).toMatch(/^Error:/);
    expect(result).toMatch(/escapes workspace/i);
  });

  test("returns error when target is an existing directory", async () => {
    const runWrite = await importRunWrite();
    const dirPath = path.join(workspace, "mydir");
    await fs.mkdir(dirPath);

    const result = await runWrite("mydir", "content", { workspaceRoot: workspace });
    expect(result).toMatch(/^Error:/);
  });

  test("returns error when parent path is an existing file", async () => {
    const runWrite = await importRunWrite();
    const blockingFile = path.join(workspace, "blocker");
    await fs.writeFile(blockingFile, "I am a file");

    // Trying to write to "blocker/sub/file.txt" should fail because "blocker" is a file, not a dir
    const result = await runWrite("blocker/sub/file.txt", "data", {
      workspaceRoot: workspace
    });
    expect(result).toMatch(/^Error:/);
  });
});

// --- runEdit tests ---

describe("runEdit", () => {
  async function importRunEdit() {
    const mod = await import("../src/tools/file-tools.js");
    return mod.runEdit as (
      inputPath: string,
      oldText: string,
      newText: string,
      options: { workspaceRoot: string }
    ) => Promise<string>;
  }

  let workspace: string;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "s02-edit-"));
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true }).catch(() => {});
  });

  // Helper to create a file with initial content in workspace
  async function createFile(name: string, content: string): Promise<string> {
    const filePath = path.join(workspace, name);
    await fs.writeFile(filePath, content, "utf-8");
    return filePath;
  }

  // --- happy path ---

  test("replaces existing text", async () => {
    const runEdit = await importRunEdit();
    await createFile("greet.txt", "Hello, World!");

    const result = await runEdit("greet.txt", "Hello", "Goodbye", {
      workspaceRoot: workspace
    });
    expect(result).toBe("Edited greet.txt");

    const content = await fs.readFile(path.join(workspace, "greet.txt"), "utf-8");
    expect(content).toBe("Goodbye, World!");
  });

  test("replaces text in the middle of a line", async () => {
    const runEdit = await importRunEdit();
    await createFile("mid.txt", "the quick brown fox");

    await runEdit("mid.txt", "quick brown", "slow red", { workspaceRoot: workspace });

    const content = await fs.readFile(path.join(workspace, "mid.txt"), "utf-8");
    expect(content).toBe("the slow red fox");
  });

  test("replaces multi-line text", async () => {
    const runEdit = await importRunEdit();
    await createFile("multi.txt", "line1\nline2\nline3");

    await runEdit("multi.txt", "line1\nline2", "replaced", {
      workspaceRoot: workspace
    });

    const content = await fs.readFile(path.join(workspace, "multi.txt"), "utf-8");
    expect(content).toBe("replaced\nline3");
  });

  // --- only first occurrence ---

  test("replaces only the first occurrence", async () => {
    const runEdit = await importRunEdit();
    await createFile("dup.txt", "foo bar foo baz foo");

    await runEdit("dup.txt", "foo", "qux", { workspaceRoot: workspace });

    const content = await fs.readFile(path.join(workspace, "dup.txt"), "utf-8");
    expect(content).toBe("qux bar foo baz foo");
  });

  test("does not replace second occurrence even if first replacement creates new match", async () => {
    const runEdit = await importRunEdit();
    await createFile("chain.txt", "ab");

    await runEdit("chain.txt", "a", "aa", { workspaceRoot: workspace });

    const content = await fs.readFile(path.join(workspace, "chain.txt"), "utf-8");
    expect(content).toBe("aab");
  });

  // --- replacement edge cases ---

  test("replaces with empty string (deletion)", async () => {
    const runEdit = await importRunEdit();
    await createFile("del.txt", "Hello, World!");

    await runEdit("del.txt", ", World", "", { workspaceRoot: workspace });

    const content = await fs.readFile(path.join(workspace, "del.txt"), "utf-8");
    expect(content).toBe("Hello!");
  });

  test("replaces empty old text (inserts at beginning)", async () => {
    const runEdit = await importRunEdit();
    await createFile("insert.txt", "world");

    await runEdit("insert.txt", "", "hello ", { workspaceRoot: workspace });

    const content = await fs.readFile(path.join(workspace, "insert.txt"), "utf-8");
    // String.replace("", "hello ") inserts at index 0
    expect(content).toBe("hello world");
  });

  test("replaces entire file content", async () => {
    const runEdit = await importRunEdit();
    await createFile("full.txt", "old content");

    await runEdit("full.txt", "old content", "brand new content", {
      workspaceRoot: workspace
    });

    const content = await fs.readFile(path.join(workspace, "full.txt"), "utf-8");
    expect(content).toBe("brand new content");
  });

  test("handles Unicode text replacement", async () => {
    const runEdit = await importRunEdit();
    await createFile("cn.txt", "你好世界");

    await runEdit("cn.txt", "你好", "再见", { workspaceRoot: workspace });

    const content = await fs.readFile(path.join(workspace, "cn.txt"), "utf-8");
    expect(content).toBe("再见世界");
  });

  test("handles replacement that makes file longer", async () => {
    const runEdit = await importRunEdit();
    await createFile("grow.txt", "a");

    await runEdit("grow.txt", "a", "a very long replacement string", {
      workspaceRoot: workspace
    });

    const content = await fs.readFile(path.join(workspace, "grow.txt"), "utf-8");
    expect(content).toBe("a very long replacement string");
  });

  test("handles replacement that makes file shorter", async () => {
    const runEdit = await importRunEdit();
    await createFile("shrink.txt", "a very long string here");

    await runEdit("shrink.txt", "a very long string here", "x", {
      workspaceRoot: workspace
    });

    const content = await fs.readFile(path.join(workspace, "shrink.txt"), "utf-8");
    expect(content).toBe("x");
  });

  // --- error cases ---

  test("returns error when old text not found", async () => {
    const runEdit = await importRunEdit();
    await createFile("notfound.txt", "Hello");

    const result = await runEdit("notfound.txt", "Goodbye", "Hello", {
      workspaceRoot: workspace
    });
    expect(result).toMatch(/^Error:/);
    expect(result).toMatch(/not found/i);

    // File should remain unchanged
    const content = await fs.readFile(path.join(workspace, "notfound.txt"), "utf-8");
    expect(content).toBe("Hello");
  });

  test("returns error for nonexistent file", async () => {
    const runEdit = await importRunEdit();
    const result = await runEdit("no-file.txt", "a", "b", {
      workspaceRoot: workspace
    });
    expect(result).toMatch(/^Error:/);
  });

  test("does not create file if it does not exist", async () => {
    const runEdit = await importRunEdit();
    await runEdit("phantom.txt", "a", "b", { workspaceRoot: workspace });

    const exists = await fs
      .access(path.join(workspace, "phantom.txt"))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  test("returns error for path escaping workspace", async () => {
    const runEdit = await importRunEdit();
    const result = await runEdit("../../etc/hosts", "a", "b", {
      workspaceRoot: workspace
    });
    expect(result).toMatch(/^Error:/);
    expect(result).toMatch(/escapes workspace/i);
  });

  test("returns error when path points to a directory", async () => {
    const runEdit = await importRunEdit();
    await fs.mkdir(path.join(workspace, "dir"));

    const result = await runEdit("dir", "a", "b", { workspaceRoot: workspace });
    expect(result).toMatch(/^Error:/);
  });
});
