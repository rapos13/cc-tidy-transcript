import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderPropsOf } from 'claude-code'

const PLUGIN = 'tidy-transcript'

type Row = RenderPropsOf['ToolUse']

const BASH: Row = {
  tool_use_id: 'toolu_bash',
  tool: 'Bash',
  input: { command: 'git log --oneline', description: 'Show recent commits' },
  isRunning: true,
  isErrored: false,
  isInterrupted: false,
  output: undefined,
}

const done = (stdout: string): Row => ({ ...BASH, isRunning: false, output: { stdout, stderr: '', interrupted: false } })

const numbered = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n')

/** Stands for the engine beneath the plugin: draws an empty box for what it passes on. */
function drawAsEngine(on: On) {
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}

const mountRow = (engine: Engine, props: Row) =>
  engine.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'ToolUse', requestId: props.tool_use_id, props })

/** The output lines a Client body shows, top to bottom. */
const shown = async (row: Awaited<ReturnType<typeof mountRow>>) =>
  (await row.findAll({ type: 'Text', text: /^line /, in: 'output' })).map(t => t.text)

/** The gutter's glyphs, top to bottom. */
const gutterOf = async (row: Awaited<ReturnType<typeof mountRow>>) =>
  (await row.findAll({ type: 'Text', text: /^[●│]$/ })).map(t => t.text)

/** The counts above and below a Client body's lines. */
const counts = async (row: Awaited<ReturnType<typeof mountRow>>) =>
  (await row.findAll({ type: 'Text', text: /^[↑↓] /, in: 'output' })).map(t => t.text)

test('a running row ticks seconds in its body', async ($, on) => {
  drawAsEngine(on)
  const row = await mountRow($, BASH)
  expect(await row.find({ text: '$ git log --oneline' })).toBeDefined()
  expect((await row.find({ text: /^# / }))?.text).toBe('# Show recent commits')
  expect(await gutterOf(row)).toEqual(['●', '│', '│'])

  await row.advance(3000)
  expect((await row.find({ type: 'Text', in: 'running' }))?.text).toBe('running… 3s')
})

test('the gutter has one glyph per row: long lines are wrapped by the row, never by the surface', async ($, on) => {
  drawAsEngine(on)
  const command = 'echo alpha beta gamma delta epsilon'
  const row = await $.ui.mount({
    plugin: PLUGIN,
    surface: 'terminal',
    component: 'ToolUse',
    requestId: 'toolu_bash',
    props: { ...done('one\ntwo'), input: { command, description: 'Print some Greek letters' } },
    viewport: { columns: 24, rows: 40 },
  })
  // 24 columns, less the gutter and the margin: 20 to each row.
  const rows = (await row.findAll({ type: 'Text' })).filter(t => !/^[●│]$/.test(t.text)).map(t => t.text)
  expect(rows).toEqual(['$ echo alpha beta', 'gamma delta epsilon', '# Print some Greek', 'letters', 'one', 'two'])
  expect((await gutterOf(row)).length).toBe(rows.length)
})

test('short output draws in the row, with no Client', async ($, on) => {
  drawAsEngine(on)
  const row = await mountRow($, BASH)
  await row.redraw(done('a81b350 one\nf8ad56b two\n'))

  expect(await row.find({ type: 'Client' })).toBeUndefined()
  expect(await row.find({ text: 'f8ad56b two' })).toBeDefined()
})

test('long output opens at its end and scrolls by key, drag and scrollbar', async ($, on) => {
  drawAsEngine(on)
  const row = await mountRow($, done(numbered(30)))
  await row.resize({ columns: 40, rows: 12, in: 'output' })
  expect(await shown(row)).toEqual(Array.from({ length: 10 }, (_, i) => `line ${i + 21}`))
  expect(await counts(row)).toEqual(['↑ 20 lines above', '↓ 0 lines below'])

  await row.key({ key: 'home', in: 'output' })
  expect((await shown(row))[0]).toBe('line 1')
  await row.key({ key: 'pagedown', in: 'output' })
  expect((await shown(row))[0]).toBe('line 11')
  expect(await counts(row)).toEqual(['↑ 10 lines above', '↓ 10 lines below'])

  // A click on the count below pages down.
  await row.pointer({ type: 'down', x: 5, y: 11, button: 'left', in: 'output' })
  expect((await shown(row))[0]).toBe('line 21')
  await row.key({ key: 'pageup', in: 'output' })

  // Drag the text up by three rows: three lines further down.
  await row.pointer({ type: 'down', x: 5, y: 5, button: 'left', in: 'output' })
  await row.pointer({ type: 'move', x: 5, y: 2, button: 'left', in: 'output' })
  await row.pointer({ type: 'up', x: 5, y: 2, button: 'left', in: 'output' })
  expect((await shown(row))[0]).toBe('line 14')

  // Click the scrollbar's track above the thumb (its first row, under the count): a page up.
  await row.key({ key: 'end', in: 'output' })
  await row.pointer({ type: 'down', x: 39, y: 1, button: 'left', in: 'output' })
  expect((await shown(row))[0]).toBe('line 11')
})

test('a standalone row hides its ToolResult, which would draw the output again', async ($, on) => {
  drawAsEngine(on)
  const result = await $.ui.mount({
    plugin: PLUGIN,
    surface: 'terminal',
    component: 'ToolResult',
    requestId: 'toolu_bash',
    props: { tool_use_id: 'toolu_bash', tool: 'Bash', output: { stdout: 'x', stderr: '', interrupted: false }, isErrored: false },
  })
  expect(await result.drawn()).toMatchObject({ type: 'Box', props: { display: 'none' } })
})

test('other surfaces draw as the engine does', async ($, on) => {
  drawAsEngine(on)
  const row = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'ToolUse', props: BASH })
  expect(await row.drawn()).toEqual({ type: 'Box' })
})
