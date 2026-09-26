import type { RenderPropsOf } from 'claude-code'

import { shownPath } from './paths'

/** What a compact line draws of a call: a row's props carry it. */
export type Call = Pick<RenderPropsOf['ToolUse'], 'tool' | 'input' | 'output' | 'isErrored' | 'isInterrupted'>

/**
 * One argument inside a call's parentheses: `label: text`, or `text` alone.
 * `isOutside` marks a path outside the project root; only `text` shows it.
 */
export type Part = { label?: string; text: string; isOutside?: boolean }

/**
 * A call's compact drawing: `name(args)` on the call line, and the result on
 * a `⎿` line below it once there is one.
 */
export type Line = { name: string; args: Part[]; result?: string }

/**
 * A call's result sentence when it did not finish (`Interrupted`, `Error`),
 * null while it runs, or undefined once it has an output to describe. Only
 * `output` says a call finished: `isRunning` is also false while the model
 * still streams the call's input.
 */
export function unfinishedOf(call: Call): string | null | undefined {
  if (call.isInterrupted) return 'Interrupted'
  if (call.isErrored) return 'Error'
  if (call.output === undefined) return null
  return undefined
}

/** A path argument, shown relative to the root; `…` while the model still streams it. */
export function pathPart(path: unknown, root: string | undefined, label?: string): Part {
  if (typeof path !== 'string') return { label, text: '…' }
  return { label, ...shownPath(path, root) }
}

/** `1 file`, `3 files`. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
