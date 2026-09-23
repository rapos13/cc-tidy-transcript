import type { BuiltinToolResults, On, ToolGroupCall } from 'claude-code'

/** A run of two or more Read calls, one after another in a tool group. */
type Run = {
  /** The run's calls in the order the model made them; the first draws the run. */
  calls: ToolGroupCall[]
}

/**
 * Collapses each run of consecutive Read calls in an expanded tool group
 * (verbose output, ctrl+o) into one block, set off by an empty line above as
 * the engine sets off a row: `Read N files`, then one `⎿` line
 * per file with the lines it read. A Read on its own draws that line alone,
 * the header's bullet and `Read` in place of the `⎿`. Calls of other tools draw as the
 * engine draws them.
 *
 * The engine draws a group's rows itself and hands a hook only an opaque
 * drawing, so the collapse happens row by row: the group hook finds the runs,
 * the run's first Read row draws the block and the others draw nothing. Runs
 * are keyed by `tool_use_id`, which, unlike the group's own id, holds still
 * while the group streams; a row drawn before its group learns its run on the
 * redraw the group hook asks for.
 *
 * @param on the engine's registrar
 */
export function registerReadRuns(on: On) {
  /** Each Read call in a run, by `tool_use_id`, to its run. */
  const runOf = new Map<string, Run>()
  /** The runs each group had when last drawn, by the group's first call. */
  const shapeOf = new Map<string, string>()

  on('ui.render', { component: 'ToolGroup' }, ($, e, next) => {
    if (!e.props.isExpanded) return next(e)

    const runs = runsOf(e.props.calls)
    const shape = JSON.stringify(runs.map((run) => run.calls.map(stateOf)))
    const key = e.props.calls[0]?.tool_use_id ?? e.requestId
    if (shapeOf.get(key) !== shape) {
      shapeOf.set(key, shape)
      for (const call of e.props.calls) if (call.tool_use_id) runOf.delete(call.tool_use_id)
      for (const run of runs) for (const call of run.calls) runOf.set(call.tool_use_id!, run)
      $.ui.invalidate('ui.render')
    }

    return next(e)
  })

  on('ui.render', { component: 'ToolUse', props: { tool: 'Read' } }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const run = runOf.get(e.props.tool_use_id)
    if (run && run.calls[0]?.tool_use_id !== e.props.tool_use_id) return <Box display="none" />

    const calls: readonly ReadCall[] = run?.calls ?? [e.props]
    const isDone = calls.every((call) => !call.isRunning)
    const isErrored = calls.some((call) => call.isErrored || call.isInterrupted)

    const bullet = (
      <Text color={isErrored ? 'red' : isDone ? 'green' : undefined} dimColor={!isDone}>
        {'● '}
      </Text>
    )
    const lines = calls.map((call) => (
      <Text>
        {run ? <Text dimColor>{'  ⎿  '}</Text> : [bullet, <Text bold>{'Read '}</Text>]}
        <Text>{pathOf(call)}</Text>
        <Text dimColor>{` · ${rangeOf(call)}`}</Text>
      </Text>
    ))
    const header = (
      <Text>
        {bullet}
        <Text bold>Read</Text>
        <Text>{` ${calls.length} files`}</Text>
      </Text>
    )

    return (
      <Box flexDirection="column" marginTop={1}>
        {run ? [header, ...lines] : lines}
      </Box>
    )
  })
}

/** What the block draws of a Read call: a group's call and a row's props both carry it. */
type ReadCall = Pick<ToolGroupCall, 'input' | 'output' | 'isRunning' | 'isErrored' | 'isInterrupted'>

/**
 * The runs of two or more consecutive Read calls in a group's calls; a call
 * of another tool, or one with no `tool_use_id`, ends a run.
 */
function runsOf(calls: readonly ToolGroupCall[]): Run[] {
  const runs: Run[] = []
  let current: ToolGroupCall[] = []
  const close = () => {
    if (current.length > 1) runs.push({ calls: current })
    current = []
  }
  for (const call of calls) {
    if (call.tool === 'Read' && call.tool_use_id) current.push(call)
    else close()
  }
  close()
  return runs
}

/** What of a call the block draws, so a group redraw that changes none of it asks nothing. */
function stateOf(call: ToolGroupCall) {
  return [call.tool_use_id, pathOf(call), rangeOf(call)]
}

/** The file a Read call names, as the model gave it. */
function pathOf(call: ReadCall): string {
  const input = (call.input ?? {}) as { file_path?: unknown }
  return typeof input.file_path === 'string' ? input.file_path : '…'
}

/**
 * What a Read call read: `lines 1-64`, `lines 1-10 of 14424` for part of a
 * file, the kind for a file that is not text; its state while unresolved.
 */
function rangeOf(call: ReadCall): string {
  if (call.isInterrupted) return 'interrupted'
  if (call.isErrored) return 'error'
  if (call.isRunning || call.output === undefined) return 'reading…'

  const output = call.output as BuiltinToolResults['Read']
  if (output.type !== 'text') {
    const input = call.input as { pages?: unknown }
    return typeof input.pages === 'string' ? `${output.type}, pages ${input.pages}` : output.type
  }

  const { startLine, numLines, totalLines } = output.file
  if (numLines === 0) return `no lines of ${totalLines}`
  const range = `lines ${startLine}-${startLine + numLines - 1}`
  const isWhole = startLine === 1 && numLines >= totalLines
  return isWhole ? range : `${range} of ${totalLines}`
}
