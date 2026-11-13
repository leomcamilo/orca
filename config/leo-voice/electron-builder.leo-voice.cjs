// Leo's personal Voice mode build: the official config and identity, ad-hoc signed, arm64 zip only,
// never published. It replaces /Applications/Orca.app and keeps the official profile.
const base = require('../electron-builder.config.cjs')

const version = process.env.LEO_VOICE_VERSION
if (!version || !/^\d+\.\d+\.\d+-voice\.[0-9A-Za-z.-]+$/.test(version)) {
  throw new Error(`LEO_VOICE_VERSION must look like 1.4.258-voice.inplace.1, got: ${version}`)
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  ...base,
  publish: null,
  extraMetadata: { ...base.extraMetadata, version },
  mac: {
    ...base.mac,
    identity: '-',
    target: [{ target: 'zip', arch: ['arm64'] }]
  }
}
