// Orca Leo, Leo's personal build of Orca; never part of an upstream PR. It runs in place of the
// official app, so the app name the profile and keychain key on stays Orca's.
export const ORCA_LEO_DISTRIBUTION = {
  /** Shown to the person only; `app.setName` with it would move the profile and the keychain item. */
  displayName: 'Orca Leo'
} as const

// The build config stamps every Orca Leo package with a version of this shape.
const ORCA_LEO_VERSION = /^\d+\.\d+\.\d+-leo\.\d+$/

/** Whether the running app was packaged as Orca Leo. Its updates come only from a new reviewed
 *  build: the official feed would replace it with a build that has no Voice mode. */
export function isOrcaLeoVersion(appVersion: string): boolean {
  return ORCA_LEO_VERSION.test(appVersion)
}

/** A label that is the app's own name, with this build's name in it. Upstream's translated label
 *  comes in, so its catalog entry stays in use. */
export function withOrcaLeoName(label: string): string {
  return label.replace('Orca', ORCA_LEO_DISTRIBUTION.displayName)
}
