import { describe, expect, test } from "vitest";
import os from "node:os";

import { runBash } from "../src/tools/bash-tool.js";

describe("runBash", () => {
  test("executes a normal command", async () => {
    const out = await runBash("echo hello", {
      cwd: os.tmpdir()
    });
    expect(out).toContain("hello");
  });

  test("blocks dangerous command", async () => {
    const out = await runBash("sudo whoami", {
      cwd: os.tmpdir()
    });
    expect(out).toContain("Dangerous command blocked");
  });

  // --- edge cases ---

  test("returns '(no output)' for command with no output", async () => {
    const out = await runBash("true", {
      cwd: os.tmpdir()
    });
    expect(out).toBe("(no output)");
  });

  test("includes stderr in output", async () => {
    const out = await runBash("echo err >&2", {
      cwd: os.tmpdir()
    });
    expect(out).toContain("err");
  });

  test("returns output even when command exits with non-zero code", async () => {
    const out = await runBash("echo oops && exit 1", {
      cwd: os.tmpdir()
    });
    expect(out).toContain("oops");
  });

  test("returns timeout error when command exceeds timeout", async () => {
    const out = await runBash("sleep 5", {
      cwd: os.tmpdir(),
      timeoutMs: 500
    });
    expect(out).toContain("Timeout");
  });

  test("blocks 'rm -rf /'", async () => {
    const out = await runBash("rm -rf /", { cwd: os.tmpdir() });
    expect(out).toContain("Dangerous command blocked");
  });

  test("blocks 'shutdown'", async () => {
    const out = await runBash("shutdown now", { cwd: os.tmpdir() });
    expect(out).toContain("Dangerous command blocked");
  });

  test("blocks 'reboot'", async () => {
    const out = await runBash("reboot", { cwd: os.tmpdir() });
    expect(out).toContain("Dangerous command blocked");
  });

  test("blocks '> /dev/' pattern", async () => {
    const out = await runBash("echo data > /dev/sda", { cwd: os.tmpdir() });
    expect(out).toContain("Dangerous command blocked");
  });

  test("respects custom dangerousPatterns override", async () => {
    // Default dangerous patterns should NOT apply when custom list is provided.
    // "shutdown" would be blocked by defaults, but with custom patterns it passes.
    const out = await runBash("echo shutdown_test", {
      cwd: os.tmpdir(),
      dangerousPatterns: ["only_this_pattern"]
    });
    expect(out).toContain("shutdown_test");
  });

  test("truncates output beyond maxOutputChars", async () => {
    const out = await runBash("python3 -c \"print('x' * 1000)\"", {
      cwd: os.tmpdir(),
      maxOutputChars: 10
    });
    expect(out.length).toBeLessThanOrEqual(10);
  });

  test("handles multi-line output", async () => {
    const out = await runBash("echo line1 && echo line2 && echo line3", {
      cwd: os.tmpdir()
    });
    expect(out).toContain("line1");
    expect(out).toContain("line2");
    expect(out).toContain("line3");
  });

  test("handles command with special characters", async () => {
    const out = await runBash("echo 'hello world'", {
      cwd: os.tmpdir()
    });
    expect(out).toContain("hello world");
  });

  test("returns error for non-existent working directory", async () => {
    const out = await runBash("echo hi", {
      cwd: "/nonexistent_dir_for_test_12345"
    });
    expect(out).toContain("Error");
  });

  test("runs command in workspace directory", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const os = await import("node:os");

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bash-workspace-"));
    await fs.writeFile(path.join(tmpDir, "marker.txt"), "workspace-content");

    const out = await runBash("cat marker.txt", { cwd: tmpDir });
    expect(out).toContain("workspace-content");

    await fs.rm(tmpDir, { recursive: true });
  });
});
