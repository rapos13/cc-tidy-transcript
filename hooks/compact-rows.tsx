import type { On } from 'claude-code'

import type { Call, Line } from './line'
import { readLine } from './read'
import { searchLine } from './search'
import { markContinuing } from './stretch'

/**
 * The line of each tool drawn compact. The `ToolUse` matcher below spells the
 * same names literally, which `claude plugin validate` needs to read them.
 */
const LINES: Partial<Record<string, (call: Call) => Line>> = {
  Read: readLine,
  Grep: searchLine,
  Glob: searchLine,
}

/**
 * Draws each Read, Grep and Glob row of an expanded tool group (verbose
 * output, ctrl+o) as one line: a bullet, the tool's name, what it touched and
 * the result. A stretch of such rows is set off by one empty line above it,
 * none between them; other tools' rows draw as the engine draws them.
 *
 * Each row draws from its own props, so the engine redraws a row alone when
 * its call changes. The only thing a row cannot see is its neighbour: the
 * group hook marks the rows that continue a stretch, and asks for a redraw
 * only when that marking changes. A row not yet marked draws its empty line,
 * which is right for a row outside any group.
 *
 * @param on the engine's registrar
 */
export function registerCompactRows(on: On) {
  /** The compact calls, by `tool_use_id`, whose previous call in the group is compact too. */
  const continuing = new Set<string>()
  const isCompact = (call: { tool: string }) => LINES[call.tool] !== undefined

  on('ui.render', { component: 'ToolGroup', props: { isExpanded: true } }, ($, e, next) => {
    if (markContinuing(e.props.calls, isCompact, continuing)) $.ui.invalidate('ui.render')
    return next(e)
  })

  on('ui.render', { component: 'ToolUse', props: { tool: ['Read', 'Grep', 'Glob'] } }, ($, e, next) => {
    const line = LINES[e.props.tool]
    if (!line) return next(e)
    const { Box, Text } = $.ui.resolve(e)

    const [name, subject, detail] = line(e.props)
    const isErrored = e.props.isErrored || e.props.isInterrupted
    const isDone = e.props.output !== undefined

    return (
      <Box marginTop={continuing.has(e.props.tool_use_id) ? 0 : 1}>
        <Text>
          <Text color={isErrored ? 'red' : isDone ? 'green' : undefined} dimColor={!isDone}>
            {'● '}
          </Text>
          <Text bold>{`${name} `}</Text>
          <Text>{subject}</Text>
          <Text dimColor>{` · ${detail}`}</Text>
        </Text>
      </Box>
    )
  })
}
