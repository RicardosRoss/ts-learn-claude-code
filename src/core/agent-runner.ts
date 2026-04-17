import type {
  AgentMessage,
  AgentRunResult,
  ModelClient,
  ModelContentBlock,
  ModelToolUseBlock,
  TextPart,
  ToolResultPart
} from "./types.js";
import type { ToolExecutionContext } from "./tool-registry.js";
import type { TodoManager } from "./todo-manager.js";
import type { Compactor } from "./compactor.js";
import { ToolRegistry } from "./tool-registry.js";

/** Options for constructing an AgentRunner instance. */
export interface AgentRunnerOptions {
  modelClient: ModelClient;
  toolRegistry: ToolRegistry;
  todoManager: TodoManager;
  systemPrompt: string;
  workspaceRoot?: string;
  maxTurns?: number;
  /** s06: 可选 Compactor，启用三层压缩管线。 */
  compactor?: Compactor;
  onToolExecution?: (event: ToolExecutionEvent) => void;
}

/** Event emitted before and after each tool execution. */
export interface ToolExecutionEvent {
  phase: "before" | "after";
  toolName: string;
  toolUseId: string;
  input: Record<string, unknown>;
  output: string;
  isError: boolean;
}

/**
 * Agent main loop orchestrator.
 * Repeatedly calls the model, executes requested tools, and feeds results back
 * until the model stops requesting tools or maxTurns is exceeded.
 */
export class AgentRunner {
  private readonly modelClient: ModelClient;
  private readonly toolRegistry: ToolRegistry;
  private readonly todoManager: TodoManager;
  private readonly systemPrompt: string;
  private readonly execContext: ToolExecutionContext;
  private readonly maxTurns: number;
  private readonly compactor?: Compactor;
  private readonly onToolExecution?: (event: ToolExecutionEvent) => void;

  constructor(options: AgentRunnerOptions) {
    this.modelClient = options.modelClient;
    this.toolRegistry = options.toolRegistry;
    this.todoManager = options.todoManager;
    this.systemPrompt = options.systemPrompt;
    this.execContext = { workspaceRoot: options.workspaceRoot ?? process.cwd() };
    this.maxTurns = options.maxTurns ?? 30;
    this.compactor = options.compactor;
    this.onToolExecution = options.onToolExecution;
  }

  /**
   * Runs the agent loop on the given message history.
   * Returns the full conversation history and the model's final text output.
   * Throws if the loop exceeds maxTurns without the model finishing.
   */
  async run(initialMessages: AgentMessage[]): Promise<AgentRunResult> {
    const messages = [...initialMessages];

    for (let turn = 0; turn < this.maxTurns; turn += 1) {
      // s06 Layer 1: micro_compact — 每轮静默替换旧 tool_result
      this.compactor?.microCompact(messages);

      // s06 Layer 2: auto_compact — token 超阈值时保存 transcript + LLM 摘要
      if (this.compactor && this.compactor.estimateTokens(messages) > this.compactor.threshold) {
        const compacted = await this.compactor.autoCompact(messages);
        messages.length = 0;
        messages.push(...compacted);
      }

      const response = await this.modelClient.createTurn({
        systemPrompt: this.systemPrompt,
        messages,
        tools: this.toolRegistry.list()
      });

      messages.push({ role: "assistant", content: response.content });

      if (response.stopReason !== "tool_use") {
        return { messages, finalText: extractText(response.content) };
      }

      const toolExecuteResultContent: Array<ToolResultPart | TextPart> = [];
      let usedTodo = false;
      let usedCompact = false;

      for (const modelToolUseBlock of response.content) {
        if (modelToolUseBlock.type === "tool_use") {
          if (modelToolUseBlock.name === "todo") {
            usedTodo = true;
          }
          if (modelToolUseBlock.name === "compact") {
            usedCompact = true;
          }
          const tooluseResult = await this.executeTool(modelToolUseBlock);
          toolExecuteResultContent.push(tooluseResult);
        }
      }

      if (!usedTodo) {
        this.todoManager.noteRoundWithoutUpdate();
      }

      const reminderText = this.todoManager.reminder();
      if (reminderText !== null) {
        toolExecuteResultContent.unshift({ type: "text", text: reminderText });
      }

      messages.push({ role: "user", content: toolExecuteResultContent });

      // s06 Layer 3: manual compact — 模型调用 compact 工具后触发
      if (usedCompact && this.compactor) {
        const compacted = await this.compactor.autoCompact(messages);
        return { messages: compacted, finalText: "(context compacted)" };
      }
    }

    throw new Error(`Exceeded max turns: ${this.maxTurns}`);
  }

  /**
   * Executes a single tool call. Looks up the handler from the registry,
   * catches all exceptions, and always returns a ToolResultPart
   * (never throws — errors are surfaced to the model as tool result content).
   */
  private async executeTool(block: ModelToolUseBlock): Promise<ToolResultPart> {
    this.emitToolExecution({
      phase: "before",
      toolName: block.name,
      toolUseId: block.id,
      input: block.input,
      output: "",
      isError: false
    });

    const tool = this.toolRegistry.get(block.name);
    if (typeof tool === "undefined") {
      const unknownToolMessage = `Unknown tool: ${block.name}`;
      this.emitToolExecution({
        phase: "after",
        toolName: block.name,
        toolUseId: block.id,
        input: block.input,
        output: unknownToolMessage,
        isError: true
      });

      return {
        type: "tool_result",
        toolUseId: block.id,
        content: unknownToolMessage
      };
    }

    try {
      const toolResult = await tool.handler(block.input, this.execContext);
      this.emitToolExecution({
        phase: "after",
        toolName: block.name,
        toolUseId: block.id,
        input: block.input,
        output: toolResult,
        isError: false
      });
      return { type: "tool_result", toolUseId: block.id, content: toolResult };
    } catch (error) {
      const errorMessage = `Error: ${error instanceof Error ? error.message : String(error)}`;
      this.emitToolExecution({
        phase: "after",
        toolName: block.name,
        toolUseId: block.id,
        input: block.input,
        output: errorMessage,
        isError: true
      });
      return {
        type: "tool_result",
        toolUseId: block.id,
        content: errorMessage
      };
    }
  }

  /** Safely invokes the optional onToolExecution callback. */
  private emitToolExecution(event: ToolExecutionEvent): void {
    if (typeof this.onToolExecution === "function") {
      this.onToolExecution(event);
    }
  }
}

/** Extracts and concatenates all text blocks from the model's response content. */
function extractText(blocks: ModelContentBlock[]): string {
  let resText = "";
  for (const textblock of blocks) {
    if (textblock.type === "text") {
      resText += textblock.text + "\n";
    }
  }
  return resText.trim();
}
