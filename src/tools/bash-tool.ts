import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execCallback);

/** Shell command patterns that are blocked by default for safety. */
const DEFAULT_DANGEROUS_PATTERNS = ["rm -rf /", "sudo", "shutdown", "reboot", "> /dev/"];

/** Options for controlling bash command execution. */
export interface RunBashOptions {
  /** Working directory for the command. */
  cwd: string;
  /** Maximum execution time in milliseconds (default: 120000). */
  timeoutMs?: number;
  /** Maximum output length in characters (default: 50000). */
  maxOutputChars?: number;
  /** Override the default dangerous command patterns. Pass an empty array to disable blocking. */
  dangerousPatterns?: string[];
}

/**
 * Executes a bash command with safety guardrails:
 * - Blocks commands matching dangerous patterns.
 * - Enforces a timeout to prevent hanging.
 * - Truncates output beyond maxOutputChars.
 * - Returns combined stdout+stderr as a string.
 */
export async function runBash(command: string, options: RunBashOptions): Promise<string> {
  const patterns = options.dangerousPatterns ?? DEFAULT_DANGEROUS_PATTERNS;
  if (patterns.some((pattern) => command.includes(pattern))) {
    return "Error: Dangerous command blocked";
  }

  const timeoutMs = options.timeoutMs ?? 120_000;
  const maxOutputChars = options.maxOutputChars ?? 50_000;

  try {
    const { stdout, stderr } = await exec(command, {
      cwd: options.cwd,
      timeout: timeoutMs,
      maxBuffer: 5 * 1024 * 1024
    });

    const output = `${stdout ?? ""}${stderr ?? ""}`.trim();
    return output.length > 0 ? output.slice(0, maxOutputChars) : "(no output)";
  } catch (error) {
    const err = error as Partial<Error> & {
      stdout?: string;
      stderr?: string;
      killed?: boolean;
      signal?: string;
      code?: number | string;
    };

    if (err.killed || err.signal === "SIGTERM") {
      return `Error: Timeout (${Math.ceil(timeoutMs / 1000)}s)`;
    }

    const output = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
    if (output) {
      return output.slice(0, maxOutputChars);
    }
    return `Error: ${err.message ?? "bash command failed"}`;
  }
}
