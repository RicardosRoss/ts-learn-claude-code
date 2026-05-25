import { describe, expect, test, vi } from "vitest";

import { requestPermissionFromUser } from "../src/cli/permission-prompt.js";

describe("requestPermissionFromUser", () => {
  test("returns false when readline is closed during confirmation", async () => {
    const rl = {
      question: vi.fn(async () => {
        throw new Error("readline was closed");
      })
    };
    const output = { write: vi.fn() };

    const approved = await requestPermissionFromUser(
      rl,
      output,
      { toolName: "write_file", reason: "requires confirmation: write_file", input: {} }
    );

    expect(approved).toBe(false);
  });
});
