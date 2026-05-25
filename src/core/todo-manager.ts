/** Session plan status for a single plan item. */
export type TodoStatus = "pending" | "in_progress" | "completed";

/** A single step in the session plan. */
export interface PlanItem {
  content: string;
  status: TodoStatus;
  activeForm: string;
}

/** Input shape for a single plan item from the model. */
export interface TodoItemInput {
  content: string;
  status: TodoStatus;
  activeForm?: string;
}

/** Internal planning state: the plan itself plus staleness tracking. */
export interface PlanningState {
  items: PlanItem[];
  roundsSinceUpdate: number;
}

const MAX_ITEMS = 12;
const REMINDER_INTERVAL = 3;
const VALID_STATUSES = new Set<TodoStatus>(["pending", "in_progress", "completed"]);

/**
 * Manages the session plan: validates updates, renders the plan as text,
 * and tracks how many rounds have passed without a plan refresh.
 */
export class TodoManager {
  private state: PlanningState = { items: [], roundsSinceUpdate: 0 };

  /** Exposed for testing: current rounds since last plan update. */
  get roundsSinceUpdate(): number {
    return this.state.roundsSinceUpdate;
  }

  /**
   * Returns the rendered plan text.
   * Format: [x] content | [>] content <- activeForm | [ ] content
   * Plus summary line: (N/M completed)
   * Returns placeholder if no plan exists.
   */
  render(): string {
    if (this.state.items.length === 0) return "No session plan yet.";

    const lines: string[] = [];
    const markers: Record<TodoStatus, string> = {
      completed: "[x]",
      in_progress: "[>]",
      pending: "[ ]"
    };

    for (const item of this.state.items) {
      const marker = markers[item.status];
      const suffix =
        item.status === "in_progress" && item.activeForm ? ` (${item.activeForm})` : "";
      lines.push(`${marker} ${item.content}${suffix}`);
    }

    const done = this.state.items.filter((i) => i.status === "completed").length;
    lines.push(`\n(${done}/${this.state.items.length} completed)`);
    return lines.join("\n");
  }

  /**
   * Replaces the current plan with the given items after validation.
   * Resets roundsSinceUpdate to 0.
   * Returns the rendered plan text (or an error string).
   */
  update(items: TodoItemInput[]): string {
    if (items.length === 0) throw new Error("Error: Plan must have at least one item");
    if (items.length > MAX_ITEMS)
      throw new Error(`Error: Keep the session plan short (max ${MAX_ITEMS} items)`);

    for (const [i, item] of items.entries()) {
      if (item.content.trim().length === 0)
        throw new Error(`Error: Item ${i + 1}: content required`);
      if (!VALID_STATUSES.has(item.status))
        throw new Error(`Error: Item ${i + 1}: invalid status "${item.status}"`);
    }

    const inProgressCount = items.filter((i) => i.status === "in_progress").length;
    if (inProgressCount > 1) throw new Error("Error: Only one plan item can be in_progress");

    this.state.items = items.map((item) => ({
      content: item.content,
      status: item.status,
      activeForm: item.activeForm ?? ""
    }));

    this.state.roundsSinceUpdate = 0;
    return this.render();
  }

  /** Increments roundsSinceUpdate when a round completes without calling todo. */
  noteRoundWithoutUpdate(): void {
    if (this.state.items.length > 0) this.state.roundsSinceUpdate++;
  }

  /**
   * Returns a reminder string if the plan is stale (roundsSinceUpdate >= threshold),
   * or null if no reminder is needed.
   */
  reminder(): string | null {
    if (this.state.roundsSinceUpdate >= REMINDER_INTERVAL)
      return "<reminder>Refresh your current plan before continuing.</reminder>";
    return null;
  }
}
