// Orca Leo, Leo's personal build of Orca; never part of an upstream PR. It runs in place of the
// official app, so the app name the profile and keychain key on stays Orca's.
export const ORCA_LEO_DISTRIBUTION = {
  /** Shown to the person only; `app.setName` with it would move the profile and the keychain item. */
  displayName: 'Orca Leo',
  /** Updates come only from a new reviewed build; the official feed would replace this one. */
  updatesOff: true
} as const

/** A label that is the app's own name, with this build's name in it. Upstream's translated label
 *  comes in, so its catalog entry stays in use. */
export function withOrcaLeoName(label: string): string {
  return label.replace('Orca', ORCA_LEO_DISTRIBUTION.displayName)
}
