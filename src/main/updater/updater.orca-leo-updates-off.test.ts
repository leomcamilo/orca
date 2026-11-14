import type { getReleaseDownloadUrl } from './releases/updater-release-readiness'
import { beforeEach, expect, it, vi } from 'vitest'
import { loadUpdaterModule, warmUpdaterModule } from './testing/updater-test-module-loader'
import { updaterMainWindow } from './testing/updater-test-main-window'
import { getVersionChannel } from '../../shared/release-channel'

const { appMock, autoUpdaterMock, fetchNewerReleaseTagsMock, moduleFactories, resetUpdaterMocks } =
  await vi.hoisted(async () =>
    (await import('./testing/updater-test-harness')).createUpdaterMocks()
  )

vi.mock('electron', () => moduleFactories.electron())
vi.mock('electron-updater', () => moduleFactories.electronUpdater())
vi.mock('./electron-updater-loader', () => moduleFactories.electronUpdaterLoader())
vi.mock('../ipc/pty/kill-all', () => moduleFactories.ptyKillAll())
vi.mock('./linux-package/linux-update-package-type', () => moduleFactories.linuxUpdatePackageType())
vi.mock('./updater-lifecycle-diagnostics', () => moduleFactories.updaterLifecycleDiagnostics())
vi.mock('./releases/updater-changelog', () => moduleFactories.updaterChangelog())
vi.mock('./nudges/nudge-campaign', () => moduleFactories.updaterNudge())
vi.mock('./update-install-exit-watchdog', () => moduleFactories.updateInstallExitWatchdog())
vi.mock('./releases/updater-prerelease-feed', () => moduleFactories.updaterPrereleaseFeed())
vi.mock('./releases/updater-release-readiness', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getReleaseDownloadUrl: (
    await vi.importMock<{
      getReleaseDownloadUrl: typeof getReleaseDownloadUrl
    }>('./releases/updater-prerelease-feed')
  ).getReleaseDownloadUrl
}))
vi.mock('../local-builds/local-build-switch', () => moduleFactories.localBuildSwitch())
vi.mock('../local-builds/local-build-feed-server', () => moduleFactories.localBuildFeedServer())

warmUpdaterModule()

beforeEach(() => {
  resetUpdaterMocks()
  vi.useFakeTimers()
})

it('never asks the official feed when packaged as Orca Leo', async () => {
  appMock.getVersion.mockReturnValue('1.4.258-leo.4')
  const updater = await loadUpdaterModule()
  updater.setupAutoUpdater(updaterMainWindow(vi.fn()), { getLastUpdateCheckAt: () => 0 })
  updater.checkForUpdates()
  updater.checkForUpdatesFromMenu()
  await vi.advanceTimersByTimeAsync(24 * 60 * 60_000)
  expect(fetchNewerReleaseTagsMock).not.toHaveBeenCalled()
  expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
})

it('installs and downloads nothing when asked to, packaged as Orca Leo', async () => {
  appMock.getVersion.mockReturnValue('1.4.258-leo.4')
  const updater = await loadUpdaterModule()
  updater.setupAutoUpdater(updaterMainWindow(vi.fn()), { getLastUpdateCheckAt: () => 0 })
  updater.downloadUpdate()
  updater.quitAndInstall()
  await vi.advanceTimersByTimeAsync(60_000)
  expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled()
  expect(autoUpdaterMock.quitAndInstall).not.toHaveBeenCalled()
  expect(updater.getUpdateStatus().state).toBe('idle')
})

it('files an Orca Leo version under the stable channel, not a prerelease one', () => {
  expect(getVersionChannel('1.4.258-leo.4')).toBe('stable')
  expect(getVersionChannel('1.4.258-rc.1')).toBe('rc')
})
