import { expect, mock, test } from 'claude-code/testing'
import type { Engine, Mounted } from 'claude-code/testing'
import type { On, RenderPropsOf } from 'claude-code'

const PLUGIN = 'tidy-transcript'

type Row = RenderPropsOf['ToolUse']

const row = (tool_use_id: string, tool: string, input: unknown): Row => ({
  tool_use_id,
  tool,
  input,
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
  output: undefined,
})

const READ_A = row('toolu_a', 'Read', { file_path: 'a.ts' })
const READ_B = row('toolu_b', 'Read', { file_path: 'b.ts' })
const GREP_C = row('toolu_c', 'Grep', { pattern: 'TODO' })
const BASH = row('toolu_bash', 'Bash', { command: 'ls' })

const group = (...calls: Row[]): RenderPropsOf['ToolGroup'] => ({ calls, isActive: false, isExpanded: true })

const ROOT = 'C:\\_dev\\proj'

/**
 * Stands for the engine beneath the plugin: draws an empty box for what it
 * passes on, and answers the session's project root.
 */
function drawAsEngine(on: On) {
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('session.root', () => ({ value: ROOT }))
}

const mountRow = (engine: Engine, props: Row) =>
  engine.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'ToolUse', requestId: props.tool_use_id, props })

const mountGroup = (engine: Engine, props: RenderPropsOf['ToolGroup']) =>
  engine.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'ToolGroup', requestId: 'collapsed-1', props })

const blankLinesAbove = async (drawing: Mounted<'terminal', 'ToolUse'>) =>
  (await drawing.find({ type: 'Box' }))?.props['marginTop']

test('a row draws its blank line until its group marks it as continuing', async ($, on) => {
  const clock = mock.clock(on)
  drawAsEngine(on)
  const invalidated: string[] = []
  on('ui.invalidate', (_$, e) => {
    invalidated.push(e.event)
    return { value: undefined }
  })

  const a = await mountRow($, READ_A)
  const b = await mountRow($, READ_B)
  expect(await blankLinesAbove(b)).toBe(1)

  await mountGroup($, group(READ_A, READ_B))
  await clock.settle()

  expect(await blankLinesAbove(a)).toBe(1)
  expect(await blankLinesAbove(b)).toBe(0)
  expect(invalidated, 'the rows redraw from the state they read').toEqual([])
})

test('a compact row after another tool starts a new stretch', async ($, on) => {
  const clock = mock.clock(on)
  drawAsEngine(on)

  const b = await mountRow($, READ_B)
  const c = await mountRow($, GREP_C)
  await mountGroup($, group(READ_A, BASH, READ_B, GREP_C))
  await clock.settle()

  expect(await blankLinesAbove(b)).toBe(1)
  expect(await blankLinesAbove(c)).toBe(0)
})

test('a mark follows its group when the group changes', async ($, on) => {
  const clock = mock.clock(on)
  drawAsEngine(on)

  const b = await mountRow($, READ_B)
  const drawnGroup = await mountGroup($, group(READ_A, READ_B))
  await clock.settle()
  expect(await blankLinesAbove(b)).toBe(0)

  await drawnGroup.redraw(group(READ_A, BASH, READ_B))
  await clock.settle()
  expect(await blankLinesAbove(b)).toBe(1)
})

test('a row draws Name(args) root-relative, and its ⎿ result only once it arrived', async ($, on) => {
  drawAsEngine(on)
  const running = row('toolu_r', 'Read', { file_path: `${ROOT}\\hooks\\a.ts` })

  const drawing = await mountRow($, running)
  expect(await drawing.find({ text: 'hooks\\a.ts' })).toBeDefined()
  expect(await drawing.find({ type: 'Text', text: /⎿/ })).toBeUndefined()

  const done = { type: 'text', file: { filePath: 'a.ts', content: '', startLine: 1, numLines: 3, totalLines: 3 } }
  await drawing.redraw({ ...running, output: done })
  expect((await drawing.find({ type: 'Text', text: /⎿/ }))?.text).toBe('  ⎿  Read 3 lines')
})

test('a path outside the root draws whole, in italic, after a yellow ◆', async ($, on) => {
  drawAsEngine(on)
  const drawing = await mountRow($, row('toolu_o', 'Grep', { pattern: 'x', path: 'C:\\Users\\u' }))
  expect(italicTexts(await drawing.find({ type: 'Box' }))).toEqual(['C:\\Users\\u'])
  expect((await drawing.find({ type: 'Text' }))?.text).toBe('● Search(path: ◆ C:\\Users\\u, pattern: "x")')
  const coloured = (await drawing.findAll({ type: 'Text' })).filter(t => t.props['color'] !== undefined)
  expect(coloured.map(t => [t.text, t.props['color']])).toEqual([['◆ ', 'yellow']])
})

test('a path inside the root has no ◆', async ($, on) => {
  drawAsEngine(on)
  const drawing = await mountRow($, row('toolu_i', 'Read', { file_path: `${ROOT}\\a.ts` }))
  expect((await drawing.find({ type: 'Text' }))?.text).toBe('● Read(a.ts)')
})

/** The text of every italic span in a drawn tree. */
function italicTexts(node: unknown): string[] {
  if (typeof node !== 'object' || node === null) return []
  const { props, children } = node as { props?: Record<string, unknown>; children?: unknown[] }
  const own = props?.['italic'] === true ? [(children ?? []).filter(c => typeof c === 'string').join('')] : []
  return [...own, ...(children ?? []).flatMap(italicTexts)]
}

test('a group that briefly drops its last call leaves that call marked', async ($, on) => {
  const clock = mock.clock(on)
  drawAsEngine(on)

  const b = await mountRow($, READ_B)
  const drawnGroup = await mountGroup($, group(READ_A, READ_B))
  await clock.settle()

  await drawnGroup.redraw(group(READ_A))
  await clock.settle()
  expect(await blankLinesAbove(b)).toBe(0)
})
