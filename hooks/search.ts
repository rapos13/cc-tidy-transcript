import type { BuiltinToolResults } from 'claude-code'

import { pathPart, plural, unfinishedOf, type Call, type Line, type Part } from './line'
import { isAbsolute } from './paths'

/**
 * A Grep or Glob call's line: `Search`, every input it was given by name, and
 * how many results it found:
 * `Search(path: src, pattern: "TODO", glob: *.ts, -i)`, then `⎿ Found 12 files`.
 */
export function searchLine(call: Call, root: string | undefined): Line {
  return { name: 'Search', args: argsOf(call, root), result: resultOf(call) }
}

/**
 * A search's inputs that have a value: `path` first, the rest in the order the
 * model gave them. A Grep pattern is quoted, anything else bare; a flag that
 * is on draws as its name, one that is off not at all. A path, and a Glob
 * pattern written as an absolute path, is shown relative to the root.
 */
function argsOf(call: Call, root: string | undefined): Part[] {
  const input = (call.input ?? {}) as Record<string, unknown>
  const keys = Object.keys(input)
  const ordered = keys.includes('path') ? ['path', ...keys.filter(key => key !== 'path')] : keys

  const parts: Part[] = []
  for (const key of ordered) {
    const value = input[key]
    if (value === undefined || value === null || value === '' || value === false) continue
    if (value === true) parts.push({ text: key })
    else if (key === 'path') parts.push(pathPart(value, root, key))
    else if (key === 'pattern' && call.tool === 'Grep') parts.push({ label: key, text: `"${String(value)}"` })
    else if (key === 'pattern' && typeof value === 'string' && isAbsolute(value)) parts.push(pathPart(value, root, key))
    else parts.push({ label: key, text: typeof value === 'object' ? JSON.stringify(value) : String(value) })
  }
  return parts
}

/**
 * How many results a search found, in the unit its mode returns:
 * `Found 12 files`, `Found 40 lines`, `Found 7 matches in 3 files`; a `+` when
 * a limit cut the list short; none while it runs.
 */
function resultOf(call: Call): string | undefined {
  const unfinished = unfinishedOf(call)
  if (unfinished !== undefined) return unfinished ?? undefined

  if (call.tool === 'Glob') {
    const output = call.output as BuiltinToolResults['Glob']
    if (!output.truncated) return `Found ${plural(output.numFiles, 'file')}`
    const total = output.totalMatches ?? output.numFiles
    return `Found ${output.numFiles} of ${total}${output.countIsComplete === false ? '+' : ''} files`
  }

  const output = call.output as BuiltinToolResults['Grep']
  const more = output.appliedLimit === undefined ? '' : '+'
  switch (output.mode) {
    case 'content':
      return `Found ${plural(output.numLines ?? 0, 'line')}${more}`
    case 'count':
      return `Found ${plural(output.numMatches ?? 0, 'match', 'matches')} in ${plural(output.numFiles, 'file')}${more}`
    default:
      return `Found ${plural(output.numFiles, 'file')}${more}`
  }
}
