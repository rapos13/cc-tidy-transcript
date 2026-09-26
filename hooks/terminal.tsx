import type { On } from 'claude-code'

import { terminalOf, type Terminal } from './terminal-lines'

/** Output taller than this scrolls inside the row. */
const ROWS = 10

/** The columns before the text: the gutter's glyph and a space. */
const INDENT = 2

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

    const terminal = terminalOf(e.props)
    const { description, status, command, body, footer } = terminal
    const isFailed = status === 'failed'
    const gutter = rowsOf(terminal, (e.viewport?.columns ?? 0) - INDENT)

    // The gutter is placed over the row's left columns, out of the flow: it
    // spans the row's height, and the rows it has beyond that are clipped.
    return (
      <Box marginTop={1}>
        <Box position="absolute" left={0} top={0} bottom={0} width={1} flexDirection="column" overflow="hidden">
          <Text color={isFailed ? 'red' : status === 'done' ? 'green' : undefined} dimColor={status === 'running'}>
            ●
          </Text>
          {Array.from({ length: gutter - 1 }, () => (
            <Text color={isFailed ? 'red' : undefined} dimColor={!isFailed}>
              │
            </Text>
          ))}
        </Box>
        <Box flexDirection="column" marginLeft={INDENT} flexGrow={1}>
          {command.map(line => (
            <Text>{line}</Text>
          ))}
          {description !== undefined && (
            <Text italic dimColor>
              {`# ${description}`}
            </Text>
          )}
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

/**
 * At least as many rows as the row's text takes at `width` columns, so the
 * gutter never falls short; extra rows are clipped. Each character counts
 * as two columns (a wide one takes two), and without a measured width one
 * narrow enough to over-count is assumed.
 */
function rowsOf({ description, status, command, body, footer }: Terminal, width: number): number {
  const columns = width > 0 ? width : 20
  const wrapped = (line: string) => Math.max(1, Math.ceil((line.length * 2) / columns))
  const text = command.reduce((n, line) => n + wrapped(line), 0) + (description !== undefined ? wrapped(`# ${description}`) : 0)
  const output = status === 'running' ? 1 : body.length > ROWS ? ROWS + 2 : body.length
  return text + output + footer.length
}
