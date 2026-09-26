import type { BuiltinToolResults } from 'claude-code'

import { pathPart, plural, unfinishedOf, type Call, type Line } from './line'

/** A Read call's line: `Read(hooks\read.ts)`, then `⎿ Read 64 lines`. */
export function readLine(call: Call, root: string | undefined): Line {
  const input = (call.input ?? {}) as { file_path?: unknown }
  return { name: 'Read', args: [pathPart(input.file_path, root)], result: resultOf(call) }
}

/**
 * What a Read call read: `Read 64 lines`, `Read lines 1-10 of 14424` for part
 * of a file, the kind for a file that is not text; none while it runs.
 */
function resultOf(call: Call): string | undefined {
  const unfinished = unfinishedOf(call)
  if (unfinished !== undefined) return unfinished ?? undefined

  const output = call.output as BuiltinToolResults['Read']
  if (output.type !== 'text') {
    const input = call.input as { pages?: unknown }
    return typeof input.pages === 'string' ? `Read ${output.type}, pages ${input.pages}` : `Read ${output.type}`
  }

  const { startLine, numLines, totalLines } = output.file
  if (numLines === 0) return `Read no lines of ${totalLines}`
  const isWhole = startLine === 1 && numLines >= totalLines
  if (isWhole) return `Read ${plural(numLines, 'line')}`
  return `Read lines ${startLine}-${startLine + numLines - 1} of ${totalLines}`
}
