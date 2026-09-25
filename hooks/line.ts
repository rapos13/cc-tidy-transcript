import type { RenderPropsOf } from 'claude-code'

/** What a compact line draws of a call: a row's props carry it. */
export type Call = Pick<RenderPropsOf['ToolUse'], 'tool' | 'input' | 'output' | 'isErrored' | 'isInterrupted'>

/** A call's compact line after its bullet: the name drawn bold, the subject, the dim detail after `·`. */
export type Line = [name: string, subject: string, detail: string]

/**
 * A call's state while it has no result to describe, or undefined once it
 * has one. Only `output` says a call finished: `isRunning` is also false
 * while the model still streams the call's input.
 */
export function pendingOf(call: Call, running: string): string | undefined {
  if (call.isInterrupted) return 'interrupted'
  if (call.isErrored) return 'error'
  if (call.output === undefined) return running
  return undefined
}
