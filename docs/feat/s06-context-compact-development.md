# s06: Context Compact 开发文档

## 阶段目标

实现三层上下文压缩管线，使 agent 能在无限会话中持续工作：
- Layer 1: micro_compact — 每轮静默替换旧 tool_result 为占位符
- Layer 2: auto_compact — token 超阈值时自动保存 transcript + LLM 摘要
- Layer 3: compact tool — 模型手动触发压缩

## 核心概念

```
每轮循环:
+------------------+
| Tool call result |
+------------------+
        |
        v
[Layer 1: micro_compact]        (静默，每轮)
  将超过最近 3 条的非 read_file tool_result
  替换为 "[Previous: used {tool_name}]"
        |
        v
[Check: tokens > 50000?]
   |               |
   no              yes
   |               |
   v               v
continue    [Layer 2: auto_compact]
              保存完整 transcript 到 .transcripts/
              请求 LLM 摘要对话
              用 [summary] 替换所有消息
                    |
                    v
            [Layer 3: compact tool]
              模型调用 compact → 立即摘要
              同 auto，手动触发
```

## 相对 s05 的变更

| 组件 | s05 | s06 |
|---|---|---|
| 工具 | bash + file + todo + load_skill | bash + file + todo + load_skill + **compact** |
| AgentRunner | 简单循环 | + micro_compact 每轮 + auto_compact 阈值检查 |
| 新模块 | SkillLoader | **Compactor** |
| 新目录 | skills/ | **.transcripts/** |

## 需要新建的文件

1. **`src/core/compactor.ts`** — Compactor 类
   - `estimateTokens(messages)` — 粗略 token 计数（~4 chars/token）
   - `microCompact(messages)` — 就地替换旧 tool_result
   - `autoCompact(messages)` — 保存 transcript + LLM 摘要 + 返回压缩消息

## 需要修改的文件

1. **`src/core/agent-runner.ts`**
   - 构造函数接受 Compactor 实例
   - 循环内每轮调用 `microCompact`
   - 调用前检查 `estimateTokens` 超阈值则 `autoCompact`
   - 检测 compact tool 调用，触发手动压缩

2. **`src/tools/builtin-tools.ts`**
   - 新增 `compact` 工具

3. **`src/cli/repl.ts`**
   - 创建 Compactor 实例并传给 AgentRunner
   - 提示符从 `s05` 更新为 `s06`

4. **`tests/repl-smoke.test.ts`**
   - 断言 `s05` → `s06`

## 实现顺序

1. 实现 `Compactor` 类
2. 修改 `agent-runner.ts`（集成压缩管线）
3. 修改 `builtin-tools.ts`（新增 compact 工具）
4. 修改 `repl.ts`（接入 Compactor + 更新提示符）
5. 更新冒烟测试
6. 验收：build + test + tag

## 需要用到的 Node.js 方法

| 功能 | Python (参考) | Node.js |
|---|---|---|
| 粗略估算 token 数 | `len(str(messages)) // 4` | `JSON.stringify(messages).length / 4` |
| 创建目录 | `Path.mkdir(exist_ok=True)` | `fs.mkdirSync(dir, { recursive: true })` |
| 写 transcript 文件 | `f.write(json.dumps(msg))` | `fs.writeFileSync(filePath, content)` |
| 时间戳 | `int(time.time())` | `Math.floor(Date.now() / 1000)` |
| 截取末尾文本 | `text[-80000:]` | `text.slice(-80000)` |
| 拼接 transcript 路径 | `TRANSCRIPT_DIR / f"transcript_{ts}.jsonl"` | `path.join(transcriptDir, \`transcript_\${ts}.jsonl\`)` |

参考源码关键片段（Python → TS 对照）：

```python
# Python: micro_compact — 收集 tool_result 条目
tool_results = []
for msg_idx, msg in enumerate(messages):
    if msg["role"] == "user" and isinstance(msg.get("content"), list):
        for part_idx, part in enumerate(msg["content"]):
            if isinstance(part, dict) and part.get("type") == "tool_result":
                tool_results.append((msg_idx, part_idx, part))
if len(tool_results) <= KEEP_RECENT:
    return messages
```

对应 TypeScript 伪代码：

```typescript
const toolResults: Array<{ msgIdx: number; partIdx: number; part: ToolResultPart }> = [];
for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
  const msg = messages[msgIdx];
  if (msg.role === "user" && Array.isArray(msg.content)) {
    for (let partIdx = 0; partIdx < msg.content.length; partIdx++) {
      const part = msg.content[partIdx];
      if (part.type === "tool_result") {
        toolResults.push({ msgIdx, partIdx, part });
      }
    }
  }
}
if (toolResults.length <= KEEP_RECENT) return;
```

```python
# Python: auto_compact — 保存 transcript + 请求摘要
TRANSCRIPT_DIR.mkdir(exist_ok=True)
transcript_path = TRANSCRIPT_DIR / f"transcript_{int(time.time())}.jsonl"
with open(transcript_path, "w") as f:
    for msg in messages:
        f.write(json.dumps(msg, default=str) + "\n")
conversation_text = json.dumps(messages, default=str)[-80000:]
response = client.messages.create(
    model=MODEL,
    messages=[{"role": "user", "content":
        "Summarize this conversation for continuity..."}],
    max_tokens=2000,
)
summary = next((block.text for block in response.content if hasattr(block, "text")), "")
return [{"role": "user", "content": f"[Conversation compressed. Transcript: {transcript_path}]\n\n{summary}"}]
```

对应 TypeScript 伪代码：

```typescript
fs.mkdirSync(transcriptDir, { recursive: true });
const ts = Math.floor(Date.now() / 1000);
const transcriptPath = path.join(transcriptDir, `transcript_${ts}.jsonl`);
const lines = messages.map(m => JSON.stringify(m)).join("\n") + "\n";
fs.writeFileSync(transcriptPath, lines);

const conversationText = JSON.stringify(messages).slice(-80000);
const summaryResponse = await modelClient.createTurn({
  systemPrompt: "You are a helpful assistant that summarizes conversations.",
  messages: [{ role: "user", content: "Summarize..." + conversationText }],
  tools: []
});
// 提取摘要文本，返回单条 user 消息
```

## 设计决策

- **token 估算**：使用 `JSON.stringify(messages).length / 4`，不引入 tokenizer
- **transcript 格式**：JSONL（每行一条消息的 JSON），方便后续查看和调试
- **摘要模型**：使用与主 agent 相同的 modelClient，通过 `createTurn()` 调用，传空 tools 数组
- **micro_compact 保留策略**：保留最近 3 条 tool_result，保留所有 read_file 结果（参考材料）
- **compact tool 的 focus 参数**：Schema 中声明但 handler 不使用，仅让模型觉得它在提供上下文
