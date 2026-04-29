/** s07: Tool permission behavior returned before a handler is executed. */
export type PermissionBehavior = "allow" | "deny" | "ask";

/** s07: Coarse permission mode for the current agent session. */
export type PermissionMode = "default" | "plan" | "auto";

/** s07: A small rule shape for matching tool calls. */
export interface PermissionRule {
  tool: string;
  behavior: PermissionBehavior;
  path?: string;
  content?: string;
}

/** s07: Permission decision consumed by AgentRunner. */
export interface PermissionDecision {
  behavior: PermissionBehavior;
  reason: string;
}

/** s07: 权限检查流水线共享的上下文。 */
export interface PermissionCheckContext {
  toolName: string;
  input: Record<string, unknown>;
  mode: PermissionMode;
  allowRules: PermissionRule[];
  denyRules: PermissionRule[];
  readOnlyTools: Set<string>;
  writeTools: Set<string>;
  toolPolicies: Map<string, PermissionToolPolicy>;
}

/** s07: 权限管理器中的一个有序检查步骤。 */
export type PermissionCheck = (context: PermissionCheckContext) => PermissionDecision | null;

/** s07: 单个工具的策略函数；返回 null 表示继续后续检查。 */
export type PermissionToolPolicy = (context: PermissionCheckContext) => PermissionDecision | null;

/** s07: Constructor options for the minimal implementation. */
export interface PermissionManagerOptions {
  mode?: PermissionMode;
  allowRules?: PermissionRule[];
  denyRules?: PermissionRule[];
  readOnlyTools?: Set<string>;
  writeTools?: Set<string>;
  toolPolicies?: Map<string, PermissionToolPolicy>;
}

const DEFAULT_READ_ONLY_TOOLS = new Set(["read_file", "todo", "load_skill", "compact"]);
const DEFAULT_WRITE_TOOLS = new Set(["write_file", "edit_file", "bash"]);
const DEFAULT_DENY_RULES: PermissionRule[] = [
  { tool: "bash", behavior: "deny", content: "sudo " },
  { tool: "write_file", behavior: "deny", path: ".git/" },
  { tool: "edit_file", behavior: "deny", path: ".git/" }
];
const DEFAULT_CHECKS: PermissionCheck[] = [
  checkDenyRules,
  checkModePolicy,
  checkToolPolicy,
  checkAllowRules,
  checkDefaultAsk
];

/** s07: 判断一条规则是否命中当前工具调用。 */
export function matchesRule(
  rule: PermissionRule,
  toolName: string,
  input: Record<string, unknown>
): boolean {
  if (rule.tool !== toolName) return false;
  if (rule.path) {
    const inputPath = input.file_path ?? input.path;
    if (typeof inputPath !== "string" || !inputPath.includes(rule.path)) {
      return false;
    }
  }
  if (rule.content) {
    if (rule.tool === "bash" && rule.content === "sudo ") {
      const command = input.command;
      return typeof command === "string" && command.trimStart().startsWith(rule.content);
    }

    const target = input.command ?? input.content;
    if (typeof target !== "string" || !target.includes(rule.content)) {
      return false;
    }
  }

  return true;
}

/**
 * s07 权限管理器。
 * 只负责把 tool_use 判定为 allow / deny / ask，不执行工具，也不询问用户。
 */
export class PermissionManager {
  private readonly mode: PermissionMode;
  private readonly allowRules: PermissionRule[];
  private readonly denyRules: PermissionRule[];
  private readonly readOnlyTools: Set<string>;
  private readonly writeTools: Set<string>;
  private readonly toolPolicies: Map<string, PermissionToolPolicy>;
  private readonly checks: PermissionCheck[];

