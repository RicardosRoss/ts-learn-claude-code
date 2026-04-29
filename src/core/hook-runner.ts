/** s08: Supported hook event names in the minimal hook pipeline. */
export type HookEventName = "SessionStart" | "PreToolUse" | "PostToolUse";

export type ExitStatus = 0 | 1 | 2;

/** s08: Payload shape for each hook event. */
export interface HookPayloadMap {
  SessionStart: {
    cwd: string;
  };
  PreToolUse: {
    toolName: string;
    toolUseId: string;
    input: Record<string, unknown>;
  };
  PostToolUse: {
    toolName: string;
    toolUseId: string;
    input: Record<string, unknown>;
    output: string;
    isError: boolean;
  };
}

/** Event object passed to each hook handler. */
export interface HookEvent<N extends HookEventName = HookEventName> {
  name: N;
  payload: HookPayloadMap[N];
}

/** Unified hook result: continue, warn, or inject a note. */
export interface HookResult {
  exitCode: ExitStatus;
  message: string;
}

/** Function signature for one hook handler. */
export type HookHandler<N extends HookEventName = HookEventName> = (
  event: HookEvent<N>
) => HookResult | Promise<HookResult>;

/** Constructor options for the in-memory hook runner. */
export interface HookRunnerOptions {
  handlers?: Partial<{
    [N in HookEventName]: Array<HookHandler<N>>;
  }>;
}

/** Minimal in-memory hook dispatcher. */
export class HookRunner {
  private readonly handlers: HookRunnerOptions["handlers"];

  constructor(options: HookRunnerOptions = {}) {
    this.handlers = options.handlers ?? {};
  }

  async run<N extends HookEventName>(
    eventName: N,
    payload: HookPayloadMap[N]
  ): Promise<HookResult> {
    const currentHandlers = this.handlers?.[eventName] ?? [];
    const event: HookEvent<N> = { name: eventName, payload };
    for (const handler of currentHandlers) {
      let res: HookResult;
      try {
        res = await handler(event);
      } catch (error) {
        return {
          exitCode: 1,
          message: `Hook handler failed: ${error instanceof Error ? error.message : String(error)}`
        };
      }

      if (res.exitCode !== 0) {
        return res;
      }
    }
    return { exitCode: 0, message: "" };
  }
}
