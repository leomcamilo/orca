import { defineFixture } from '../../../component-fixtures/component-fixture'
import { getDefaultVoiceSettings } from '../../../../../shared/constants'
import { VoiceSpokenRepliesSettings } from './VoiceSpokenRepliesSettings'

// Stands in for the system's voices, which a headless browser does not have.
function installVoices(names: readonly [string, string][]): void {
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices: () =>
        names.map(([name, lang]) => ({
          voiceURI: `fixture:${name}`,
          name,
          lang,
          localService: true,
          default: false
        })),
      addEventListener: () => {},
      removeEventListener: () => {},
      speak: () => {},
      cancel: () => {}
    }
  })
}

function render(spokenReplies: boolean, spokenReplyVoice?: string): () => React.JSX.Element {
  return () => (
    // The settings page's own shell sets its row density.
    <div className="settings-view-shell p-4">
      <div>
        <VoiceSpokenRepliesSettings
          voiceSettings={{
            ...getDefaultVoiceSettings(),
            spokenReplies,
            ...(spokenReplyVoice ? { spokenReplyVoice } : {})
          }}
          onUpdateVoiceSettings={() => {}}
        />
      </div>
    </div>
  )
}

const withVoices = (): void =>
  installVoices([
    ['Luciana', 'pt-BR'],
    ['Samantha', 'en-US']
  ])

export const off = defineFixture({ width: 720, setup: withVoices, render: render(false) })

export const chosenVoice = defineFixture({
  width: 720,
  setup: withVoices,
  render: render(true, 'fixture:Luciana')
})

export const noSystemVoice = defineFixture({
  width: 720,
  setup: () => installVoices([]),
  render: render(false)
})

export const narrow = defineFixture({ width: 360, setup: withVoices, render: render(true) })
