// Orca Leo, Leo's personal build of Orca: the official config, ad-hoc signed, arm64 only, never
// published. It installs in place of the official app on the official profile, so everything
// macOS and the profile key on stays Orca's (bundle id, CFBundleName, executable, helpers, orca://).
// Only the name people see changes.
const { existsSync, readdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const base = require('../electron-builder.config.cjs')

const DISPLAY_NAME = 'Orca Leo'

const version = process.env.ORCA_LEO_VERSION
if (!version || !/^\d+\.\d+\.\d+-leo\.\d+$/.test(version)) {
  throw new Error(`ORCA_LEO_VERSION must look like 1.4.258-leo.2, got: ${version}`)
}

// Electron finds its helpers by the unlocalized CFBundleName; macOS shows the localized one.
function writeLocalizedBundleName(resourcesDir) {
  const localizations = existsSync(resourcesDir)
    ? readdirSync(resourcesDir).filter((entry) => entry.endsWith('.lproj'))
    : []
  if (localizations.length === 0) {
    throw new Error(`No .lproj folder to carry the ${DISPLAY_NAME} name in ${resourcesDir}`)
  }
  for (const localization of localizations) {
    writeFileSync(
      join(resourcesDir, localization, 'InfoPlist.strings'),
      `CFBundleName = "${DISPLAY_NAME}";\nCFBundleDisplayName = "${DISPLAY_NAME}";\n`
    )
  }
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  ...base,
  publish: null,
  extraMetadata: { ...base.extraMetadata, version },
  // Before the base hook, so what it verifies and signs is the bundle that ships.
  afterPack: async (context) => {
    if (context.electronPlatformName === 'darwin') {
      writeLocalizedBundleName(
        join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources'
        )
      )
    }
    await base.afterPack(context)
  },
  mac: {
    ...base.mac,
    identity: '-',
    target: [{ target: 'zip', arch: ['arm64'] }],
    extendInfo: { ...base.mac.extendInfo, CFBundleDisplayName: DISPLAY_NAME }
  }
}
