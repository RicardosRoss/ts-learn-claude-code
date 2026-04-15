import { describe, expect, test } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";

// REPL tests require ANTHROPIC_API_KEY — skip in CI where env vars are unavailable.
const skipIfNoApiKey = process.env.ANTHROPIC_API_KEY ? describe : describe.skip;

function runReplWithInput(inputText: string): Promise<{ code: number | null; output: string }> {
  const root = path.resolve(import.meta.dirname, "..");
  const tsxBin = path.join(root, "node_modules", ".bin", "tsx");

  return new Promise((resolve, reject) => {
    const child = spawn(tsxBin, ["src/cli/repl.ts"], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, output });
    });

    child.stdin.write(inputText);
    child.stdin.end();
  });
}

skipIfNoApiKey("repl smoke", () => {
  test("exits cleanly when stdin is closed", async () => {
    const result = await runReplWithInput("!bash echo hi\nexit\n");
    expect(result.output).toContain("hi");
    expect(result.code).toBe(0);
  });

  // --- edge cases ---

  test("exits on 'exit' command", async () => {
    const result = await runReplWithInput("exit\n");
    expect(result.code).toBe(0);
  });

  test("exits on 'q' command", async () => {
    const result = await runReplWithInput("q\n");
    expect(result.code).toBe(0);
  });

  test("exits on 'Q' command (uppercase)", async () => {
    const result = await runReplWithInput("Q\n");
    expect(result.code).toBe(0);
  });

  test("exits on 'EXIT' command (uppercase)", async () => {
    const result = await runReplWithInput("EXIT\n");
    expect(result.code).toBe(0);
  });

  test("exits on blank line (empty input)", async () => {
    const result = await runReplWithInput("\n");
    expect(result.code).toBe(0);
  });

  test("exits when stdin is closed immediately with no input", async () => {
    const result = await runReplWithInput("");
    expect(result.code).toBe(0);
  });

  test("shows prompt indicator", async () => {
    const result = await runReplWithInput("exit\n");
    expect(result.output).toContain("s04");
  });
});
