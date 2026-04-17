import readline from "node:readline/promises";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";

import { AgentRunner, type ToolExecutionEvent } from "../core/agent-runner.js";
import { AnthropicModelClient } from "../core/anthropic-model-client.js";
import { Compactor } from "../core/compactor.js";
import { ToolRegistry } from "../core/tool-registry.js";
import { TodoManager } from "../core/todo-manager.js";
import { SkillLoader } from "../core/skill-loader.js";
import type { AgentMessage } from "../core/types.js";
import { registerBuiltinTools } from "../tools/builtin-tools.js";

/** Entry point: wires up dependencies and runs the interactive read-eval-print loop. */
async function main(): Promise<void> {
  const rl = readline.createInterface({ input, output });
  const registry = new ToolRegistry();
  const todoManager = new TodoManager();

  const modelClient = new AnthropicModelClient();

  const skillLoader = new SkillLoader(
    path.resolve(process.cwd(), "skills")
  );

  const compactor = new Compactor({
    modelClient,
    transcriptDir: path.resolve(process.cwd(), ".transcripts")
  });

  registerBuiltinTools({ registry, todoManager, skillLoader });

  const skillDescriptions = skillLoader.getDescriptions();
  const systemPrompt = [
    `You are a coding agent at ${process.cwd()}.`,
    "Use load_skill to access specialized knowledge.",
    "",
    "Skills available:",
    skillDescriptions
  ].join("\n");

  const runner = new AgentRunner({
    modelClient,
    toolRegistry: registry,
    todoManager,
    systemPrompt,
    compactor,
    onToolExecution: printToolExecution
  });

  const history: AgentMessage[] = [];
  output.write("s06> real model ready. Type `exit` to quit.\n");

  while (true) {
    let rawLine: string;
    try {
      rawLine = await rl.question("s06 >> ");
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