  constructor(options: PermissionManagerOptions = {}) {
    this.mode = options.mode ?? "default";
    this.allowRules = options.allowRules ?? [];
    this.denyRules = options.denyRules ?? DEFAULT_DENY_RULES;
    this.readOnlyTools = options.readOnlyTools ?? DEFAULT_READ_ONLY_TOOLS;
    this.writeTools = options.writeTools ?? DEFAULT_WRITE_TOOLS;
    this.toolPolicies = createDefaultToolPolicies(this.readOnlyTools);
    for (const [toolName, policy] of options.toolPolicies ?? []) {
      this.toolPolicies.set(toolName, policy);
    }
    this.checks = DEFAULT_CHECKS;
  }

  /** 判定一次 tool_use 是否 allow / deny / ask。 */
  check(toolName: string, input: Record<string, unknown>): PermissionDecision {
    const context: PermissionCheckContext = {
      toolName,
      input,
      mode: this.mode,
      allowRules: this.allowRules,
      denyRules: this.denyRules,
      readOnlyTools: this.readOnlyTools,
      writeTools: this.writeTools,
      toolPolicies: this.toolPolicies
    };

    for (const check of this.checks) {
      const decision = check(context);
      if (decision !== null) {
        return decision;
      }
    }

    return { behavior: "ask", reason: `requires confirmation: ${toolName}` };
  }
}

/** s07: 显式 deny 规则优先于 mode 和工具策略。 */
function checkDenyRules(context: PermissionCheckContext): PermissionDecision | null {
  const matchedDenyRule = context.denyRules.find((rule) =>
    matchesRule(rule, context.toolName, context.input)
  );
  if (matchedDenyRule) {
    return { behavior: "deny", reason: `matched deny rule (${describeRule(matchedDenyRule)})` };
  }

  return null;
}

/** s07: session mode 规则覆盖普通工具策略。 */
function checkModePolicy(context: PermissionCheckContext): PermissionDecision | null {
  if (context.mode === "plan" && context.writeTools.has(context.toolName)) {
    return { behavior: "deny", reason: `plan mode blocks write tool: ${context.toolName}` };
  }

  return null;
}

/** s07: 把工具差异委托给策略表。 */
function checkToolPolicy(context: PermissionCheckContext): PermissionDecision | null {
  const policy = context.toolPolicies.get(context.toolName);
  return policy ? policy(context) : null;
}

/** s07: 显式 allow 规则排在 deny、mode、工具策略之后。 */
function checkAllowRules(context: PermissionCheckContext): PermissionDecision | null {
  const matchedAllowRule = context.allowRules.find((rule) =>
    matchesRule(rule, context.toolName, context.input)
  );
  if (matchedAllowRule) {
    return { behavior: "allow", reason: `matched allow rule (${describeRule(matchedAllowRule)})` };
  }

  return null;
}

/** s07: 未知工具和普通灰区工具默认进入 ask。 */
function checkDefaultAsk(context: PermissionCheckContext): PermissionDecision {
  if (!context.readOnlyTools.has(context.toolName) && !context.writeTools.has(context.toolName)) {
    return { behavior: "ask", reason: `requires confirmation: unknown tool ${context.toolName}` };
  }

  return { behavior: "ask", reason: `requires confirmation: ${context.toolName}` };
}

/** 创建默认策略表：当前阶段只有只读工具无条件放行。 */
function createDefaultToolPolicies(
  readOnlyTools: Set<string>
): Map<string, PermissionToolPolicy> {
  const toolPolicies = new Map<string, PermissionToolPolicy>();
  for (const toolName of readOnlyTools) {
    toolPolicies.set(toolName, allowReadOnlyTool);
  }
  return toolPolicies;
}

/** 只读工具不需要询问用户。 */
function allowReadOnlyTool(context: PermissionCheckContext): PermissionDecision {
  return { behavior: "allow", reason: `matched allow rule (tool: ${context.toolName})` };
}

/** 把命中的规则格式化成稳定的单行 reason 片段。 */
function describeRule(rule: PermissionRule): string {
  if (rule.content) {
    const marker = rule.content.endsWith(" ") ? `${rule.content}*` : rule.content;
    return `${rule.tool} content: ${marker}`;
  }

  if (rule.path) {
    return `${rule.tool} path: ${rule.path}`;
  }

  return `tool: ${rule.tool}`;
}
