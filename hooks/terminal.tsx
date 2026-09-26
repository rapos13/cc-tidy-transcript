import type { On } from 'claude-code'

import { terminalOf, wrap } from './terminal-lines'

/** Output taller than this scrolls inside the row. */
const ROWS = 10

/** The columns before the text: the gutter's glyph and a space. */
const INDENT = 2

/**
 * Columns kept free at the right: the viewport is the whole surface's
 * width, not the row's, and a row wrapped too wide loses its end.
 */
const MARGIN = 2

/** The width assumed when the surface has not measured. */
const UNMEASURED = 80

/**
 * Draws each Bash and PowerShell row as a mini terminal: the command, its
 * description as a `#` comment and the output, with the extras the result
 * carries in a dim footer, all behind a gutter. The gutter's bullet carries
 * the status (dim running, green done, red failed) and a line runs down
 * from it along the row. Output taller than `ROWS` is a `Client` that
 * scrolls; while the command runs, one that counts seconds.
 *
 * Each row draws from its own props alone, so the engine redraws it by
 * itself when its output arrives. The output is drawn in the row, so the
 * `ToolResult` a standalone row would add under it is hidden. Only the
 * terminal surface: the others draw as the engine draws them.
 *
 * @param on the engine's registrar
 */
export function registerTerminal(on: On) {
  on('ui.render', { component: 'ToolResult', props: { tool: ['Bash', 'PowerShell'] } }, ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolUse', props: { tool: ['Bash', 'PowerShell'] } }, ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const { Box, Text, Client } = $.ui.resolve(e)

    const { description, status, command, body, footer } = terminalOf(e.props)
    const isFailed = status === 'failed'
    const width = (e.viewport?.columns ?? UNMEASURED) - INDENT - MARGIN
    const commandRows = command.flatMap(line => wrap(line, width))
    const descriptionRows = description === undefined ? [] : wrap(`# ${description}`, width)
    const outputRows = status === 'running' ? 1 : body.length > ROWS ? ROWS + 2 : body.length
    const gutter = commandRows.length + descriptionRows.length + outputRows + footer.length

    // The gutter is a column in the flow beside the text, one glyph per row:
    // every row of text truncates, so the count is exact. Not an absolute
    // box: in a row partly scrolled out of the transcript, one is placed
    // against the row's first visible row, not its top.
    return (
      <Box marginTop={1} flexDirection="row">
        <Box flexDirection="column" width={1} flexShrink={0}>
          <Text color={isFailed ? 'red' : status === 'done' ? 'green' : undefined} dimColor={status === 'running'}>
            ●
          </Text>
          {Array.from({ length: gutter - 1 }, () => (
            <Text color={isFailed ? 'red' : undefined} dimColor={!isFailed}>
              │
            </Text>
          ))}
        </Box>
        <Box flexDirection="column" marginLeft={INDENT - 1} flexGrow={1}>
          {commandRows.map(line => (
            <Text wrap="truncate">{line === '' ? ' ' : line}</Text>
          ))}
          {descriptionRows.map(line => (
            <Text wrap="truncate" italic dimColor>
              {line}
            </Text>
          ))}
          {status === 'running' ? (
            <Client key="running" module="./terminal-body.tsx" props={{ mode: 'running' }} height={1} />
          ) : body.length > ROWS ? (
            <Client key="output" module="./terminal-body.tsx" props={{ mode: 'scroll', lines: body, rows: ROWS }} height={ROWS + 2} />
          ) : (
            body.map(([tone, text]) => (
              <Text wrap="truncate" color={tone === 'err' ? 'red' : undefined} dimColor={tone === 'dim'}>
                {text === '' ? ' ' : text}
              </Text>
            ))
          )}
          {footer.map(line => (
            <Text wrap="truncate" dimColor>
              {line}
            </Text>
          ))}
        </Box>
      </Box>
    )
  })
}
