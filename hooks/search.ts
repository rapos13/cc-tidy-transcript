import type { BuiltinToolInputs, BuiltinToolResults } from 'claude-code'

import { pendingOf, type Call, type Line } from './line'

/**
 * A Grep or Glob call's line: `Search`, what was searched and how many
 * results it found: `Search "TODO" in src · glob *.ts · 12 files`.
 */
export function searchLine(call: Call): Line {
  return ['Search', queryOf(call), countOf(call)]
}

/**
 * What a search looked for: a Grep's pattern quoted, a Glob's bare, then
 * where and through which filters: `"TODO" in src · glob *.ts · -i`.
 */
function queryOf(call: Call): string {
  if (call.tool === 'Glob') {
    const input = (call.input ?? {}) as Partial<BuiltinToolInputs['Glob']>
    return [input.pattern ?? '…', input.path && `in ${input.path}`].filter(Boolean).join(' ')
  }

  const input = (call.input ?? {}) as Partial<BuiltinToolInputs['Grep']>
  const subject = [input.pattern === undefined ? '…' : `"${input.pattern}"`, input.path && `in ${input.path}`]
  const filters = [
    input.glob && `glob ${input.glob}`,
    input.type && `type ${input.type}`,
    input['-i'] && '-i',
    input.multiline && 'multiline',
  ]
  return [subject.filter(Boolean).join(' '), ...filters.filter(Boolean)].join(' · ')
}

/**
 * How many results a search found, in the unit its mode returns: `12 files`,
 * `40 lines`, `7 matches in 3 files`; a `+` when a limit cut the list short;
 * its state while unresolved.
 */
function countOf(call: Call): string {
  const pending = pendingOf(call, 'searching…')
  if (pending) return pending

  if (call.tool === 'Glob') {
    const output = call.output as BuiltinToolResults['Glob']
    if (!output.truncated) return plural(output.numFiles, 'file')
    const total = output.totalMatches ?? output.numFiles
    return `${output.numFiles} of ${total}${output.countIsComplete === false ? '+' : ''} files`
  }

  const output = call.output as BuiltinToolResults['Grep']
  const more = output.appliedLimit === undefined ? '' : '+'
  switch (output.mode) {
    case 'content':
      return `${plural(output.numLines ?? 0, 'line')}${more}`
    case 'count':
      return `${plural(output.numMatches ?? 0, 'match', 'matches')} in ${plural(output.numFiles, 'file')}${more}`
    default:
      return `${plural(output.numFiles, 'file')}${more}`
  }
}

/** `1 file`, `3 files`. */
function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
