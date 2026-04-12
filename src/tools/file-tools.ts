import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { safePath } from "./path-policy.js";

export async function runRead(
  inputPath: string,
  options: { workspaceRoot: string; limit?: number }
): Promise<string> {
  try {
    const resolved = safePath(inputPath, options.workspaceRoot);
    const text = await readFile(resolved, "utf-8");
    if (options.limit !== undefined && options.limit < text.split("\n").length) {
      const lines = text.split("\n").slice(0, options.limit);
      const remaining = text.split("\n").length - options.limit;
      lines.push(`... (${remaining} more lines)`);
      return lines.join("\n");
    }
    return text;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return `Error: ${message}`;
  }
}

export async function runWrite(
  inputPath: string,
  content: string,
  options: { workspaceRoot: string }
): Promise<string> {
  try {
    const resolved = safePath(inputPath, options.workspaceRoot);
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, content, "utf-8");
    return `Wrote ${Buffer.byteLength(content, "utf-8")} bytes to ${inputPath}`;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return `Error: ${message}`;
  }
}

export async function runEdit(
  inputPath: string,
  oldText: string,
  newText: string,
  options: { workspaceRoot: string }
): Promise<string> {
  try {
    const resolved = safePath(inputPath, options.workspaceRoot);
    const originContent = await readFile(resolved, "utf-8");
    const newContent = originContent.replace(oldText, newText);
    if (newContent === originContent) {
      return `Error: Text not found in ${inputPath}`;
    }
    await writeFile(resolved, newContent, "utf-8");
    return `Edited ${inputPath}`;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return `Error: ${message}`;
  }
}
