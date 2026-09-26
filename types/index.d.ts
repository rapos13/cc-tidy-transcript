/**
 * Whether a compact row continues a stretch: the call before it in its group
 * is compact too, so the row draws no blank line above it.
 */
export type ContinuesStretch = boolean

declare module 'claude-code' {
  interface PluginState {
    'tidy-transcript': {
      /** One member per compact row, by `tool_use_id`. */
      continuesStretch: StateFamily<ContinuesStretch>
    }
  }
}
