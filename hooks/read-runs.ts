import type { BuiltinToolResults, On } from 'claude-code'

import { pendingOf, registerRuns, type RunCall } from './runs'

/**
 * Collapses each run of consecutive Read calls into one block: `Read N files`,
 * then one `⎿` line per file with the lines it read.
 *
 * @param on the engine's registrar
 */
export function registerReadRuns(on: On) {
  registerRuns(on, {
    tools: ['Read'],
    header: (count) => ['Read', `${count} files`],
    line: (call) => ['Read', pathOf(call), rangeOf(call)],
  })
}

/** The file a Read call names, as the model gave it. */
function pathOf(call: RunCall): string {
  const input = (call.input ?? {}) as { file_path?: unknown }
  return typeof input.file_path === 'string' ? input.file_path : '…'
}

/**
 * What a Read call read: `lines 1-64`, `lines 1-10 of 14424` for part of a
 * file, the kind for a file that is not text; its state while unresolved.
 */
function rangeOf(call: RunCall): string {
  const pending = pendingOf(call, 'reading…')
  if (pending) return pending

  const output = call.output as BuiltinToolResults['Read']
  if (output.type !== 'text') {
    const input = call.input as { pages?: unknown }
    return typeof input.pages === 'string' ? `${output.type}, pages ${input.pages}` : output.type
  }

  const { startLine, numLines, totalLines } = output.file
  if (numLines === 0) return `no lines of ${totalLines}`
  const range = `lines ${startLine}-${startLine + numLines - 1}`
  const isWhole = startLine === 1 && numLines >= totalLines
  return isWhole ? range : `${range} of ${totalLines}`
}
