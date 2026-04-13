import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { AgentRunner, type ToolExecutionEvent } from "../core/agent-runner.js";
import { AnthropicModelClient } from "../core/anthropic-model-client.js";
import { ToolRegistry } from "../core/tool-registry.js";
import { TodoManager } from "../core/todo-manager.js";
import type { AgentMessage } from "../core/types.js";
import { registerBuiltinTools } from "../tools/builtin-tools.js";

/** Entry point: wires up dependencies and runs the interactive read-eval-print loop. */
async function main(): Promise<void> {
  const rl = readline.createInterface({ input, output });
  const registry = new ToolRegistry();
  const todoManager = new TodoManager();
  registerBuiltinTools(registry, todoManager);

  const runner = new AgentRunner({
    modelClient: new AnthropicModelClient(),
    toolRegistry: registry,
    todoManager,
    systemPrompt: `You are a coding agent at ${process.cwd()}. Use tools to solve tasks. Act, don't explain.`,
    onToolExecution: printToolExecution
  });

  const history: AgentMessage[] = [];
  output.write("s03> real model ready. Type `exit` to quit.\n");

  while (true) {
    let rawLine: string;
    try {
      rawLine = await rl.question("s03 >> ");
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

    const result = await runner.run(history);
    history.splice(0, history.length, ...result.messages);

    if (result.finalText) {
      output.write(`${result.finalText}\n\n`);
    } else {
      output.write("(no text output)\n\n");
    }
  }

  rl.close();
}

/** Prints bash tool activity to the terminal: yellow command line before execution, output after. */
function printToolExecution(event: ToolExecutionEvent): void {
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
}

/** Extracts the "command" field from bash tool input, returns empty string if missing. */
function readBashCommand(input: Record<string, unknown>): string {
  const command = input.command;
  return typeof command === "string" ? command : "";
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

main().catch((error) => {
  output.write(`Fatal: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
