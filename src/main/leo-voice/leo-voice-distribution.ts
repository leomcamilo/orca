// Leo's personal Voice mode build only (branch feat/leo-voice-distribution); never part of an
// upstream PR. Keeps this copy apart from the official Orca installed on the same Mac.
export const LEO_VOICE_DISTRIBUTION = {
  /** Under appData. Electron would otherwise derive it from productName "Orca": the official profile. */
  userDataDirName: 'orca-voice',
  /** Set before ready, which fixes the safeStorage Keychain service apart from the official one. */
  appName: 'Orca Voice',
  /** Default WebSocket port, outside the official 6768 and its 6770–6799 fallbacks; dev and E2E keep theirs. */
  wsPort: 6801,
  /** Updates come only from a new reviewed build; the official feed would offer an unsignable swap. */
  updatesOff: true
} as const
