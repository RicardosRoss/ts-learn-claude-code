import { describe, expect, test, vi } from "vitest";

import { HookRunner } from "../src/core/hook-runner.js";

describe("HookRunner", () => {
  test("returns continue when no handler is registered", async () => {
    const runner = new HookRunner();

    await expect(runner.run("SessionStart", { cwd: "/tmp/project" })).resolves.toEqual({
      exitCode: 0,
      message: ""
    });
  });

  test("runs handlers in registration order and returns continue when all continue", async () => {
    const calls: string[] = [];
    const runner = new HookRunner({
      handlers: {
        SessionStart: [
          () => {
            calls.push("first");
            return { exitCode: 0, message: "" };
          },
          () => {
            calls.push("second");
            return { exitCode: 0, message: "" };
          }
        ]
      }
    });

    await expect(runner.run("SessionStart", { cwd: "/tmp/project" })).resolves.toEqual({
      exitCode: 0,
      message: ""
    });
    expect(calls).toEqual(["first", "second"]);
  });

  test("short-circuits its handler chain when a handler returns exitCode 1", async () => {
    const skipped = vi.fn();
    const runner = new HookRunner({
      handlers: {
        PreToolUse: [() => ({ exitCode: 1, message: "blocked" }), skipped]
      }
    });

    await expect(
      runner.run("PreToolUse", {
        toolName: "bash",
        toolUseId: "tool-1",
        input: { command: "npm test" }
      })
    ).resolves.toEqual({ exitCode: 1, message: "blocked" });
    expect(skipped).not.toHaveBeenCalled();
  });

  test("short-circuits when a handler returns exitCode 2", async () => {
    const skipped = vi.fn();
    const runner = new HookRunner({
      handlers: {
        PostToolUse: [() => ({ exitCode: 2, message: "note" }), skipped]
      }
    });

    await expect(
      runner.run("PostToolUse", {
        toolName: "read_file",
        toolUseId: "tool-2",
        input: { path: "README.md" },
        output: "content",
        isError: false
      })
    ).resolves.toEqual({ exitCode: 2, message: "note" });
    expect(skipped).not.toHaveBeenCalled();
  });

  test("wraps thrown handler errors as warning results", async () => {
    const runner = new HookRunner({
      handlers: {
        SessionStart: [
          () => {
            throw new Error("boom");
          }
        ]
      }
    });

    await expect(runner.run("SessionStart", { cwd: "/tmp/project" })).resolves.toEqual({
      exitCode: 1,
      message: "Hook handler failed: boom"
    });
  });
});
