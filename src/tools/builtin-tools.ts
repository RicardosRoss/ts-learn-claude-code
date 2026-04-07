import { ToolRegistry } from "../core/tool-registry.js";
import { runBash } from "./bash-tool.js";

/**
 * Registers all built-in tools for the current stage onto the given registry.
 * s01: bash only. File tools (read/write/edit) are added in s02.
 */
export function registerBuiltinTools(registry: ToolRegistry): void {
  registry.register({
    name: "bash",
    description: "Run a shell command.",
    handler: async (input, context) => {
      const command = readString(input, "command");
      return runBash(command, { cwd: context.workspaceRoot });
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
