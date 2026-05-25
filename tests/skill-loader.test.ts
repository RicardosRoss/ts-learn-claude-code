import { afterEach, beforeEach, describe, expect, test } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parseFrontmatter, SkillLoader } from "../src/core/skill-loader.js";

describe("parseFrontmatter", () => {
  test("parses simple key-value frontmatter and returns the remaining body", () => {
    const raw = [
      "---",
      "name: pdf",
      "description: Process PDF files.",
      "---",
      "# PDF Skill",
      "",
      "Body text."
    ].join("\n");

    expect(parseFrontmatter(raw, "fallback-name")).toEqual({
      meta: {
        name: "pdf",
        description: "Process PDF files."
      },
      body: "# PDF Skill\n\nBody text."
    });
  });

  test("falls back to the directory name when frontmatter omits name", () => {
    const raw = [
      "---",
      "description: Review code carefully.",
      "---",
      "# Code Review Skill"
    ].join("\n");

    expect(parseFrontmatter(raw, "code-review")).toEqual({
      meta: {
        name: "code-review",
        description: "Review code carefully."
      },
      body: "# Code Review Skill"
    });
  });

  test("supports literal block values for multi-line descriptions", () => {
    const raw = [
      "---",
      "description: |",
      "  Line one.",
      "  Line two.",
      "---",
      "# PDF Skill"
    ].join("\n");

    expect(parseFrontmatter(raw, "pdf")).toEqual({
      meta: {
        name: "pdf",
        description: "Line one.\nLine two."
      },
      body: "# PDF Skill"
    });
  });

  test("returns fallback metadata and the raw text when parsing fails", () => {
    const raw = [
      "---",
      "name pdf",
      "description: broken frontmatter",
      "---",
      "# Broken Skill"
    ].join("\n");

    expect(parseFrontmatter(raw, "broken-skill")).toEqual({
      meta: {
        name: "broken-skill",
        description: ""
      },
      body: raw
    });
  });
});

describe("SkillLoader", () => {
  let skillsDir: string;

  beforeEach(async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "s05-skills-"));
    skillsDir = path.join(workspace, "skills");
    await fs.mkdir(skillsDir);
  });

  afterEach(async () => {
    await fs.rm(path.dirname(skillsDir), { recursive: true, force: true });
  });

  test("returns '(no skills available)' when the skills directory is empty", () => {
    const loader = new SkillLoader(skillsDir);
    expect(loader.getDescriptions()).toBe("(no skills available)");
  });

  test("loads only directories with SKILL.md and formats descriptions from parsed metadata", async () => {
    await writeSkill(skillsDir, "z-dir", [
      "---",
      "name: zed",
      "description: Last skill loaded by metadata.",
      "---",
      "# Zed"
    ].join("\n"));

    await fs.mkdir(path.join(skillsDir, "empty-dir"));

    await writeSkill(skillsDir, "a-dir", [
      "---",
      "name: alpha",
      "description: First skill loaded by metadata.",
      "---",
      "# Alpha"
    ].join("\n"));

    const loader = new SkillLoader(skillsDir);

    expect(loader.getDescriptions()).toBe([
      "  - alpha: First skill loaded by metadata.",
      "  - zed: Last skill loaded by metadata."
    ].join("\n"));
  });

  test("returns formatted skill content using the parsed frontmatter name", async () => {
    await writeSkill(skillsDir, "review-skill", [
      "---",
      "name: code-review",
      "description: Review code carefully.",
      "---",
      "# Code Review",
      "",
      "Checklist"
    ].join("\n"));

    const loader = new SkillLoader(skillsDir);

    expect(loader.getContent("code-review")).toBe([
      '<skill name="code-review">',
      "",
      "# Code Review",
      "",
      "Checklist",
      "",
      "</skill>"
    ].join("\n"));
  });

  test("returns a helpful unknown-skill error including available names", async () => {
    await writeSkill(skillsDir, "pdf", [
      "---",
      "description: Process PDF files.",
      "---",
      "# PDF"
    ].join("\n"));
    await writeSkill(skillsDir, "code-review", [
      "---",
      "description: Review code carefully.",
      "---",
      "# Code Review"
    ].join("\n"));

    const loader = new SkillLoader(skillsDir);

    expect(loader.getContent("missing")).toBe(
      "Error: Unknown skill 'missing'. Available: code-review, pdf"
    );
  });
});

async function writeSkill(skillsDir: string, dirName: string, content: string): Promise<void> {
  const skillDir = path.join(skillsDir, dirName);
  await fs.mkdir(skillDir);
  await fs.writeFile(path.join(skillDir, "SKILL.md"), content, "utf-8");
}
