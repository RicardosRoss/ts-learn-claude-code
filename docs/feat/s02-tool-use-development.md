# s02 阶段开发文档：Tool Use + 文件工具

## 1. 阶段目标

在不改坏 `s01` Agent 主循环的前提下，把当前项目推进到 `s02`：

- 继续复用已有的 `ToolRegistry` 和 `AgentRunner`
- 增加文件相关工具：`read_file`、`write_file`、`edit_file`
- 增加路径安全策略：所有文件工具都必须先经过 `safePath`
- 让模型可以在一个回合中发起多个工具调用，并正确收到 `tool_result`

这个阶段的难点不在“功能很多”，而在“边界很多”：

- `..` 路径逃逸
- 绝对路径逃逸
- 软链接跳出工作区
- 不存在路径和将来要创建的新文件
- Node.js API 的真实返回值和你脑中的想象不一致

所以本阶段文档必须和接口文档成对出现。

## 2. 本阶段文档清单

- 开发文档：[s02-tool-use-development.md](./s02-tool-use-development.md)
- 接口文档：[s02-tool-use-api-reference.md](./s02-tool-use-api-reference.md)

以后每个阶段都按同一模式产出两份文档：

1. 一份讲“做什么、为什么、怎么拆”
2. 一份讲“用到哪些 API、参数是什么、返回什么、长什么样”

## 3. 当前代码基线

当前仓库里，`s02` 的基础已经具备一半：

- `src/core/tool-registry.ts`
  - 已经是通用工具注册表，不需要为 `s02` 重写
- `src/core/agent-runner.ts`
  - 已经能遍历模型返回内容
  - 已经能执行多个 `tool_use`
  - 已经能把工具异常包装成 `tool_result`
- `src/tools/builtin-tools.ts`
  - 现在只注册了 `bash`
  - `s02` 要在这里把文件工具挂进去
- `src/tools/path-policy.ts`
  - 当前已实现 `safePath`
  - 这个模块负责把“用户给的路径”变成“允许在工作区内使用的路径”
- `tests/file-tools.test.ts`
  - 已经覆盖了 `safePath` / `runRead` / `runWrite` / `runEdit`
  - 当前 `safePath` 相关用例可作为路径策略验收基线

## 4. 当前阶段拆解

### 第一步：先把路径安全独立做好

入口函数是：

```ts
safePath(inputPath: string, workspaceRoot: string): string
```

它的职责不是“读文件”，而是更基础的两件事：

1. 做词法归一化
2. 做真实路径边界校验

这里必须同时检查两层：

- 词法层：`path.resolve(root, inputPath)` 之后不能直接跑出 `workspaceRoot`
- 真实文件系统层：已有软链接解析后也不能跳出工作区

这一步的意义是：后面的 `runRead` / `runWrite` / `runEdit` 都不再自己处理路径安全，只依赖 `safePath`。

### 第二步：实现 `runRead`

建议签名：

```ts
runRead(
  inputPath: string,
  options: { workspaceRoot: string; limit?: number }
): Promise<string>
```

建议流程：

1. 先调用 `safePath`
2. 用 `fs.promises.readFile` 读取 UTF-8 文本
3. 如果配置了 `limit`，按“行”截断，不要按字节截断
4. 被截断时追加一行提示，例如“... N more lines”

`runRead` 的重点不是复杂逻辑，而是把“默认行为”和“限制行为”定义清楚。

### 第三步：实现 `runWrite`

建议签名：

```ts
runWrite(
  inputPath: string,
  content: string,
  options: { workspaceRoot: string }
): Promise<string>
```

建议流程：

1. `safePath`
2. 先确保父目录存在
3. 直接覆盖写入
4. 返回一条稳定、可断言的结果字符串

这里的关键不是“能写入”，而是：

- 不允许越权写出工作区
- 对不存在的上级目录要表现稳定
- 返回信息要便于测试和模型消费

### 第四步：实现 `runEdit`

建议签名：

```ts
runEdit(
  inputPath: string,
  oldText: string,
  newText: string,
  options: { workspaceRoot: string }
): Promise<string>
```

建议流程：

1. `safePath`
2. 读取原文件
3. 校验 `oldText` 是否存在
4. 执行替换
5. 覆盖写回

`runEdit` 不是“模糊修改工具”，它应该是“可预测的文本替换工具”。  
当前阶段先保持实现简洁：

- 匹配不到时返回明确错误
- 匹配到时按字符串替换的默认语义处理
- 更严格的“多次匹配校验”和更复杂的安全加固，放到后续统一学习阶段处理

### 第五步：把文件工具注册到 `builtin-tools`

`registerBuiltinTools` 要从“只注册 bash”扩展到“注册 bash + 文件工具”。

这里的工作包括两部分：

1. 注册元信息：名字、描述、输入结构
2. 解析输入：把 `Record<string, unknown>` 收窄成工具函数真正需要的参数

也就是说，`builtin-tools.ts` 是“模型输入”和“内部实现”之间的边界层。

### 第六步：统一验证

这个阶段最少要做三类验证：

1. `safePath` 相关测试
2. `tests/file-tools.test.ts`
3. `npm run build`

如果只看局部测试绿了，但编译还没过，就不能说阶段完成。

## 5. 当前推荐顺序

按现在仓库状态，推荐的推进顺序是：

1. 锁定 `safePath` 行为，不再让文件工具重复处理路径安全
2. 实现 `src/tools/file-tools.ts`
3. 接入 `builtin-tools.ts`
4. 跑完整测试与编译
5. 再回头整理文档中的“最终状态”

这个顺序的理由很简单：

- `safePath` 是所有文件工具的前置条件
- `builtin-tools` 只是装配层，不应先写
- 编译和测试必须在工具接好以后再做完整结论

## 6. 当前进度判断

截至当前：

- 已完成：`safePath` 的主要实现和回归测试补强
- 已完成：`src/tools/file-tools.ts`
- 已完成：`builtin-tools.ts` 中的文件工具注册
- 已完成：`s02` 整体构建闭环

所以当前状态应被视为：

`s02` 主体能力已经完成，可进入阶段收尾与进入下一阶段前的确认。

## 7. 验收标准

满足下面条件，才算 `s02` 完成：

1. `safePath` 能拦截 `..`、绝对路径、软链接逃逸
2. `runRead` / `runWrite` / `runEdit` 对应测试全部通过
3. `registerBuiltinTools` 已经对外暴露文件工具
4. `npm run build` 通过
5. 阶段开发文档和接口文档同步更新

## 8. 文档维护规则

从这个阶段开始，阶段文档固定包含两部分产物：

1. `docs/feat/s0N-xxx-development.md`
2. `docs/feat/s0N-xxx-api-reference.md`

其中接口文档至少覆盖：

- 本阶段直接调用的 Node.js / 第三方 API
- 每个 API 的参数
- 返回值类型
- 返回值的实际示例
- 容易误判的边界行为

这样做的目的不是“把文档写漂亮”，而是把“不会用 API”从实现障碍变成可查询问题。
