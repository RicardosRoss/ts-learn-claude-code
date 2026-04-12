import { ToolRegistry } from "../core/tool-registry.js";
import { runBash } from "./bash-tool.js";
import { runRead, runWrite, runEdit } from "./file-tools.js";

/**
 * Registers all built-in tools for the current stage onto the given registry.
 * s02: bash + file tools (read/write/edit).
 */
export function registerBuiltinTools(registry: ToolRegistry): void {
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
