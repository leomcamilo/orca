// Orca Leo, Leo's personal build of Orca: the official config, ad-hoc signed, arm64 only, never
// published. It installs in place of the official app on the official profile, so everything
// macOS and the profile key on stays Orca's (bundle id, CFBundleName, executable, helpers, orca://).
// Only the name people see changes.
const { execFileSync } = require('node:child_process')
const { existsSync, readdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const base = require('../electron-builder.config.cjs')
const {
  MACOS_FOLDER_USAGE_DESCRIPTIONS
} = require('../scripts/desktop-distribution/macos/macos-folder-usage-descriptions.cjs')

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

// A permission prompt quotes these under the app's name.
function withDisplayName(usageDescriptions) {
  return Object.fromEntries(
    Object.entries(usageDescriptions).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.replace(/^Orca\b/, DISPLAY_NAME) : value
    ])
  )
}

// The base hook writes the folder prompts into each helper with Orca's wording.
function nameHelperFolderPrompts(appPath) {
  const frameworks = join(appPath, 'Contents', 'Frameworks')
  const prompts = Object.entries(withDisplayName(MACOS_FOLDER_USAGE_DESCRIPTIONS))
  for (const entry of readdirSync(frameworks)) {
    if (!/ Helper.*\.app$/.test(entry)) {
      continue
    }
    const plist = join(frameworks, entry, 'Contents', 'Info.plist')
    for (const [key, value] of prompts) {
      execFileSync('/usr/bin/plutil', ['-replace', key, '-string', value, plist])
    }
  }
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  ...base,
  publish: null,
  extraMetadata: { ...base.extraMetadata, version },
  // Both run before electron-builder signs, so the names are inside the signature.
  afterPack: async (context) => {
    const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
    if (context.electronPlatformName === 'darwin') {
      writeLocalizedBundleName(join(appPath, 'Contents', 'Resources'))
    }
    await base.afterPack(context)
    if (context.electronPlatformName === 'darwin') {
      nameHelperFolderPrompts(appPath)
    }
  },
  mac: {
    ...base.mac,
    identity: '-',
    target: [{ target: 'zip', arch: ['arm64'] }],
    extendInfo: { ...withDisplayName(base.mac.extendInfo), CFBundleDisplayName: DISPLAY_NAME }
  }
}
