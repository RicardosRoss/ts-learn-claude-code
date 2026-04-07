import { describe, expect, test } from "vitest";

import {
  type ToolHandler,
  ToolRegistry
} from "../src/core/tool-registry.js";

describe("ToolRegistry", () => {
  test("registers and resolves a tool handler by name", () => {
    const registry = new ToolRegistry();
    const handler: ToolHandler = async () => "ok";
    registry.register({
      name: "test_tool",
      description: "test",
      handler
    });

    expect(registry.get("test_tool")?.handler).toBe(handler);
    expect(registry.list()).toHaveLength(1);
  });

  test("rejects duplicate tool registration", () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "dup_tool",
      description: "first",
      handler: async () => "first"
    });

    expect(() =>
      registry.register({
        name: "dup_tool",
        description: "second",
        handler: async () => "second"
      })
    ).toThrow(/already registered/);
  });

  // --- edge cases ---

  test("get() returns undefined for non-existent tool", () => {
    const registry = new ToolRegistry();
    expect(registry.get("no_such_tool")).toBeUndefined();
  });

  test("list() returns empty array for empty registry", () => {
    const registry = new ToolRegistry();
    expect(registry.list()).toEqual([]);
  });

  test("list() strips handler, only returns ToolDefinition", () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "my_tool",
      description: "desc",
      inputSchema: { type: "object", properties: { x: { type: "string" } } },
      handler: async () => "result"
    });

    const definitions = registry.list();
    expect(definitions).toHaveLength(1);
    expect(definitions[0]).toEqual({
      name: "my_tool",
      description: "desc",
      inputSchema: { type: "object", properties: { x: { type: "string" } } }
    });
    // Ensure handler is NOT in the list output.
    expect((definitions[0] as unknown as Record<string, unknown>).handler).toBeUndefined();
  });

  test("get() returns full RegisteredTool with handler", () => {
    const registry = new ToolRegistry();
    const handler: ToolHandler = async () => "hello";
    registry.register({ name: "a", description: "a tool", handler });

    const tool = registry.get("a");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("a");
    expect(tool!.description).toBe("a tool");
    expect(tool!.handler).toBe(handler);
  });

  test("registers multiple tools and list() returns all", () => {
    const registry = new ToolRegistry();
    registry.register({ name: "t1", description: "tool 1", handler: async () => "1" });
    registry.register({ name: "t2", description: "tool 2", handler: async () => "2" });
    registry.register({ name: "t3", description: "tool 3", handler: async () => "3" });

    expect(registry.list()).toHaveLength(3);
    expect(registry.get("t2")).toBeDefined();
    expect(registry.get("t3")).toBeDefined();
  });

  test("list() includes tool without inputSchema", () => {
    const registry = new ToolRegistry();
    registry.register({ name: "no_schema", description: "no schema tool", handler: async () => "ok" });

    const definitions = registry.list();
    expect(definitions[0].name).toBe("no_schema");
    expect(definitions[0].inputSchema).toBeUndefined();
  });
});
