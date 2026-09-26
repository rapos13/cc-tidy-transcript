import type { ClientModule, ClientPointerEvent, ClientSurface } from 'claude-code'

import type { OutputLine } from './terminal-lines'

/**
 * What the terminal row hands its body: a ticker while the command runs, or
 * output taller than the box to scroll through.
 */
export type BodyProps = { mode: 'running' } | { mode: 'scroll'; lines: OutputLine[]; rows: number }

/** A held pointer: the row it went down on, the offset then, and whether it holds the thumb. */
type Drag = { from: number; start: number; isThumb: boolean }

type BodyState = { seconds?: number; offset?: number; drag?: Drag }

type Surface = ClientSurface<BodyState>

/**
 * The body of a terminal row, on the drawing thread. Running, it counts the
 * seconds on its own frame clock, with no hook redrawing it. Done, it shows
 * `rows` lines of the output, opened at the end, between a count of the
 * lines above and one of the lines below, with a scrollbar in its right
 * column: drag the text or the thumb, click the track or a count to page,
 * or after a click use the arrows, PgUp, PgDn, Home and End.
 */
const TerminalBody: ClientModule<BodyProps, BodyState> = (props, surface) =>
  props.mode === 'running' ? ticker(surface) : scroller(props.lines, props.rows, surface)

export default TerminalBody

function ticker(surface: Surface) {
  const { Text } = surface.elements
  if (surface.state === undefined) {
    surface.every(1000, () => surface.setState({ seconds: (surface.state?.seconds ?? 0) + 1 }))
    surface.setState({ seconds: 0 })
  }
  return <Text dimColor>{`running… ${elapsed(surface.state?.seconds ?? 0)}`}</Text>
}

/** `12s`, `3m 07s`. */
function elapsed(seconds: number): string {
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

function scroller(lines: OutputLine[], rows: number, surface: Surface) {
  const { Box, Text } = surface.elements
  const last = Math.max(0, lines.length - rows)
  const offset = clamp(surface.state?.offset ?? last, last)
  const thumb = thumbOf(offset, last, rows, lines.length)

  const scrollTo = (next: number, drag = surface.state?.drag) =>
    surface.setState({ ...surface.state, offset: clamp(next, last), drag })

  surface.onKey(({ key }) => {
    const moves: Partial<Record<string, number>> = {
      up: offset - 1,
      down: offset + 1,
      pageup: offset - rows,
      pagedown: offset + rows,
      home: 0,
      end: last,
    }
    const next = moves[key]
    if (next !== undefined) scrollTo(next)
  })

  surface.onPointer((event: ClientPointerEvent) => {
    const drag = surface.state?.drag
    if (event.type === 'down' && event.button === 'left') {
      // Row 0 and the last row are the counts: a click there pages that way.
      const row = event.y - 1
      if (row < 0) return scrollTo(offset - rows)
      if (row >= rows) return scrollTo(offset + rows)
      const onBar = event.x >= surface.columns - 1
      if (!onBar) return scrollTo(offset, { from: event.y, start: offset, isThumb: false })
      if (row >= thumb.top && row < thumb.top + thumb.size)
        return scrollTo(offset, { from: event.y, start: offset, isThumb: true })
      return scrollTo(row < thumb.top ? offset - rows : offset + rows)
    }
    if (event.type === 'move' && drag && event.button) {
      const moved = event.y - drag.from
      const track = rows - thumb.size
      return scrollTo(drag.isThumb ? drag.start + (track > 0 ? Math.round((moved * last) / track) : 0) : drag.start - moved, drag)
    }
    if (event.type === 'up' && drag) scrollTo(offset, undefined)
  })

  return (
    <Box flexDirection="column" height={rows + 2}>
      <Text dimColor wrap="truncate">
        {`↑ ${countOf(offset)} above`}
      </Text>
      <Box flexDirection="row" height={rows}>
        <Box flexDirection="column" flexGrow={1}>
          {lines.slice(offset, offset + rows).map(([tone, text]) => (
            <Text wrap="truncate" color={tone === 'err' ? 'red' : undefined} dimColor={tone === 'dim'}>
              {text === '' ? ' ' : text}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column" width={1} marginLeft={1}>
          {Array.from({ length: rows }, (_, row) => {
            const isThumb = row >= thumb.top && row < thumb.top + thumb.size
            return <Text dimColor={!isThumb}>{isThumb ? '█' : '│'}</Text>
          })}
        </Box>
      </Box>
      <Text dimColor wrap="truncate">
        {`↓ ${countOf(last - offset)} below`}
      </Text>
    </Box>
  )
}

/** `1 line`, `20 lines`. */
function countOf(lines: number): string {
  return `${lines} ${lines === 1 ? 'line' : 'lines'}`
}

function clamp(offset: number, last: number): number {
  return Math.min(Math.max(0, offset), last)
}

/** The thumb's first row and height in a track `rows` tall. */
function thumbOf(offset: number, last: number, rows: number, total: number) {
  const size = Math.max(1, Math.round((rows * rows) / total))
  const top = last === 0 ? 0 : Math.round((offset / last) * (rows - size))
  return { top, size }
}
