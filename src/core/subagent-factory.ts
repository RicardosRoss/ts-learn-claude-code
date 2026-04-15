import type { ModelClient, AgentMessage } from "./types.js";
import type { ToolRegistry } from "./tool-registry.js";
import type { TodoManager } from "./todo-manager.js";
import { AgentRunner } from "./agent-runner.js";

/** Configuration for creating a SubagentFactory. */
export interface SubagentFactoryOptions {
  modelClient: ModelClient;
  parentToolRegistry: ToolRegistry;
  todoManager: TodoManager;
  workspaceRoot?: string;
  subagentSystemPrompt?: string;
}

/**
 * Factory for creating and running subagents with isolated context.
 * Each call to runSubagent() spawns a child agent with fresh messages
 * and filtered tools (no "task" tool to prevent recursive spawning).
 */
export class SubagentFactory {
  private readonly modelClient: ModelClient;
  private readonly parentToolRegistry: ToolRegistry;
  private readonly todoManager: TodoManager;
  private readonly workspaceRoot: string;
  private readonly subagentSystemPrompt: string;

  constructor(options: SubagentFactoryOptions) {
    this.modelClient = options.modelClient;
    this.parentToolRegistry = options.parentToolRegistry;
    this.todoManager = options.todoManager;
    this.workspaceRoot = options.workspaceRoot ?? process.cwd();
    this.subagentSystemPrompt = options.subagentSystemPrompt
      ?? `You are a coding subagent at ${this.workspaceRoot}. Complete the given task, then summarize your findings.`;
  }

  /**
   * Creates and runs a subagent for the given task.
   * The child agent runs in an isolated context with filtered tools (no "task").
   * Returns only the final text summary; subagent conversation is discarded.
   *
   * @param prompt - The task description sent as the first user message
   * @param description - Optional human-readable label for logging
   * @param maxTurns - Maximum turns (default: 30)
   * @returns The subagent's final text output
   */
  async runSubagent(prompt: string, description?: string, maxTurns?: number): Promise<string> {
    const childRegistry = this.createChildRegistry();
    const messages = this.createFreshMessages(prompt);

    const runner = new AgentRunner({
      modelClient: this.modelClient,
      toolRegistry: childRegistry,
      todoManager: this.todoManager,
      systemPrompt: this.subagentSystemPrompt,
      workspaceRoot: this.workspaceRoot,
      maxTurns: maxTurns ?? 30
    });

    const result = await runner.run(messages);
    return result.finalText || "(no summary)";
  }

  /** Creates a child registry by filtering out the 'task' tool. */
  private createChildRegistry(): ToolRegistry {
    const childToolNames = new Set(this.parentToolRegistry.list().map((tool) => tool.name));
    childToolNames.delete("task");
    return this.parentToolRegistry.filterByNames(childToolNames);
  }

  /** Creates a fresh message list for the child agent. */
  private createFreshMessages(prompt: string): AgentMessage[] {
    return [{ role: "user", content: prompt }];
  }
}
