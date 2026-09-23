import type { On } from 'claude-code'

/**
 * Where the probe writes what it saw, one JSON object per line: the repo's
 * `.probe/`, beside the plugin's folder, where test-claude.ps1 puts the debug log.
 */
const LOG = '../.probe/render.jsonl'

/**
 * A development aid: records the order of tool calls and every distinct
 * `ToolGroup` and `ToolUse` drawing to the repo's `.probe/render.jsonl`, fresh each
 * session, so a test run shows what the engine did. Changes no drawing.
 *
 * @param on the engine's registrar
 */
export function registerProbe(on: On) {
  const lines: string[] = []
  const seen = new Set<string>()
  let written = 0

  const record = (entry: object) => {
    const line = JSON.stringify(entry)
    if (seen.has(line)) return
    seen.add(line)
    lines.push(JSON.stringify({ at: Date.now(), ...entry }))
  }

  const nameOf = (tool: string, input: unknown) => {
    const i = (input ?? {}) as Record<string, unknown>
    const arg = i.file_path ?? i.command ?? i.pattern ?? i.path ?? ''
    return `${tool}(${String(arg).slice(0, 60)})`
  }

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const path = `${$.plugin.root}/${LOG}`
    await $.fs.write(path, '')
    $.clock.every(1000, () => {
      if (lines.length === written) return
      written = lines.length
      void $.fs.write(path, lines.join('\n') + '\n')
    })
    return result
  })

  on('tool.call', ($, e, next) => {
    record({ event: 'tool.call', id: e.tool_use_id, call: nameOf(e.tool, e) })
    return next(e)
  })

  on('ui.render', { component: 'ToolGroup' }, ($, e, next) => {
    record({
      event: 'ToolGroup',
      requestId: e.requestId,
      isExpanded: e.props.isExpanded,
      isActive: e.props.isActive,
      calls: e.props.calls.map((c) => nameOf(c.tool, c.input)),
      ids: e.props.calls.map((c) => c.tool_use_id),
    })
    return next(e)
  })

  on('ui.render', { component: 'ToolUse' }, ($, e, next) => {
    record({
      event: 'ToolUse',
      requestId: e.requestId,
      call: nameOf(e.props.tool, e.props.input),
      isRunning: e.props.isRunning,
    })
    return next(e)
  })
}
