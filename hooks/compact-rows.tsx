import { atom, memberOf, read } from 'claude-code'
import type { On, StateDollar } from 'claude-code'

import type { Call, Line } from './line'
import { readLine } from './read'
import { searchLine } from './search'
import { StretchMarks } from './stretch'

/**
 * The line of each tool drawn compact. The `ToolUse` matcher below spells the
 * same names literally, which `claude plugin validate` needs to read them.
 */
const LINES: Partial<Record<string, (call: Call, root: string | undefined) => Line>> = {
  Read: readLine,
  Grep: searchLine,
  Glob: searchLine,
}

const CONTINUES = { plugin: 'tidy-transcript', key: 'continuesStretch' } as const

/**
 * Whether a compact row continues a stretch (draws no blank line above), one
 * member per row, by `tool_use_id`. False until its group marks it, which is
 * right for a row outside any group.
 */
const continuesStretch = atom(CONTINUES, false)

/**
 * Draws each Read, Grep and Glob row of an expanded tool group (verbose
 * output, ctrl+o) compact: a bullet and `Name(args)`, paths relative to the
 * project root (a path outside it whole, italic, after a yellow `◆`), then
 * the result on a `⎿` line once it arrived. A stretch of such rows is set off by one empty line above it,
 * none between them; other tools' rows draw as the engine draws them.
 *
 * Each row draws from its own props, so the engine redraws a row alone when
 * its call changes. The only thing a row cannot see is its neighbour: its
 * group can, and marks it in `continuesStretch`. The row reads its own member
 * and is redrawn alone when that member changes. A draw may not write
 * `$.state`, so the group hook queues the marks that changed and a timer
 * writes them once the draw is over.
 *
 * @param on the engine's registrar
 */
export function registerCompactRows(on: On) {
  const marks = new StretchMarks(call => LINES[call.tool] !== undefined)

  on('ui.render', { component: 'ToolGroup', props: { isExpanded: true } }, ($, e, next) => {
    if (marks.note(e.props.calls)) $.clock.after(0, () => void writeMarks($, marks))
    return next(e)
  })

  on('ui.render', { component: 'ToolUse', props: { tool: ['Read', 'Grep', 'Glob'] } }, async ($, e, next) => {
    const line = LINES[e.props.tool]
    if (!line) return next(e)
    const { Box, Text } = $.ui.resolve(e)

    const { name, args, result } = line(e.props, await $.session.root())
    const isErrored = e.props.isErrored || e.props.isInterrupted
    const isDone = e.props.output !== undefined
    const continues = await read($, memberOf(continuesStretch, e))

    return (
      <Box flexDirection="column" marginTop={continues ? 0 : 1}>
        <Text>
          <Text color={isErrored ? 'red' : isDone ? 'green' : undefined} dimColor={!isDone}>
            {'● '}
          </Text>
          <Text bold>{name}</Text>
          {'('}
          {args.map((part, i) => (
            <Text>
              {`${i === 0 ? '' : ', '}${part.label === undefined ? '' : `${part.label}: `}`}
              {part.isOutside && <Text color="yellow">{'◆ '}</Text>}
              <Text italic={part.isOutside}>{part.text}</Text>
            </Text>
          ))}
          {')'}
        </Text>
        {result !== undefined && (
          <Text color={isErrored ? 'red' : undefined} dimColor={!isErrored}>
            {`  ⎿  ${result}`}
          </Text>
        )}
      </Box>
    )
  })
}

/**
 * Writes the queued marks into `continuesStretch`, which redraws each row
 * whose mark changed. Called from a timer, outside any draw.
 *
 * @param $ the hooks' `$`
 * @param marks the group marks, whose queue it empties
 */
async function writeMarks($: StateDollar, marks: StretchMarks) {
  for (const mark of marks.take()) {
    const [id, continues] = mark
    const ref = { ...CONTINUES, id }
    try {
      // After a hot reload the marks start empty while the host kept the
      // values: skip a write that would only redraw the row unchanged.
      if ((await $.state.get(ref)).value === continues) continue
      await $.state.set(ref, continues)
    } catch {
      marks.forget(mark)
    }
  }
}
