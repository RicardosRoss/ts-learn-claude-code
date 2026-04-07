/** JSON Schema object describing a tool's input parameters. */
export type ToolSchema = Record<string, unknown>;

/** Metadata about a tool, exposed to the model for tool selection. */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema?: ToolSchema;
}

/** Carries a tool execution result back to the model as a user message part. */
export interface ToolResultPart {
  type: "tool_result";
  toolUseId: string;
  content: string;
}

/** Plain text part within a user message. */
export interface TextPart {
  type: "text";
  text: string;
}

/** Text block returned by the model. */
export interface ModelTextBlock {
  type: "text";
  text: string;
}

/** Tool-use request block returned by the model. */
export interface ModelToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Union of all content block types the model can return. */
export type ModelContentBlock = ModelTextBlock | ModelToolUseBlock;

/** Content of a user message: either a plain string or an array of structured parts. */
export type UserContent = string | Array<ToolResultPart | TextPart>;

/** Message from the user. */
export interface UserMessage {
  role: "user";
  content: UserContent;
}

/** Message from the assistant (model). */
export interface AssistantMessage {
  role: "assistant";
  content: ModelContentBlock[];
}

/** Union type for all messages in the agent conversation history. */
export type AgentMessage = UserMessage | AssistantMessage;

/** Request payload sent to the model for one inference turn. */
export interface ModelTurnRequest {
  systemPrompt: string;
  messages: AgentMessage[];
  tools: ToolDefinition[];
}

/** Response from one model inference turn. */
export interface ModelTurnResponse {
  stopReason: string;
  content: ModelContentBlock[];
}

/** Adapter interface for model providers. Implementations handle SDK-specific details. */
export interface ModelClient {
  createTurn(request: ModelTurnRequest): Promise<ModelTurnResponse>;
}

/** Result of an agent run: the full conversation history and the final text output. */
export interface AgentRunResult {
  messages: AgentMessage[];
  finalText: string;
}
