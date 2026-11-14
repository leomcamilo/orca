// Orca Leo, Leo's personal build of Orca; never part of an upstream PR. It runs in place of the
// official app, so the app name the profile and keychain key on stays Orca's.
export const ORCA_LEO_DISTRIBUTION = {
  /** Shown to the person only; `app.setName` with it would move the profile and the keychain item. */
  displayName: 'Orca Leo',
  /** Updates come only from a new reviewed build; the official feed would replace this one. */
  updatesOff: true
} as const
