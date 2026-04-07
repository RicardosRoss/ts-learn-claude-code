import Anthropic from "@anthropic-ai/sdk";
import { config as loadDotenv } from "dotenv";

import type {
  AgentMessage,
  ModelClient,
  ModelContentBlock,
  ModelToolUseBlock,
  ModelTurnRequest,
  ModelTurnResponse,
  ToolDefinition,
  UserContent
} from "./types.js";

/** Configuration options for the Anthropic model client. */
export interface AnthropicModelClientOptions {
  modelId?: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
}

/**
 * Model client adapter for the Anthropic-compatible API.
 * Handles environment variable loading, SDK initialization,
 * and bidirectional protocol conversion between internal types and SDK types.
 */
export class AnthropicModelClient implements ModelClient {
  private readonly client: Anthropic;
  private readonly modelId: string;
  private readonly maxTokens: number;

  constructor(options: AnthropicModelClientOptions = {}) {
    loadDotenv({ override: true });

    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("Missing ANTHROPIC_API_KEY");
    }

    const modelId = options.modelId ?? process.env.MODEL_ID;
    if (!modelId) {
      throw new Error("Missing MODEL_ID");
    }

    const baseUrl = options.baseUrl ?? process.env.ANTHROPIC_BASE_URL;
    if (baseUrl) {
      delete process.env.ANTHROPIC_AUTH_TOKEN;
    }

    this.maxTokens = resolveMaxTokens(options.maxTokens);
    this.modelId = modelId;
    this.client = new Anthropic({ apiKey, baseURL: baseUrl });
  }

  /** Sends a model turn request and returns the normalized response. */
  async createTurn(request: ModelTurnRequest): Promise<ModelTurnResponse> {
    const response = await this.client.messages.create({
      model: this.modelId,
      system: request.systemPrompt,
      max_tokens: this.maxTokens,
      tools: toAnthropicTools(request.tools) as unknown as Parameters<
        Anthropic["messages"]["create"]
      >[0]["tools"],
      messages: toAnthropicMessages(request.messages) as unknown as Parameters<
        Anthropic["messages"]["create"]
      >[0]["messages"]
    });

    return {
      stopReason: response.stop_reason ?? "end_turn",
      content: fromAnthropicContent(response.content as unknown as Array<Record<string, unknown>>)
    };
  }
}

/** Resolves max output tokens from explicit option, env variable, or default (8000). */
function resolveMaxTokens(explicitMaxTokens: number | undefined): number {
  if (typeof explicitMaxTokens === "number" && Number.isFinite(explicitMaxTokens)) {
    return explicitMaxTokens;
  }

  const raw = process.env.MAX_TOKENS;
  if (!raw) {
    return 8000;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 8000;
}

/** Converts internal tool definitions to Anthropic SDK tool format. */
function toAnthropicTools(tools: ToolDefinition[]): Array<Record<string, unknown>> {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema ?? {
      type: "object",
      properties: {},
      required: []
    }
  }));
}

/** Converts internal message history to Anthropic SDK message format. */
function toAnthropicMessages(messages: AgentMessage[]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    if (message.role === "user") {
      return {
        role: "user",
        content: toAnthropicUserContent(message.content)
      };
    }

    return {
      role: "assistant",
      content: message.content.map((block) => toAnthropicAssistantBlock(block))
    };
  });
}

/** Converts user content (string or structured parts) to SDK-compatible format. */
function toAnthropicUserContent(content: UserContent): string | Array<Record<string, unknown>> {
  if (typeof content === "string") {
    return content;
  }

  return content.map((part) => {
    if (part.type === "tool_result") {
      return {
        type: "tool_result",
        tool_use_id: part.toolUseId,
        content: part.content
      };
    }

    return {
      type: "text",
      text: part.text
    };
  });
}

/** Converts a single assistant content block to SDK format. */
function toAnthropicAssistantBlock(block: ModelContentBlock): Record<string, unknown> {
  if (block.type === "text") {
    return { type: "text", text: block.text };
  }

  return {
    type: "tool_use",
    id: block.id,
    name: block.name,
    input: block.input
  };
}

/** Parses raw SDK response content into internal ModelContentBlock types. */
function fromAnthropicContent(content: Array<Record<string, unknown>>): ModelContentBlock[] {
  const result: ModelContentBlock[] = [];

  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string") {
      result.push({ type: "text", text: block.text });
      continue;
    }

    if (
      block.type === "tool_use" &&
      typeof block.id === "string" &&
      typeof block.name === "string"
    ) {
      result.push({
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: normalizeToolInput(block)
      } satisfies ModelToolUseBlock);
    }
  }

  if (result.length === 0) {
    result.push({ type: "text", text: "" });
  }

  return result;
}

/** Ensures tool input is a plain object; returns empty object for malformed input. */
function normalizeToolInput(block: Record<string, unknown>): Record<string, unknown> {
  const raw = block.input;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return raw as Record<string, unknown>;
}
