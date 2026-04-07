import type {
  AgentMessage,
  AgentRunResult,
  ModelClient,
  ModelContentBlock,
  ModelToolUseBlock,
  ToolResultPart
} from "./types.js";
import type { ToolExecutionContext } from "./tool-registry.js";
import { ToolRegistry } from "./tool-registry.js";

/** Options for constructing an AgentRunner instance. */
export interface AgentRunnerOptions {
  modelClient: ModelClient;
  toolRegistry: ToolRegistry;
  systemPrompt: string;
  workspaceRoot?: string;
  maxTurns?: number;
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
  private readonly systemPrompt: string;
  private readonly execContext: ToolExecutionContext;
  private readonly maxTurns: number;
  private readonly onToolExecution?: (event: ToolExecutionEvent) => void;

  constructor(options: AgentRunnerOptions) {
    this.modelClient = options.modelClient;
    this.toolRegistry = options.toolRegistry;
    this.systemPrompt = options.systemPrompt;
    this.execContext = { workspaceRoot: options.workspaceRoot ?? process.cwd() };
    this.maxTurns = options.maxTurns ?? 30;
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
      const response = await this.modelClient.createTurn({
        systemPrompt: this.systemPrompt,
        messages,
        tools: this.toolRegistry.list()
      });

      messages.push({ role: "assistant", content: response.content });

      if (response.stopReason !== "tool_use") {
        return { messages, finalText: extractText(response.content) };
      }
      const toolExecuteResultContent: ToolResultPart[] = [];
      for (const modelToolUseBlock of response.content) {
        if (modelToolUseBlock.type === "tool_use") {
          const tooluseResult = await this.executeTool(modelToolUseBlock);
          toolExecuteResultContent.push(tooluseResult);
        }
      }
      messages.push({ role: "user", content: toolExecuteResultContent });
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
