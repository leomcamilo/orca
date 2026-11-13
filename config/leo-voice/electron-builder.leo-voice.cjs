// Leo's personal Voice mode build: the official config with its own identity, ad-hoc signed,
// arm64 zip only, never published. Branch feat/leo-voice-distribution only.
const base = require('../electron-builder.config.cjs')

const version = process.env.LEO_VOICE_VERSION
if (!version || !/^\d+\.\d+\.\d+-voice\.[0-9A-Za-z.-]+$/.test(version)) {
  throw new Error(`LEO_VOICE_VERSION must look like 1.4.258-voice.main.1, got: ${version}`)
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  ...base,
  appId: 'io.github.leomcamilo.orca-voice',
  // The official app keeps orca:// links.
  protocols: [],
  publish: null,
  extraMetadata: { ...base.extraMetadata, version },
  mac: {
    ...base.mac,
    identity: '-',
    // productName stays "Orca": MacOS/Orca is a fixed path for the CLI shim and browser provider.
    extendInfo: {
      ...base.mac.extendInfo,
      CFBundleName: 'Orca Voice',
      CFBundleDisplayName: 'Orca Voice'
    },
    target: [{ target: 'zip', arch: ['arm64'] }]
  }
}
