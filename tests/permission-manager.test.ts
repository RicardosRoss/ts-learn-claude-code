import { describe, expect, test } from "vitest";

import { PermissionManager } from "../src/core/permission-manager.js";

describe("PermissionManager", () => {
  test("uses a registered tool policy before default allow rules", () => {
    const permissionManager = new PermissionManager({
      toolPolicies: new Map([
        [
          "read_file",
          () => ({
            behavior: "ask",
            reason: "custom read policy"
          })
        ]
      ])
    });

    expect(permissionManager.check("read_file", { path: "README.md" })).toEqual({
      behavior: "ask",
      reason: "custom read policy"
    });
  });

  test("keeps plan mode above a registered write tool policy", () => {
    const permissionManager = new PermissionManager({
      mode: "plan",
      toolPolicies: new Map([
        [
          "write_file",
          () => ({
            behavior: "allow",
            reason: "custom write policy"
          })
        ]
      ])
    });

    expect(permissionManager.check("write_file", { path: "x.txt", content: "x" })).toEqual({
      behavior: "deny",
      reason: "plan mode blocks write tool: write_file"
    });
  });
});
