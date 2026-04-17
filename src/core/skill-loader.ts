import fs from "node:fs";
import path from "node:path";

/** Parsed frontmatter metadata from a SKILL.md file. */
interface SkillMeta {
  name: string;
  description: string;
}

/** A fully parsed skill: metadata + body content. */
interface ParsedSkill {
  meta: SkillMeta;
  body: string;
}

/**
 * Parses YAML frontmatter from a SKILL.md file.
 * Supports simple "key: value" pairs. Returns empty meta + raw text on failure.
 * Defaults name to the parent directory name when not specified.
 */
export function parseFrontmatter(raw: string, fallbackName: string): ParsedSkill {
  const fallback = {
    meta: { name: fallbackName, description: "" },
    body: raw
  };
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

  if (!match) {
    return fallback;
  }

  const meta: SkillMeta = { name: fallbackName, description: "" };
  const lines = match[1].split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim().length === 0) {
      continue;
    }

    const separator = line.indexOf(":");
    if (separator === -1) {
      return fallback;
    }

    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trimStart();
    if (key.length === 0) {
      return fallback;
    }

    let value = rawValue.trim();
    if (rawValue === "|") {
      const blockLines: string[] = [];

      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        if (nextLine.startsWith("  ")) {
          blockLines.push(nextLine.slice(2));
          i += 1;
          continue;
        }
        if (nextLine.length === 0) {
          blockLines.push("");
          i += 1;
          continue;
        }
        break;
      }

      value = blockLines.join("\n");
    }

    if (key === "name" && value.length > 0) {
      meta.name = value;
    }

    if (key === "description") {
      meta.description = value;
    }
  }

  return { meta, body: match[2] };
}
/**
 * Scans a directory of SKILL.md files and provides two-layer access:
 *   Layer 1: short descriptions for system prompt injection (cheap).
 *   Layer 2: full skill body loaded on demand via load_skill tool (expensive).
 */
export class SkillLoader {
  private skills: Map<string, ParsedSkill> = new Map();

  constructor(skillsDir: string) {
    if (!fs.existsSync(skillsDir)) {
      return;
    }

    const dirs = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;

      const skillFile = path.join(skillsDir, dir.name, "SKILL.md");
      if (!fs.existsSync(skillFile)) continue;

      const raw = fs.readFileSync(skillFile, "utf-8");
      const skill = parseFrontmatter(raw, dir.name);
      this.skills.set(skill.meta.name, skill);
    }
  }

  /**
   * Returns Layer 1 text for system prompt injection.
   * Format: one line per skill: "  - {name}: {description}"
   * Returns "(no skills available)" when no skills are loaded.
   */
  getDescriptions(): string {
    if (this.skills.size === 0) {
      return "(no skills available)";
    }

    return [...this.skills.values()]
      .map((skill) => `  - ${skill.meta.name}: ${skill.meta.description}`)
      .join("\n");
  }

  /**
   * Returns Layer 2 full skill body wrapped in <skill> tags.
   * Format: "<skill name=\"{name}\">\n\n{body}\n\n</skill>"
   * Returns error string for unknown skill names.
   */
  getContent(name: string): string {
    const skill = this.skills.get(name);
    if (!skill) {
      return `Error: Unknown skill '${name}'. Available: ${this.availableNames()}`;
    }

    return `<skill name="${name}">\n\n${skill.body}\n\n</skill>`;
  }

  /** Returns comma-separated list of loaded skill names, used in error messages. */
  private availableNames(): string {
    const names = [...this.skills.keys()];
    return names.length > 0 ? names.join(", ") : "(none)";
  }
}
