import readline from "node:readline/promises";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";

import { AgentRunner, type ToolExecutionEvent } from "../core/agent-runner.js";
import { AnthropicModelClient } from "../core/anthropic-model-client.js";
import { Compactor } from "../core/compactor.js";
import { HookRunner } from "../core/hook-runner.js";
import { MemoryStore } from "../core/memory-store.js";
import { PermissionManager } from "../core/permission-manager.js";
import { ToolRegistry } from "../core/tool-registry.js";
import { TodoManager } from "../core/todo-manager.js";
import { SkillLoader } from "../core/skill-loader.js";
import type { AgentMessage, AgentRunResult, ModelClient } from "../core/types.js";
import { registerBuiltinTools } from "../tools/builtin-tools.js";
import type { PermissionPromptOutput, PermissionPromptReadline } from "./permission-prompt.js";
import { requestPermissionFromUser } from "./permission-prompt.js";

export interface ReplReadline extends PermissionPromptReadline {
  close(): void;
}

export interface ReplOutput extends PermissionPromptOutput {}

export interface ReplRunner {
  run(initialMessages: AgentMessage[]): Promise<AgentRunResult>;
}

export interface ReplSessionOptions {
  rl: ReplReadline;
  output: ReplOutput;
  runner: ReplRunner;
  banner?: string;
  prompt?: string;
}

export interface ReplRunnerOptions {
  rl: ReplReadline;
  output: ReplOutput;
  modelClient: ModelClient;
  workspaceRoot?: string;
  skillRoot?: string;
  transcriptDir?: string;
  permissionManager?: PermissionManager;
}

/** Extracts the "command" field from bash tool input, returns empty string if missing. */
function readBashCommand(input: Record<string, unknown>): string {
  const command = input.command;
  return typeof command === "string" ? command : "";
}

/** Extracts the "name" field from load_skill tool input, returns fallback if missing. */
function readSkillName(input: Record<string, unknown>): string {
  const name = input.name;
  return typeof name === "string" && name.length > 0 ? name : "unknown";
}

/** Prints bash tool activity to the terminal: yellow command line before execution, output after. */
function createToolExecutionPrinter(output: ReplOutput): (event: ToolExecutionEvent) => void {
  return (event: ToolExecutionEvent): void => {
    if (event.toolName === "bash") {
      if (event.phase === "before") {
        const command = readBashCommand(event.input);
        if (command.length > 0) {
          output.write(`\u001B[33m$ ${command}\u001B[0m\n`);
        }
        return;
      }

      const preview = event.output.slice(0, 200).trimEnd();
      if (preview.length > 0) {
        output.write(`${preview}\n`);
      }
      return;
    }

    if (event.toolName === "todo" && event.phase === "after") {
      output.write(`${event.output}\n`);
    }

    if (event.toolName === "load_skill") {
      if (event.phase === "before") {
        const skillName = readSkillName(event.input);
        output.write(`\u001B[36m> load_skill (${skillName})\u001B[0m\n`);
        return;
      }
      const preview = event.output.slice(0, 200).trimEnd();
      if (preview.length > 0) {
        output.write(`  ${preview}\n`);
      }
    }
  };
}

/** Returns true if the error is caused by the readline interface being closed (EOF / pipe close). */
function isReadlineClosedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("readline was closed") || error.message.includes("ERR_USE_AFTER_CLOSE")
  );
}

/** Creates a REPL runner from injected dependencies. */
export function createReplRunner(options: ReplRunnerOptions): ReplRunner {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const registry = new ToolRegistry();
  const todoManager = new TodoManager();

  const skillLoader = new SkillLoader(options.skillRoot ?? path.resolve(workspaceRoot, "skills"));

  const compactor = new Compactor({
    modelClient: options.modelClient,
    transcriptDir: options.transcriptDir ?? path.resolve(workspaceRoot, ".transcripts")
  });
  const memoryStore = new MemoryStore({
    memoryDir: path.resolve(workspaceRoot, ".memory")
  });
  const permissionManager = options.permissionManager ?? new PermissionManager({ mode: "default" });
  const hookRunner = new HookRunner({
    handlers: {
      SessionStart: [() => ({ exitCode: 2, message: "s08 hook system ready." })],
      PostToolUse: [
        (event) =>
          event.payload.isError
            ? { exitCode: 2, message: `${event.payload.toolName} returned an error.` }
            : { exitCode: 0, message: "" }
      ]
    }
  });

  registerBuiltinTools({ registry, todoManager, skillLoader, memoryStore });

  const skillDescriptions = skillLoader.getDescriptions();
  const systemPrompt = [
    `You are a coding agent at ${workspaceRoot}.`,
    "Use load_skill to access specialized knowledge.",
    "",
    "Skills available:",
    skillDescriptions
  ].join("\n");

  return new AgentRunner({
    modelClient: options.modelClient,
    toolRegistry: registry,
    todoManager,
    systemPrompt,
    compactor,
    memoryStore,
    permissionManager,
    hookRunner,
    requestPermission: (request) =>
      requestPermissionFromUser(options.rl, options.output, {
        toolName: request.toolName,
        reason: request.reason,
        input: request.input
      }),
    onToolExecution: createToolExecutionPrinter(options.output),
    workspaceRoot
  });
}

/** Creates the real stage dependencies used by the command-line REPL. */
export function createDefaultReplRunner(rl: ReplReadline, output: ReplOutput): ReplRunner {
  return createReplRunner({
    rl,
    output,
    modelClient: new AnthropicModelClient()
  });
}

/** Runs the interactive read-eval-print loop with injected I/O and runner dependencies. */
export async function runReplSession(options: ReplSessionOptions): Promise<void> {
  const { rl, output, runner } = options;
  const banner = options.banner ?? "s09> real model ready. Type `exit` to quit.\n";
  const prompt = options.prompt ?? "s09 >> ";

  const history: AgentMessage[] = [];
  output.write(banner);

  try {
    while (true) {
      let rawLine: string;
      try {
        rawLine = await rl.question(prompt);
      } catch (error) {
        if (isReadlineClosedError(error)) {
          break;
        }
        throw error;
      }

      const line = rawLine.trim();
      if (!line || line.toLowerCase() === "exit" || line.toLowerCase() === "q") {
        break;
      }

      history.push({ role: "user", content: line });

      const result = await runner.run([...history]);
      history.splice(0, history.length, ...result.messages);

      if (result.finalText) {
        output.write(`${result.finalText}\n\n`);
      } else {
        output.write("(no text output)\n\n");
      }
    }
  } finally {
    rl.close();
  }
}

/** Entry point: wires up real dependencies and runs the command-line REPL. */
async function main(): Promise<void> {
  const rl = readline.createInterface({ input, output });
  const runner = createDefaultReplRunner(rl, output);
  await runReplSession({ rl, output, runner });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    output.write(`Fatal: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
