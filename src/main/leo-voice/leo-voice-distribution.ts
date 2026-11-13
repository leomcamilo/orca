// Leo's personal Voice mode build only (branch feat/leo-voice-inplace); never part of an upstream
// PR. It replaces the official Orca in place, on the official profile, identity and port.
export const LEO_VOICE_DISTRIBUTION = {
  /** Updates come only from a new reviewed build; the official feed would replace Voice mode. */
  updatesOff: true
} as const
