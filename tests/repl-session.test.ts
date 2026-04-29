import { describe, expect, test, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createReplRunner, runReplSession, type ReplRunner } from "../src/cli/repl.js";
import type { AgentMessage, ModelTurnResponse } from "../src/core/types.js";

function createQuestionStub(answers: string[]) {
  return vi.fn(async () => {
    const answer = answers.shift();
    if (typeof answer === "undefined") {
      throw new Error("readline was closed");
    }
    return answer;
  });
}

describe("runReplSession", () => {
  test("runs user input through an injected runner without requiring the real model", async () => {
    const runner: ReplRunner = {
      run: vi.fn(async (messages: AgentMessage[]) => {
        const assistantMessage: AgentMessage = {
          role: "assistant",
          content: [{ type: "text", text: "ok" }]
        };
        return {
          messages: [...messages, assistantMessage],
          finalText: "ok"
        };
      })
    };
    const rl = {
      question: createQuestionStub(["hello", "exit"]),
      close: vi.fn()
    };
    const output = { write: vi.fn() };

    await runReplSession({ rl, output, runner });

    expect(runner.run).toHaveBeenCalledWith([{ role: "user", content: "hello" }]);
    expect(output.write).toHaveBeenCalledWith("ok\n\n");
    expect(rl.close).toHaveBeenCalledTimes(1);
  });

  test("exits before invoking runner for q, exit, or blank input", async () => {
    for (const line of ["q", "exit", ""]) {
      const runner: ReplRunner = { run: vi.fn() };
      const rl = {
        question: createQuestionStub([line]),
        close: vi.fn()
      };

      await runReplSession({ rl, output: { write: vi.fn() }, runner });

      expect(runner.run).not.toHaveBeenCalled();
      expect(rl.close).toHaveBeenCalledTimes(1);
    }
  });

  test("rejects an ask tool call without touching the real file handler", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "repl-reject-"));
    try {
      const responses: ModelTurnResponse[] = [
        {
          stopReason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "write-1",
              name: "write_file",
              input: { path: "blocked.txt", content: "blocked" }
            }
          ]
        },
        {
          stopReason: "end_turn",
          content: [{ type: "text", text: "blocked by user" }]
        }
      ];
      const modelClient = {
        createTurn: vi.fn(async () => responses.shift()!)
      };
      const rl = {
        question: createQuestionStub(["please write", "n", "exit"]),
        close: vi.fn()
      };
      const output = { write: vi.fn() };
      const runner = createReplRunner({ rl, output, modelClient, workspaceRoot });

      await runReplSession({ rl, output, runner });

      await expect(readFile(path.join(workspaceRoot, "blocked.txt"), "utf-8")).rejects.toThrow();
      expect(output.write).toHaveBeenCalledWith(
        expect.stringContaining("Permission required: write_file")
      );
      expect(output.write).toHaveBeenCalledWith("blocked by user\n\n");
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("approves an ask tool call and then executes the real file handler", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "repl-approve-"));
    try {
      const responses: ModelTurnResponse[] = [
        {
          stopReason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "write-1",
              name: "write_file",
              input: { path: "allowed.txt", content: "allowed" }
            }
          ]
        },
        {
          stopReason: "end_turn",
          content: [{ type: "text", text: "wrote file" }]
        }
      ];
      const modelClient = {
        createTurn: vi.fn(async () => responses.shift()!)
      };
      const rl = {
        question: createQuestionStub(["please write", "y", "exit"]),
        close: vi.fn()
      };
      const output = { write: vi.fn() };
      const runner = createReplRunner({ rl, output, modelClient, workspaceRoot });

      await runReplSession({ rl, output, runner });

      await expect(readFile(path.join(workspaceRoot, "allowed.txt"), "utf-8")).resolves.toBe(
        "allowed"
      );
      expect(output.write).toHaveBeenCalledWith("wrote file\n\n");
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
