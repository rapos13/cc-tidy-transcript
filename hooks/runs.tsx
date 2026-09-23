import type { On, ToolGroupCall } from 'claude-code'

/** What a block draws of a call: a group's call and a row's props both carry it. */
export type RunCall = Pick<ToolGroupCall, 'tool' | 'input' | 'output' | 'isRunning' | 'isErrored' | 'isInterrupted'>

/** One kind of call that collapses into runs, and how its block draws. */
export type RunKind = {
  /** The tools whose consecutive calls form one run. */
  tools: readonly string[]
  /** The header of a run of `count` calls, after its bullet: `['Read', '3 files']`. */
  header: (count: number) => [title: string, rest: string]
  /** A call's line: its tool name drawn bold on a lone call, the subject, and the dim detail after `·`. */
  line: (call: RunCall) => [tool: string, subject: string, detail: string]
}

/** A run of two or more calls of one kind, one after another in a tool group. */
type Run = {
  /** The run's calls in the order the model made them; the first draws the run. */
  calls: ToolGroupCall[]
}

/**
 * Collapses each run of consecutive calls of one kind in an expanded tool
 * group (verbose output, ctrl+o) into one block, set off by an empty line
 * above as the engine sets off a row: the kind's header, then one `⎿` line
 * per call. A call on its own draws its line alone, the bullet and the tool's
 * name in place of the `⎿`. Calls of other tools draw as the engine draws them.
 *
 * The engine draws a group's rows itself and hands a hook only an opaque
 * drawing, so the collapse happens row by row: the group hook finds the runs,
 * the run's first row draws the block and the others draw nothing. Runs are
 * keyed by `tool_use_id`, which, unlike the group's own id, holds still while
 * the group streams; a row drawn before its group learns its run on the
 * redraw the group hook asks for.
 *
 * @param on the engine's registrar
 * @param kind the calls that collapse and how their block draws
 */
export function registerRuns(on: On, kind: RunKind) {
  /** Each call in a run, by `tool_use_id`, to its run. */
  const runOf = new Map<string, Run>()
  /** The runs each group had when last drawn, by the group's first call. */
  const shapeOf = new Map<string, string>()
  const isOfKind = (call: ToolGroupCall) => kind.tools.includes(call.tool) && !!call.tool_use_id

  on('ui.render', { component: 'ToolGroup' }, ($, e, next) => {
    if (!e.props.isExpanded) return next(e)

    const runs = runsOf(e.props.calls, isOfKind)
    const shape = JSON.stringify(runs.map((run) => run.calls.map((call) => [call.tool_use_id, kind.line(call)])))
    const key = e.props.calls[0]?.tool_use_id ?? e.requestId
    if (shapeOf.get(key) !== shape) {
      shapeOf.set(key, shape)
      for (const call of e.props.calls) if (call.tool_use_id) runOf.delete(call.tool_use_id)
      for (const run of runs) for (const call of run.calls) runOf.set(call.tool_use_id!, run)
      $.ui.invalidate('ui.render')
    }

    return next(e)
  })

  on('ui.render', { component: 'ToolUse' }, ($, e, next) => {
    if (!kind.tools.includes(e.props.tool)) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const run = runOf.get(e.props.tool_use_id)
    if (run && run.calls[0]?.tool_use_id !== e.props.tool_use_id) return <Box display="none" />

    const calls: readonly RunCall[] = run?.calls ?? [e.props]
    const isDone = calls.every((call) => !call.isRunning)
    const isErrored = calls.some((call) => call.isErrored || call.isInterrupted)

    const bullet = (
      <Text color={isErrored ? 'red' : isDone ? 'green' : undefined} dimColor={!isDone}>
        {'● '}
      </Text>
    )
    const lines = calls.map((call) => {
      const [name, subject, detail] = kind.line(call)
      return (
        <Text>
          {run ? <Text dimColor>{'  ⎿  '}</Text> : [bullet, <Text bold>{`${name} `}</Text>]}
          <Text>{subject}</Text>
          <Text dimColor>{` · ${detail}`}</Text>
        </Text>
      )
    })
    const [title, rest] = kind.header(calls.length)
    const header = (
      <Text>
        {bullet}
        <Text bold>{title}</Text>
        <Text>{` ${rest}`}</Text>
      </Text>
    )

    return (
      <Box flexDirection="column" marginTop={1}>
        {run ? [header, ...lines] : lines}
      </Box>
    )
  })
}

/**
 * The runs of two or more consecutive calls of a kind in a group's calls; a
 * call of another tool, or one with no `tool_use_id`, ends a run.
 */
function runsOf(calls: readonly ToolGroupCall[], isOfKind: (call: ToolGroupCall) => boolean): Run[] {
  const runs: Run[] = []
  let current: ToolGroupCall[] = []
  const close = () => {
    if (current.length > 1) runs.push({ calls: current })
    current = []
  }
  for (const call of calls) {
    if (isOfKind(call)) current.push(call)
    else close()
  }
  close()
  return runs
}

/** A call's state while it has no result to describe, or undefined once it has one. */
export function pendingOf(call: RunCall, running: string): string | undefined {
  if (call.isInterrupted) return 'interrupted'
  if (call.isErrored) return 'error'
  if (call.isRunning || call.output === undefined) return running
  return undefined
}
