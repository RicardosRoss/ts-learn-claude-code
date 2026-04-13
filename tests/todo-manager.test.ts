import { describe, expect, test } from "vitest";

import { TodoManager } from "../src/core/todo-manager.js";

// ---------------------------------------------------------------------------
// TodoManager — s03 会话内计划状态管理器
//
// 测试覆盖：
//   1. 空状态渲染
//   2. 合法计划写入与渲染
//   3. 校验：空 content / 非法 status / 超过最大条目 / 多个 in_progress
//   4. activeForm 显示
//   5. roundsSinceUpdate 计数与重置
//   6. reminder 生成条件
//   7. 连续 update 覆盖旧计划
// ---------------------------------------------------------------------------

describe("TodoManager", () => {
  test("render() returns placeholder when no plan exists", () => {
    const mgr = new TodoManager();
    expect(mgr.render()).toBe("No session plan yet.");
  });

  // --- update: valid plans ------------------------------------------------

  test("update() accepts valid items and returns rendered plan", () => {
    const mgr = new TodoManager();
    const result = mgr.update([
      { content: "Read failing test", status: "completed" },
      { content: "Inspect runner flow", status: "in_progress", activeForm: "Inspecting runner flow" },
      { content: "Patch reminder logic", status: "pending" }
    ]);

    expect(result).toContain("[x] Read failing test");
    expect(result).toContain("[>] Inspect runner flow (Inspecting runner flow)");
    expect(result).toContain("[ ] Patch reminder logic");
    expect(result).toContain("(1/3 completed)");
  });

  test("update() works with single item", () => {
    const mgr = new TodoManager();
    const result = mgr.update([
      { content: "Do something", status: "in_progress" }
    ]);
    expect(result).toContain("[>] Do something");
    expect(result).toContain("(0/1 completed)");
  });

  test("update() works with all items completed", () => {
    const mgr = new TodoManager();
    const result = mgr.update([
      { content: "Step A", status: "completed" },
      { content: "Step B", status: "completed" }
    ]);
    expect(result).toContain("(2/2 completed)");
  });

  test("update() preserves order of items", () => {
    const mgr = new TodoManager();
    const result = mgr.update([
      { content: "First", status: "pending" },
      { content: "Second", status: "pending" },
      { content: "Third", status: "pending" }
    ]);
    const firstIdx = result.indexOf("First");
    const secondIdx = result.indexOf("Second");
    const thirdIdx = result.indexOf("Third");
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });

  // --- update: validation errors ------------------------------------------

  test("update() rejects empty content", () => {
    const mgr = new TodoManager();
    expect(() =>
      mgr.update([{ content: "", status: "pending" }])
    ).toThrow(/content required/i);
  });

  test("update() rejects whitespace-only content", () => {
    const mgr = new TodoManager();
    expect(() =>
      mgr.update([{ content: "   ", status: "pending" }])
    ).toThrow(/content required/i);
  });

  test("update() rejects invalid status value", () => {
    const mgr = new TodoManager();
    expect(() =>
      mgr.update([{ content: "Task", status: "unknown" as "pending" }])
    ).toThrow(/invalid status/i);
  });

  test("update() rejects more than 12 items", () => {
    const mgr = new TodoManager();
    const items = Array.from({ length: 13 }, (_, i) => ({
      content: `Task ${i + 1}`,
      status: "pending" as const
    }));
    expect(() => mgr.update(items)).toThrow(/max 12 items/i);
  });

  test("update() accepts exactly 12 items", () => {
    const mgr = new TodoManager();
    const items = Array.from({ length: 12 }, (_, i) => ({
      content: `Task ${i + 1}`,
      status: "pending" as const
    }));
    expect(() => mgr.update(items)).not.toThrow();
  });

  test("update() rejects multiple in_progress items", () => {
    const mgr = new TodoManager();
    expect(() =>
      mgr.update([
        { content: "A", status: "in_progress" },
        { content: "B", status: "in_progress" }
      ])
    ).toThrow(/only one.*in_progress/i);
  });

  test("update() rejects items array that is empty", () => {
    const mgr = new TodoManager();
    expect(() => mgr.update([])).toThrow();
  });

  // --- activeForm ---------------------------------------------------------

  test("update() renders activeForm when present on in_progress item", () => {
    const mgr = new TodoManager();
    const result = mgr.update([
      { content: "Working", status: "in_progress", activeForm: "Working on it" }
    ]);
    expect(result).toContain("Working on it");
  });

  test("update() omits activeForm parenthetical when not provided", () => {
    const mgr = new TodoManager();
    const result = mgr.update([
      { content: "Working", status: "in_progress" }
    ]);
    expect(result).toContain("[>] Working");
    // Should not have trailing parens after "Working"
    const line = result.split("\n").find((l) => l.includes("[>]"))!;
    expect(line.trim()).toBe("[>] Working");
  });

  test("activeForm is not rendered for non-in_progress items", () => {
    const mgr = new TodoManager();
    const result = mgr.update([
      { content: "Done", status: "completed", activeForm: "Should be ignored" },
      { content: "Later", status: "pending", activeForm: "Also ignored" }
    ]);
    expect(result).not.toContain("Should be ignored");
    expect(result).not.toContain("Also ignored");
  });

  // --- roundsSinceUpdate --------------------------------------------------

  test("roundsSinceUpdate starts at 0 after update()", () => {
    const mgr = new TodoManager();
    mgr.update([{ content: "Plan", status: "pending" }]);
    expect(mgr.roundsSinceUpdate).toBe(0);
  });

  test("noteRoundWithoutUpdate() increments counter", () => {
    const mgr = new TodoManager();
    mgr.update([{ content: "Plan", status: "pending" }]);
    mgr.noteRoundWithoutUpdate();
    expect(mgr.roundsSinceUpdate).toBe(1);
    mgr.noteRoundWithoutUpdate();
    expect(mgr.roundsSinceUpdate).toBe(2);
  });

  test("update() resets roundsSinceUpdate to 0", () => {
    const mgr = new TodoManager();
    mgr.update([{ content: "Plan", status: "pending" }]);
    mgr.noteRoundWithoutUpdate();
    mgr.noteRoundWithoutUpdate();
    expect(mgr.roundsSinceUpdate).toBe(2);

    mgr.update([{ content: "Plan", status: "in_progress" }]);
    expect(mgr.roundsSinceUpdate).toBe(0);
  });

  test("noteRoundWithoutUpdate() does nothing when no plan exists", () => {
    const mgr = new TodoManager();
    mgr.noteRoundWithoutUpdate();
    expect(mgr.roundsSinceUpdate).toBe(0);
  });

  // --- reminder -----------------------------------------------------------

  test("reminder() returns null when no plan exists", () => {
    const mgr = new TodoManager();
    expect(mgr.reminder()).toBeNull();
  });

  test("reminder() returns null when roundsSinceUpdate < threshold", () => {
    const mgr = new TodoManager();
    mgr.update([{ content: "Plan", status: "pending" }]);
    mgr.noteRoundWithoutUpdate();
    mgr.noteRoundWithoutUpdate();
    // Default threshold is 3, so 2 rounds should not trigger
    expect(mgr.reminder()).toBeNull();
  });

  test("reminder() returns reminder text when roundsSinceUpdate >= 3", () => {
    const mgr = new TodoManager();
    mgr.update([{ content: "Plan", status: "pending" }]);
    mgr.noteRoundWithoutUpdate();
    mgr.noteRoundWithoutUpdate();
    mgr.noteRoundWithoutUpdate();
    expect(mgr.reminder()).toContain("<reminder>");
    expect(mgr.reminder()).toContain("</reminder>");
  });

  test("reminder() returns null again after update resets counter", () => {
    const mgr = new TodoManager();
    mgr.update([{ content: "Plan", status: "pending" }]);
    mgr.noteRoundWithoutUpdate();
    mgr.noteRoundWithoutUpdate();
    mgr.noteRoundWithoutUpdate();
    expect(mgr.reminder()).not.toBeNull();

    mgr.update([{ content: "Plan", status: "in_progress" }]);
    expect(mgr.reminder()).toBeNull();
  });

  // --- consecutive update overwrites --------------------------------------

  test("second update() completely replaces the previous plan", () => {
    const mgr = new TodoManager();
    mgr.update([{ content: "Old plan", status: "pending" }]);
    const result = mgr.update([{ content: "New plan", status: "in_progress" }]);

    expect(result).not.toContain("Old plan");
    expect(result).toContain("New plan");
    expect(mgr.roundsSinceUpdate).toBe(0);
  });

  // --- render consistency -------------------------------------------------

  test("render() returns same output as update() return value", () => {
    const mgr = new TodoManager();
    const updateResult = mgr.update([
      { content: "Step A", status: "completed" },
      { content: "Step B", status: "pending" }
    ]);
    expect(mgr.render()).toBe(updateResult);
  });
});
