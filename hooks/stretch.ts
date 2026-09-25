import type { ToolGroupCall } from 'claude-code'

/**
 * Brings `continuing` up to date with one group's calls: a compact call is in
 * it when the call just before it in the group is compact too, so its row
 * draws with no blank line above. Calls the group does not list are left as
 * they are, so a group that briefly drops its last call changes nothing.
 *
 * @param calls the group's calls, in the order the model made them
 * @param isCompact whether a call draws as a compact line
 * @param continuing the `tool_use_id`s of the compact calls that continue a stretch
 * @returns whether `continuing` changed
 */
export function markContinuing(
  calls: readonly ToolGroupCall[],
  isCompact: (call: ToolGroupCall) => boolean,
  continuing: Set<string>,
): boolean {
  let isChanged = false
  calls.forEach((call, i) => {
    const id = call.tool_use_id
    if (!id || !isCompact(call)) return
    const previous = calls[i - 1]
    const isContinuing = previous !== undefined && isCompact(previous)
    if (isContinuing === continuing.has(id)) return
    if (isContinuing) continuing.add(id)
    else continuing.delete(id)
    isChanged = true
  })
  return isChanged
}
