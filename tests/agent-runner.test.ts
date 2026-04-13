import { describe, expect, test, vi } from "vitest";

import { AgentRunner } from "../src/core/agent-runner.js";
import { ToolRegistry } from "../src/core/tool-registry.js";
import { TodoManager } from "../src/core/todo-manager.js";
import {
  type AgentMessage,
  type ModelTurnRequest,
  type ModelTurnResponse
} from "../src/core/types.js";

describe("AgentRunner", () => {
  test("loops on tool_use and appends tool_result back to messages", async () => {
    const responses: ModelTurnResponse[] = [
      {
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "tool-1",
            name: "echo_tool",
            input: { text: "hello" }
          }
        ]
      },
      {
        stopReason: "end_turn",
        content: [{ type: "text", text: "done" }]
      }
    ];

    const createTurn = vi.fn(async (_req: ModelTurnRequest) => {
      const next = responses.shift();
      if (!next) {
        throw new Error("no more responses");
      }
      return next;
    });

    const registry = new ToolRegistry();
    registry.register({
      name: "echo_tool",
      description: "returns input text",
      handler: async (input) => `echo:${String(input.text ?? "")}`
    });

    const runner = new AgentRunner({
      modelClient: { createTurn },
      toolRegistry: registry,
      todoManager: new TodoManager(),
      systemPrompt: "test system"
    });

    const initialMessages: AgentMessage[] = [{ role: "user", content: "start" }];
    const result = await runner.run(initialMessages);

    expect(createTurn).toHaveBeenCalledTimes(2);
    expect(result.finalText).toBe("done");

    const toolResultMessage = result.messages.find(
      (msg) =>
        msg.role === "user" &&
        Array.isArray(msg.content) &&
        msg.content.some((part) => part.type === "tool_result")
    );
    expect(toolResultMessage).toBeDefined();
  });

  // --- edge cases ---

  test("returns immediately on end_turn without tool_use", async () => {
    const createTurn = vi.fn(async (): Promise<ModelTurnResponse> => ({
      stopReason: "end_turn",
      content: [{ type: "text", text: "direct answer" }]
    }));

    const runner = new AgentRunner({
      modelClient: { createTurn },
      toolRegistry: new ToolRegistry(),
      todoManager: new TodoManager(),
      systemPrompt: ""
    });

    const result = await runner.run([{ role: "user", content: "hi" }]);

    expect(createTurn).toHaveBeenCalledTimes(1);
    expect(result.finalText).toBe("direct answer");
  });

  test("handles multiple consecutive tool_use turns", async () => {
    const responses: ModelTurnResponse[] = [
      {
        stopReason: "tool_use",
        content: [{ type: "tool_use", id: "t1", name: "add", input: { x: 1 } }]
      },
      {
        stopReason: "tool_use",
        content: [{ type: "tool_use", id: "t2", name: "add", input: { x: 2 } }]
      },
      {
        stopReason: "end_turn",
        content: [{ type: "text", text: "final" }]
      }
    ];

    const createTurn = vi.fn(async (): Promise<ModelTurnResponse> => responses.shift()!);
    const registry = new ToolRegistry();
    registry.register({ name: "add", description: "add", handler: async (input) => `added ${input.x}` });

    const runner = new AgentRunner({
      modelClient: { createTurn },
      toolRegistry: registry,
      todoManager: new TodoManager(),
      systemPrompt: ""
    });

    const result = await runner.run([{ role: "user", content: "do stuff" }]);
    expect(createTurn).toHaveBeenCalledTimes(3);
    expect(result.finalText).toBe("final");
  });

  test("handles multiple tool_use blocks in a single response (parallel tool calls)", async () => {
    const responses: ModelTurnResponse[] = [
      {
        stopReason: "tool_use",
        content: [
          { type: "tool_use", id: "p1", name: "echo", input: { v: "a" } },
          { type: "tool_use", id: "p2", name: "echo", input: { v: "b" } }
        ]
      },
      {
        stopReason: "end_turn",
        content: [{ type: "text", text: "both done" }]
      }
    ];

    const createTurn = vi.fn(async (): Promise<ModelTurnResponse> => responses.shift()!);
    const registry = new ToolRegistry();
    registry.register({ name: "echo", description: "echo", handler: async (input) => String(input.v) });

    const runner = new AgentRunner({
      modelClient: { createTurn },
      toolRegistry: registry,
      todoManager: new TodoManager(),
      systemPrompt: ""
    });

    const result = await runner.run([{ role: "user", content: "parallel" }]);

    const toolResultMsg = result.messages.find(
      (msg) =>
        msg.role === "user" &&
        Array.isArray(msg.content) &&
        msg.content.some((p) => p.type === "tool_result")
    )!;
    const parts = (toolResultMsg.content as Array<{ type: string }>).filter(
      (p) => p.type === "tool_result"
    );
    expect(parts).toHaveLength(2);
    expect(result.finalText).toBe("both done");
  });

  test("returns 'Unknown tool' error for unregistered tool name", async () => {
    const responses: ModelTurnResponse[] = [
      {
        stopReason: "tool_use",
        content: [{ type: "tool_use", id: "u1", name: "nonexistent_tool", input: {} }]
      },
      {
        stopReason: "end_turn",
        content: [{ type: "text", text: "handled" }]
      }
    ];

    const createTurn = vi.fn(async (): Promise<ModelTurnResponse> => responses.shift()!);

    const runner = new AgentRunner({
      modelClient: { createTurn },
      toolRegistry: new ToolRegistry(),
      todoManager: new TodoManager(),
      systemPrompt: ""
    });

    const result = await runner.run([{ role: "user", content: "use unknown" }]);

    const toolResultMsg = result.messages.find(
      (msg) =>
        msg.role === "user" &&
        Array.isArray(msg.content) &&
        msg.content.some((p) => p.type === "tool_result")
    )!;
    const toolResultPart = (toolResultMsg.content as unknown as Array<Record<string, unknown>>).find(
      (p) => p.type === "tool_result"
    )!;
    expect(toolResultPart.content).toContain("Unknown tool");
  });

  test("returns error message when tool handler throws", async () => {
    const responses: ModelTurnResponse[] = [
      {
        stopReason: "tool_use",
        content: [{ type: "tool_use", id: "e1", name: "failing_tool", input: {} }]
      },
      {
        stopReason: "end_turn",
        content: [{ type: "text", text: "recovered" }]
      }
    ];

    const createTurn = vi.fn(async (): Promise<ModelTurnResponse> => responses.shift()!);
    const registry = new ToolRegistry();
    registry.register({
      name: "failing_tool",
      description: "always fails",
      handler: async () => { throw new Error("boom"); }
    });

    const runner = new AgentRunner({
      modelClient: { createTurn },
      toolRegistry: registry,
      todoManager: new TodoManager(),
      systemPrompt: ""
    });

    const result = await runner.run([{ role: "user", content: "fail" }]);

    const toolResultMsg = result.messages.find(
      (msg) =>
        msg.role === "user" &&
        Array.isArray(msg.content) &&
        msg.content.some((p) => p.type === "tool_result")
    )!;
    const toolResultPart = (toolResultMsg.content as unknown as Array<Record<string, unknown>>).find(
      (p) => p.type === "tool_result"
    )!;
    expect(toolResultPart.content).toContain("boom");
    expect(result.finalText).toBe("recovered");
  });

  test("throws when exceeding maxTurns", async () => {
    const createTurn = vi.fn(async (): Promise<ModelTurnResponse> => ({
      stopReason: "tool_use",
      content: [{ type: "tool_use", id: "loop", name: "loop_tool", input: {} }]
    }));

    const registry = new ToolRegistry();
    registry.register({ name: "loop_tool", description: "loops", handler: async () => "loop" });

    const runner = new AgentRunner({
      modelClient: { createTurn },
      toolRegistry: registry,
      todoManager: new TodoManager(),
      systemPrompt: "",
      maxTurns: 3
    });

    await expect(runner.run([{ role: "user", content: "loop" }])).rejects.toThrow(
      "Exceeded max turns: 3"
    );
  });

  test("handles mixed text + tool_use in same response", async () => {
    const responses: ModelTurnResponse[] = [
      {
        stopReason: "tool_use",
        content: [
          { type: "text", text: "thinking..." },
          { type: "tool_use", id: "mt1", name: "echo", input: { v: "hi" } }
        ]
      },
      {
        stopReason: "end_turn",
        content: [{ type: "text", text: "done thinking" }]
      }
    ];

    const createTurn = vi.fn(async (): Promise<ModelTurnResponse> => responses.shift()!);
    const registry = new ToolRegistry();
    registry.register({ name: "echo", description: "echo", handler: async (input) => String(input.v) });

    const runner = new AgentRunner({
      modelClient: { createTurn },
      toolRegistry: registry,
      todoManager: new TodoManager(),
      systemPrompt: ""
    });

    const result = await runner.run([{ role: "user", content: "mixed" }]);

    const assistantMsg = result.messages.find(
      (msg) => msg.role === "assistant"
    )!;
    expect(assistantMsg.content).toHaveLength(2);
    expect(assistantMsg.content[0].type).toBe("text");
    expect(assistantMsg.content[1].type).toBe("tool_use");
  });

  test("returns empty finalText when model response has no text blocks", async () => {
    const responses: ModelTurnResponse[] = [
      {
        stopReason: "tool_use",
        content: [{ type: "tool_use", id: "nt1", name: "echo", input: {} }]
      },
      {
        stopReason: "end_turn",
        content: [{ type: "tool_use", id: "ghost", name: "echo", input: {} }]
      }
    ];

    const createTurn = vi.fn(async (): Promise<ModelTurnResponse> => responses.shift()!);
    const registry = new ToolRegistry();
    registry.register({ name: "echo", description: "echo", handler: async () => "ok" });

    const runner = new AgentRunner({
      modelClient: { createTurn },
      toolRegistry: registry,
      todoManager: new TodoManager(),
      systemPrompt: ""
    });

    const result = await runner.run([{ role: "user", content: "test" }]);
    expect(result.finalText).toBe("");
  });

  test("does not mutate initial messages array", async () => {
    const createTurn = vi.fn(async (): Promise<ModelTurnResponse> => ({
      stopReason: "end_turn",
      content: [{ type: "text", text: "ok" }]
    }));

    const runner = new AgentRunner({
      modelClient: { createTurn },
      toolRegistry: new ToolRegistry(),
      todoManager: new TodoManager(),
      systemPrompt: ""
    });

    const initial: AgentMessage[] = [{ role: "user", content: "hi" }];
    await runner.run(initial);

    expect(initial).toHaveLength(1);
  });

  test("passes systemPrompt and tools to model client", async () => {
    const createTurn = vi.fn(async (): Promise<ModelTurnResponse> => ({
      stopReason: "end_turn",
      content: [{ type: "text", text: "ok" }]
    }));

    const registry = new ToolRegistry();
    registry.register({ name: "my_tool", description: "my desc", handler: async () => "" });

    const runner = new AgentRunner({
      modelClient: { createTurn },
      toolRegistry: registry,
      todoManager: new TodoManager(),
      systemPrompt: "custom prompt"
    });

    await runner.run([{ role: "user", content: "go" }]);

    expect(createTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: "custom prompt",
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "my_tool" })
        ])
      })
    );
  });

  test("emits tool execution events before and after a tool call", async () => {
    const responses: ModelTurnResponse[] = [
      {
        stopReason: "tool_use",
        content: [{ type: "tool_use", id: "evt-1", name: "echo_tool", input: { text: "hi" } }]
      },
      {
        stopReason: "end_turn",
        content: [{ type: "text", text: "done" }]
      }
    ];

    const createTurn = vi.fn(async (): Promise<ModelTurnResponse> => responses.shift()!);
    const registry = new ToolRegistry();
    registry.register({
      name: "echo_tool",
      description: "returns input text",
      handler: async (input) => `echo:${String(input.text ?? "")}`
    });
    const onToolExecution = vi.fn();

    const runner = new AgentRunner({
      modelClient: { createTurn },
      toolRegistry: registry,
      todoManager: new TodoManager(),
      systemPrompt: "",
      onToolExecution
    });

    await runner.run([{ role: "user", content: "run" }]);

    expect(onToolExecution).toHaveBeenCalledTimes(2);
    expect(onToolExecution.mock.calls[0][0]).toMatchObject({
      phase: "before",
      toolName: "echo_tool",
      toolUseId: "evt-1",
      isError: false
    });
    expect(onToolExecution.mock.calls[1][0]).toMatchObject({
      phase: "after",
      toolName: "echo_tool",
      toolUseId: "evt-1",
      output: "echo:hi",
      isError: false
    });
  });
});

