import type { ToolGroupCall } from 'claude-code'

/** A compact call's `tool_use_id` and whether it continues a stretch. */
export type Mark = [id: string, continues: boolean]

/**
 * Which of a group's compact calls continue a stretch: a compact call does
 * when the call just before it in the group is compact too, so its row draws
 * with no blank line above. Calls that are not compact, or have no id, are
 * not listed.
 *
 * @param calls the group's calls, in the order the model made them
 * @param isCompact whether a call draws as a compact line
 * @returns a mark for each compact call
 */
export function stretchMarks(calls: readonly ToolGroupCall[], isCompact: (call: ToolGroupCall) => boolean): Mark[] {
  const marks: Mark[] = []
  calls.forEach((call, i) => {
    const id = call.tool_use_id
    if (!id || !isCompact(call)) return
    const previous = calls[i - 1]
    marks.push([id, previous !== undefined && isCompact(previous)])
  })
  return marks
}

/**
 * The marks the group hook found while drawing, until they are written: a
 * draw may not write `$.state`, so a mark waits here for a timer.
 *
 * Calls a group does not list keep their mark, so a group that briefly drops
 * its last call changes nothing.
 */
export class StretchMarks {
  /** Every mark noted, so a group redraw that changes none queues nothing. */
  private readonly noted = new Map<string, boolean>()
  /** The marks noted but not yet taken for writing. */
  private readonly queued = new Map<string, boolean>()

  /** @param isCompact whether a call draws as a compact line */
  constructor(private readonly isCompact: (call: ToolGroupCall) => boolean) {}

  /**
   * Notes one group's marks, queueing the ones that changed.
   *
   * @param calls the group's calls, in the order the model made them
   * @returns whether any mark was queued
   */
  note(calls: readonly ToolGroupCall[]): boolean {
    let isChanged = false
    for (const [id, continues] of stretchMarks(calls, this.isCompact)) {
      if (this.noted.get(id) === continues) continue
      this.noted.set(id, continues)
      this.queued.set(id, continues)
      isChanged = true
    }
    return isChanged
  }

  /** Hands over the queued marks for writing, emptying the queue. */
  take(): Mark[] {
    const marks = [...this.queued]
    this.queued.clear()
    return marks
  }

  /**
   * Forgets a mark that could not be written, so the group's next draw
   * queues it again. A newer mark for the call is kept.
   */
  forget([id, continues]: Mark) {
    if (this.noted.get(id) === continues) this.noted.delete(id)
  }
}
