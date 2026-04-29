import fs from "node:fs";
import path from "node:path";

import type { AgentMessage, ModelClient, ToolResultPart } from "./types.js";

/** Compactor 构造选项。 */
export interface CompactorOptions {
  /** 模型客户端，用于 auto_compact 时调用 LLM 生成摘要。 */
  modelClient: ModelClient;
  /** transcript 保存目录的绝对路径。 */
  transcriptDir: string;
  /** auto_compact 触发的 token 阈值，默认 50000。 */
  threshold?: number;
  /** micro_compact 保留的最近 tool_result 数量，默认 3。 */
  keepRecent?: number;
  /** 结果不被压缩的工具名集合，默认 {"read_file"}。 */
  preserveTools?: Set<string>;
}

/**
 * 从 assistant 消息中构建 tool_use_id → tool_name 的映射。
 * 用于 microCompact 时确定 tool_result 来自哪个工具。
 */
function buildToolNameMap(messages: AgentMessage[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const msg of messages) {
    if (msg.role === "assistant") {
      for (const block of msg.content) {
        if (block.type === "tool_use") {
          map.set(block.id, block.name);
        }
      }
    }
  }
  return map;
}

/**
 * 三层上下文压缩管线：
 *   Layer 1 (microCompact): 每轮静默替换旧 tool_result 为占位符
 *   Layer 2 (autoCompact):  token 超阈值时保存 transcript + LLM 摘要
 *   Layer 3 (compact tool): 模型手动触发，同 Layer 2
 */
export class Compactor {
  private readonly modelClient: ModelClient;
  private readonly transcriptDir: string;
  readonly threshold: number;
  private readonly keepRecent: number;
  private readonly preserveTools: Set<string>;

  constructor(options: CompactorOptions) {
    this.modelClient = options.modelClient;
    this.transcriptDir = options.transcriptDir;
    this.threshold = options.threshold ?? 50000;
    this.keepRecent = options.keepRecent ?? 3;
    this.preserveTools = options.preserveTools ?? new Set(["read_file"]);
  }

  /**
   * 粗略估算消息列表的 token 数（~4 字符 ≈ 1 token）。
   * 用于判断是否需要触发 auto_compact。
   */
  estimateTokens(messages: AgentMessage[]): number {
    let usercontent = 0,
      assistantcontent = 0;
    for (let message of messages) {
      if (message.role == "user") usercontent += message.content.length;
      else {
        assistantcontent += JSON.stringify(message.content).length;
      }
    }
    return (usercontent + assistantcontent) / 4;
  }

  /**
   * Layer 1: 微压缩。就地修改消息列表中旧的 tool_result 内容为占位符。
   *
   * 规则：
   * - 保留最近 keepRecent 条 tool_result 不动
   * - read_file 的结果不被替换（参考材料，压缩后需要重读）
   * - 内容 ≤ 100 字符的不替换（太短没有压缩价值）
   * - 替换格式: "[Previous: used {tool_name}]"
   */
  microCompact(messages: AgentMessage[]): void {
    const toolNameMap = buildToolNameMap(messages);

    // 1. 收集所有 tool_result 的位置和引用
    const toolResults: Array<{ part: ToolResultPart }> = [];
    for (const msg of messages) {
      if (msg.role === "user" && Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === "tool_result") {
            toolResults.push({ part });
          }
        }
      }
    }

    // 2. 数量不够，无需处理
    if (toolResults.length <= this.keepRecent) return;

    // 3. 对超出 keepRecent 的旧条目，就地替换
    const olderResults = toolResults.slice(0, toolResults.length - this.keepRecent);
    for (const { part } of olderResults) {
      if (part.content.length <= 100) continue;
      const toolName = toolNameMap.get(part.toolUseId);
      if (toolName && this.preserveTools.has(toolName)) continue;
      part.content = `[Previous: used ${toolName ?? "unknown"}]`;
    }
  }

  /**
   * Layer 2/3: 完整压缩。保存 transcript 到磁盘，请求 LLM 生成摘要，
   * 返回压缩后的消息列表（单条 user 消息包含摘要）。
   */
  async autoCompact(messages: AgentMessage[]): Promise<AgentMessage[]> {
    // 1. 确保 .transcripts 目录存在
    fs.mkdirSync(this.transcriptDir, { recursive: true });

    // 2-3. 用 Unix 时间戳生成 transcript 文件名
    const ts = Math.floor(Date.now() / 1000);
    const transcriptPath = path.join(this.transcriptDir, `transcript_${ts}.jsonl`);

    // 4-5. 保存完整对话为 JSONL
    const lines = messages.map((m) => JSON.stringify(m)).join("\n") + "\n";
    fs.writeFileSync(transcriptPath, lines);

    // 6. 截取末尾对话文本（避免发给 LLM 的内容过长）
    const conversationText = JSON.stringify(messages).slice(-80000);

    // 7. 请求 LLM 生成摘要
    const response = await this.modelClient.createTurn({
      systemPrompt: "Summarize the conversation, preserving key decisions and context.",
      messages: [{ role: "user", content: `Summarize this conversation:\n\n${conversationText}` }],
      tools: []
    });

    // 8. 从响应中提取文本摘要
    let summary = "No summary generated.";
    for (const block of response.content) {
      if (block.type === "text") {
        summary = block.text;
        break;
      }
    }

    // 9. 返回单条 user 消息，包含 transcript 路径和摘要
    return [
      {
        role: "user",
        content: `[Conversation compressed. Transcript: ${transcriptPath}]\n\n${summary}`
      }
    ];
  }
}
