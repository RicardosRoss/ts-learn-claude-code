import type { ToolDefinition } from "./types.js";

/** Execution context passed to every tool handler. */
export interface ToolExecutionContext {
  workspaceRoot: string;
}

/** Function signature for tool handlers. Receives parsed input and execution context. */
export type ToolHandler = (
  input: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<string> | string;

/** A fully registered tool: definition metadata plus executable handler. */
export interface RegisteredTool extends ToolDefinition {
  handler: ToolHandler;
}

/**
 * Generic tool registry. Stores named tool handlers and provides
 * lookup by name and listing of tool definitions for the model.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  /** Registers a tool. Throws if a tool with the same name already exists. */
  register(tool: RegisteredTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  /** Looks up a registered tool by name. Returns undefined if not found. */
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /** Returns tool definitions (without handlers) for inclusion in model requests. */
  list(): ToolDefinition[] {
    const result: ToolDefinition[] = [];

    for (const tool of this.tools.values()) {
      const { handler, ...definition } = tool;
      result.push(definition);
    }

    return result;
  }

  /**
   * Returns a new ToolRegistry containing only the tools whose names
   * are in the whitelist. Does not modify the original registry.
   */
  filterByNames(whitelist: Set<string>): ToolRegistry {
    let subagentToolRegistry = new ToolRegistry();
    this.tools.forEach((tool) => {
      if (whitelist.has(tool.name)) {
        subagentToolRegistry.register(tool);
      }
    });
    return subagentToolRegistry;
  }
}