// ---------------------------------------------------------------------------
// s03: reminder injection via TodoManager
// ---------------------------------------------------------------------------

describe("AgentRunner s03 reminder", () => {
  test("does not inject reminder when no plan exists", async () => {
    const todoManager = new TodoManager();
    const responses: ModelTurnResponse[] = [
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "echo", input: { v: "a" } }] },
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "t2", name: "echo", input: { v: "b" } }] },
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "t3", name: "echo", input: { v: "c" } }] },
      { stopReason: "end_turn", content: [{ type: "text", text: "done" }] }
    ];

    const createTurn = vi.fn(async (): Promise<ModelTurnResponse> => responses.shift()!);
    const registry = new ToolRegistry();
    registry.register({ name: "echo", description: "echo", handler: async (input) => String(input.v) });

    const runner = new AgentRunner({
      modelClient: { createTurn },
      toolRegistry: registry,
      systemPrompt: "",
      todoManager
    });

    const result = await runner.run([{ role: "user", content: "go" }]);

    for (const msg of result.messages) {
      if (msg.role === "user" && Array.isArray(msg.content)) {
        for (const part of msg.content as Array<{ type: string; text?: string }>) {
          if (part.type === "text") {
            expect(part.text).not.toContain("<reminder>");
          }
        }
      }
    }
  });

  test("does not inject reminder within first 2 rounds without todo update", async () => {
    const todoManager = new TodoManager();
    todoManager.update([{ content: "Plan exists", status: "pending" }]);

    const responses: ModelTurnResponse[] = [
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "r1", name: "echo", input: { v: "a" } }] },
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "r2", name: "echo", input: { v: "b" } }] },
      { stopReason: "end_turn", content: [{ type: "text", text: "done" }] }
    ];

    const createTurn = vi.fn(async (): Promise<ModelTurnResponse> => responses.shift()!);
    const registry = new ToolRegistry();
    registry.register({ name: "echo", description: "echo", handler: async (input) => String(input.v) });

    const runner = new AgentRunner({
      modelClient: { createTurn },
      toolRegistry: registry,
      systemPrompt: "",
      todoManager
    });

    const result = await runner.run([{ role: "user", content: "go" }]);

    for (const msg of result.messages) {
      if (msg.role === "user" && Array.isArray(msg.content)) {
        for (const part of msg.content as Array<{ type: string; text?: string }>) {
          if (part.type === "text") {
            expect(part.text).not.toContain("<reminder>");
          }
        }
      }
    }
  });

  test("injects reminder after 3 rounds without todo update", async () => {
    const todoManager = new TodoManager();
    todoManager.update([{ content: "Plan exists", status: "pending" }]);

    const responses: ModelTurnResponse[] = [
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "n1", name: "echo", input: { v: "1" } }] },
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "n2", name: "echo", input: { v: "2" } }] },
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "n3", name: "echo", input: { v: "3" } }] },
      { stopReason: "end_turn", content: [{ type: "text", text: "done" }] }
    ];

    const createTurn = vi.fn(async (): Promise<ModelTurnResponse> => responses.shift()!);
    const registry = new ToolRegistry();
    registry.register({ name: "echo", description: "echo", handler: async (input) => String(input.v) });

    const runner = new AgentRunner({
      modelClient: { createTurn },
      toolRegistry: registry,
      systemPrompt: "",
      todoManager
    });

    const result = await runner.run([{ role: "user", content: "go" }]);

    const userMessages = result.messages.filter(
      (msg) => msg.role === "user" && Array.isArray(msg.content)
    );
    const lastUserMsg = userMessages[userMessages.length - 1];
    const textParts = (lastUserMsg.content as Array<{ type: string; text?: string }>).filter(
      (p) => p.type === "text"
    );
    expect(textParts.some((p) => p.text?.includes("<reminder>"))).toBe(true);
  });

  test("resets reminder counter when todo tool is called", async () => {
    const todoManager = new TodoManager();

    const registry = new ToolRegistry();
    registry.register({
      name: "echo",
      description: "echo",
      handler: async (input) => String(input.v)
    });
    registry.register({
      name: "todo",
      description: "update plan",
      inputSchema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                content: { type: "string" },
                status: { type: "string", enum: ["pending", "in_progress", "completed"] }
              },
              required: ["content", "status"]
            }
          }
        },
        required: ["items"]
      },
      handler: async (input) => {
        const items = input.items as Array<{ content: string; status: "pending" | "in_progress" | "completed"; activeForm?: string }>;
        return todoManager.update(items);
      }
    });

    // echo, echo (2 rounds), todo (resets), echo, echo, echo (3 rounds -> reminder)
    const responses: ModelTurnResponse[] = [
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "a1", name: "echo", input: { v: "1" } }] },
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "a2", name: "echo", input: { v: "2" } }] },
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "a3", name: "todo", input: { items: [{ content: "Plan", status: "pending" }] } }] },
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "a4", name: "echo", input: { v: "4" } }] },
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "a5", name: "echo", input: { v: "5" } }] },
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "a6", name: "echo", input: { v: "6" } }] },
      { stopReason: "end_turn", content: [{ type: "text", text: "done" }] }
    ];

    const createTurn = vi.fn(async (): Promise<ModelTurnResponse> => responses.shift()!);

    const runner = new AgentRunner({
      modelClient: { createTurn },
      toolRegistry: registry,
      systemPrompt: "",
      todoManager
    });

    const result = await runner.run([{ role: "user", content: "go" }]);

    // Last user message should have reminder (3 rounds after todo reset)
    const userMessages = result.messages.filter(
      (msg) => msg.role === "user" && Array.isArray(msg.content)
    );
    const lastUserMsg = userMessages[userMessages.length - 1];
    const textParts = (lastUserMsg.content as Array<{ type: string; text?: string }>).filter(
      (p) => p.type === "text"
    );
    expect(textParts.some((p) => p.text?.includes("<reminder>"))).toBe(true);

    // The user message right after the todo call should NOT have a reminder
    const afterTodoMsg = userMessages[userMessages.length - 2];
    const afterTodoTextParts = (afterTodoMsg.content as Array<{ type: string; text?: string }>).filter(
      (p) => p.type === "text"
    );
    expect(afterTodoTextParts.every((p) => !p.text?.includes("<reminder>"))).toBe(true);
  });

  test("reminder is a TextPart prepended before tool_results", async () => {
    const todoManager = new TodoManager();
    todoManager.update([{ content: "Plan", status: "pending" }]);

    const responses: ModelTurnResponse[] = [
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "r1", name: "echo", input: { v: "1" } }] },
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "r2", name: "echo", input: { v: "2" } }] },
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "r3", name: "echo", input: { v: "3" } }] },
      { stopReason: "end_turn", content: [{ type: "text", text: "done" }] }
    ];

    const createTurn = vi.fn(async (): Promise<ModelTurnResponse> => responses.shift()!);
    const registry = new ToolRegistry();
    registry.register({ name: "echo", description: "echo", handler: async (input) => String(input.v) });

    const runner = new AgentRunner({
      modelClient: { createTurn },
      toolRegistry: registry,
      systemPrompt: "",
      todoManager
    });

    const result = await runner.run([{ role: "user", content: "go" }]);

    const userMessages = result.messages.filter(
      (msg) => msg.role === "user" && Array.isArray(msg.content)
    );
    const reminderMsg = userMessages.find((msg) =>
      (msg.content as Array<{ type: string; text?: string }>).some(
        (p) => p.type === "text" && p.text?.includes("<reminder>")
      )
    );
    expect(reminderMsg).toBeDefined();

    const parts = reminderMsg!.content as Array<{ type: string; text?: string }>;
    const reminderIdx = parts.findIndex(
      (p) => p.type === "text" && p.text?.includes("<reminder>")
    );
    const firstToolResultIdx = parts.findIndex((p) => p.type === "tool_result");
    // Reminder text part should come before tool_result parts
    expect(reminderIdx).toBeLessThan(firstToolResultIdx);
  });
});
