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
    // TODO: 实现
    // JSON.stringify(messages).length / 4，向下取整
    void messages;
    return 0;
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
    // TODO: 实现
    // 1. 遍历所有消息，收集 (msgIdx, partIdx, part) 中 type === "tool_result" 的条目
    // 2. 从 assistant 消息中构建 tool_use_id → tool_name 的映射表
    // 3. 如果 tool_result 数量 <= keepRecent，无需处理
    // 4. 对超出 keepRecent 的部分：
    //    - 内容 ≤ 100 字符 → 跳过
    //    - tool_name 在 preserveTools 中 → 跳过
    //    - 其余：将 part.content 替换为 "[Previous: used {tool_name}]"
    void messages;
  }

  /**
   * Layer 2/3: 完整压缩。保存 transcript 到磁盘，请求 LLM 生成摘要，
   * 返回压缩后的消息列表（单条 user 消息包含摘要）。
   */
  async autoCompact(messages: AgentMessage[]): Promise<AgentMessage[]> {
    // TODO: 实现
    // 1. fs.mkdirSync(transcriptDir, { recursive: true }) — 确保 .transcripts 目录存在
    // 2. Math.floor(Date.now() / 1000) → Unix 时间戳
    // 3. path.join(transcriptDir, `transcript_${ts}.jsonl`) → 文件路径
    // 4. messages.map(m => JSON.stringify(m)).join("\n") + "\n" → JSONL 内容
    // 5. fs.writeFileSync(transcriptPath, lines) — 保存 transcript
    // 6. JSON.stringify(messages).slice(-80000) → 截取末尾对话文本
    // 7. modelClient.createTurn({ systemPrompt, messages: [摘要请求], tools: [] })
    // 8. 从响应中提取文本作为摘要，无文本则用 "No summary generated."
    // 9. 返回 [单条 user 消息: "[Conversation compressed. Transcript: {path}]\n\n{摘要}"]
    void messages;
    return [];
  }
}

/**
 * 从 assistant 消息中构建 tool_use_id → tool_name 的映射。
 * 用于 microCompact 时确定 tool_result 来自哪个工具。
 */
function buildToolNameMap(messages: AgentMessage[]): Map<string, string> {
  // TODO: 实现
  // 遍历消息，找到 role === "assistant" 的消息
  // 遍历其 content，找到 type === "tool_use" 的 block
  // 将 block.id → block.name 存入 Map
  void messages;
  return new Map();
}
