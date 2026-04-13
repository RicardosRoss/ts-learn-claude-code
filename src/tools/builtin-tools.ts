import { ToolRegistry } from "../core/tool-registry.js";
import type { TodoManager, TodoItemInput } from "../core/todo-manager.js";
import { runBash } from "./bash-tool.js";
import { runRead, runWrite, runEdit } from "./file-tools.js";

/**
 * Registers all built-in tools for the current stage onto the given registry.
 * s03: bash + file tools (read/write/edit) + todo.
 */
export function registerBuiltinTools(registry: ToolRegistry, todoManager: TodoManager): void {
  registry.register({
    name: "bash",
    description: "Run a shell command.",
    inputSchema: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"]
    },
    handler: async (input, context) => {
      const command = readString(input, "command");
      return runBash(command, { cwd: context.workspaceRoot });
    }
  });

  registry.register({
    name: "read_file",
    description: "Read file contents.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, limit: { type: "integer" } },
      required: ["path"]
    },
    handler: async (input, context) => {
      const filePath = readString(input, "path");
      const limit = readOptionalNumber(input, "limit");
      return runRead(filePath, { workspaceRoot: context.workspaceRoot, limit });
    }
  });

  registry.register({
    name: "write_file",
    description: "Write content to file.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"]
    },
    handler: async (input, context) => {
      const filePath = readString(input, "path");
      const content = readString(input, "content");
      return runWrite(filePath, content, { workspaceRoot: context.workspaceRoot });
    }
  });

  registry.register({
    name: "edit_file",
    description: "Replace exact text in file.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        old_text: { type: "string" },
        new_text: { type: "string" }
      },
      required: ["path", "old_text", "new_text"]
    },
    handler: async (input, context) => {
      const filePath = readString(input, "path");
      const oldText = readString(input, "old_text");
      const newText = readString(input, "new_text");
      return runEdit(filePath, oldText, newText, { workspaceRoot: context.workspaceRoot });
    }
  });

  registry.register({
    name: "todo",
    description: "Update the session plan. Replaces the entire plan each call.",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              content: { type: "string" },
              status: { type: "string", enum: ["pending", "in_progress", "completed"] },
              activeForm: { type: "string" }
            },
            required: ["content", "status"]
          }
        }
      },
      required: ["items"]
    },
    handler: async (input) => {
      const items = readTodoItems(input);
      return todoManager.update(items);
    }
  });
}

/**
 * Runtime type guard: extracts a string value from the input object.
 * Throws a descriptive error if the value is missing or not a string.
 */
function readString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value === "string") {
    return value;
  }
  throw new Error(`Invalid input: ${key} must be a string`);
}

/**
 * Extracts an optional number from the input object.
 * Returns undefined if the key is missing; throws if present but not a number.
 */
function readOptionalNumber(input: Record<string, unknown>, key: string): number | undefined {
  if (!(key in input)) return undefined;
  const value = input[key];
  if (typeof value === "number") return value;
  throw new Error(`Invalid input: ${key} must be a number`);
}

const VALID_STATUSES = new Set(["pending", "in_progress", "completed"]);

/** Extracts the "items" array from todo tool input, throws if missing or malformed. */
function readTodoItems(input: Record<string, unknown>): TodoItemInput[] {
  const raw = input.items;
  if (!Array.isArray(raw)) throw new Error("Invalid input: items must be an array");

  return raw.map((item: unknown, i: number) => {
    if (typeof item !== "object" || item === null)
      throw new Error(`Invalid input: items[${i}] must be an object`);

    const obj = item as Record<string, unknown>;
    const content = obj.content;
    if (typeof content !== "string" || content.trim().length === 0)
      throw new Error(`Invalid input: items[${i}].content is required`);

    const status = obj.status;
    if (typeof status !== "string" || !VALID_STATUSES.has(status))
      throw new Error(`Invalid input: items[${i}].status must be pending, in_progress, or completed`);

    const activeForm = obj.activeForm;
    if (activeForm !== undefined && typeof activeForm !== "string")
      throw new Error(`Invalid input: items[${i}].activeForm must be a string`);

    return {
      content,
      status: status as TodoItemInput["status"],
      ...(activeForm !== undefined ? { activeForm } : {})
    };
  });
}
