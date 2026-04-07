/**
 * BackgroundManager tests (s08 stage).
 * Translated from learn-claude-code/tests/test_s_full_background.py
 *
 * All tests skipped until BackgroundManager is implemented (s08).
 */
import { describe, expect, test } from "vitest";

describe.skip("BackgroundManager (s08)", () => {
  test("check returns running placeholder when result is null", async () => {
    // TODO:
    // manager.tasks.set("abc123", { status: "running", command: "sleep 1", result: null });
    // expect(manager.check("abc123")).toBe("[running] (running)");
  });

  test("returns result when background task completes", async () => {
    // TODO: start background task, wait, verify result returned
  });

  test("reports error for failed background task", async () => {
    // TODO: start task that fails, verify error message in check result
  });

  test("lists all background tasks", async () => {
    // TODO: start multiple tasks, verify list includes all
  });
});
