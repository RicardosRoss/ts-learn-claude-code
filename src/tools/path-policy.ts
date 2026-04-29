import fs from "node:fs";
import path from "node:path";

const MAX_SYMLINK_DEPTH = 40;

function assertWithinRoot(root: string, target: string): void {
  const rel = path.relative(root, target);
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(`Path escapes workspace: ${target}`);
  }
}

function resolveAbsolutePath(absolutePath: string, symlinkDepth: number): string {
  const normalized = path.resolve(absolutePath);
  const parsed = path.parse(normalized);
  const relative = path.relative(parsed.root, normalized);
  const segments = relative === "" ? [] : relative.split(path.sep).filter(Boolean);

  function walkSegments(currentBase: string, remainingSegments: string[], depth: number): string {
    if (remainingSegments.length === 0) {
      return path.resolve(currentBase);
    }

    const [head, ...tail] = remainingSegments;
    const currentPath = path.join(currentBase, head);

    let stats: fs.Stats;
    try {
      stats = fs.lstatSync(currentPath);
    } catch (error) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : undefined;
      if (code === "ENOENT" || code === "ENOTDIR") {
        return path.join(currentPath, ...tail);
      }
      throw error;
    }

    if (stats.isSymbolicLink()) {
      if (depth >= MAX_SYMLINK_DEPTH) {
        throw new Error(`Too many symlink levels: ${currentPath}`);
      }

      const symlinkPath = path.resolve(currentPath);
      const target = fs.readlinkSync(symlinkPath);
      const resolvedTarget = path.resolve(path.dirname(symlinkPath), target);
      return resolveAbsolutePath(path.join(resolvedTarget, ...tail), depth + 1);
    }

    if (!stats.isDirectory() && tail.length > 0) {
      return path.join(currentPath, ...tail);
    }

    return walkSegments(currentPath, tail, depth);
  }

  return walkSegments(parsed.root, segments, symlinkDepth);
}

/**
 * Resolve and validate a user-supplied path against a workspace root.
 *
 * The returned path keeps the caller's lexical workspace path so that write
 * operations can still create new files, but every existing symlink on the
 * way is resolved before we compare it against the canonical workspace root.
 */
export function safePath(inputPath: string, workspaceRoot: string): string {
  if (inputPath.includes("\0")) {
    throw new Error("Path escapes workspace: null byte detected");
  }

  const root = path.resolve(workspaceRoot);
  const candidate = path.resolve(root, inputPath);

  assertWithinRoot(root, candidate);

  const realRoot = fs.realpathSync(root);
  const resolvedCandidate = resolveAbsolutePath(candidate, 0);

  assertWithinRoot(realRoot, resolvedCandidate);
  return candidate;
}
