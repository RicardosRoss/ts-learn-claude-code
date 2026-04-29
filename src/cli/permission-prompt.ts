/** Minimal output interface used by the s07 permission prompt. */
export interface PermissionPromptOutput {
  write(text: string): unknown;
}

/** Minimal readline interface used by the s07 permission prompt. */
export interface PermissionPromptReadline {
  question(prompt: string): Promise<string>;
}

/** s07: Request shape shown to the user before executing an ask tool call. */
export interface PermissionPromptRequest {
  toolName: string;
  reason: string;
  input: Record<string, unknown>;
}

/** Returns true if the error is caused by the readline interface being closed (EOF / pipe close). */
function isReadlineClosedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("readline was closed") || error.message.includes("ERR_USE_AFTER_CLOSE")
  );
}

/** s07: Asks the user whether an ask decision should execute the real tool handler. */
export async function requestPermissionFromUser(
  rl: PermissionPromptReadline,
  output: PermissionPromptOutput,
  request: PermissionPromptRequest
): Promise<boolean> {
  output.write(`Permission required: ${request.toolName} (${request.reason})\n`);
  output.write(`${JSON.stringify(request.input, null, 2)}\n`);

  let answer: string;
  try {
    answer = await rl.question("Allow this tool call? [y/N] ");
  } catch (error) {
    if (isReadlineClosedError(error)) {
      return false;
    }
    throw error;
  }

  const normalized = answer.trim().toLowerCase();
  return normalized === "y" || normalized === "yes";
}
