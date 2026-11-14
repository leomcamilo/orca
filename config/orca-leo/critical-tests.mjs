// The unit tests every Orca Leo build runs in full, whatever it changed: where a mistake loses data
// or breaks the installation rather than a screen. Leo chose this on 2026-11-14 (option B'): these
// run beside the 700 tests nearest the change, and outside that budget.
export const CRITICAL_TEST_PATTERNS = [
  // The protocol between versions.
  /^tests\/e2e\/cross-version-wire\/.*\.test\.ts$/,
  // The updater, which must never take an official build.
  /^src\/main\/updater\/.*\.test\.ts$/,
  // Profile and session persistence and migration.
  /(?:^|\/)(?:persistence\/|profile-startup\/).*\.test\.[cm]?[jt]sx?$/,
  /(?:migrat|agent-session-journal|user-data-path)[^/]*\.test\.[cm]?[jt]sx?$/,
  /(?:migrat|agent-session-journal)[^/]*\/.*\.test\.[cm]?[jt]sx?$/
]

export function isCriticalTest(file) {
  return CRITICAL_TEST_PATTERNS.some((pattern) => pattern.test(file))
}
