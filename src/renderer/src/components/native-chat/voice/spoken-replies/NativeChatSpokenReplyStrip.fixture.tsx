import { defineFixture } from '../../../../component-fixtures/component-fixture'
import { NativeChatSpokenReplyButton } from './NativeChatSpokenReplyButton'
import { NativeChatSpokenReplyStrip } from './NativeChatSpokenReplyStrip'
import type { NativeChatSpokenReplies } from './use-native-chat-spoken-replies'

// Synthetic reply only; no recorded or real conversation.
const LINE = 'The login fix is in and the tests pass, but the migration still needs your approval.'

function control(on: boolean): NativeChatSpokenReplies {
  return {
    on,
    sessionId: 'fixture',
    line: on ? LINE : null,
    agentLabel: 'Claude',
    toggle: () => {},
    silence: () => {}
  }
}

function composer(on: boolean): () => React.JSX.Element {
  return () => (
    <div className="native-chat-appearance p-4 pt-6">
      {on ? (
        <NativeChatSpokenReplyStrip line={LINE} agentLabel="Claude" onSilence={() => {}} />
      ) : null}
      <div className="mx-3 flex items-center justify-between rounded-md border border-border p-3 text-sm text-muted-foreground sm:mx-4">
        Composer
        <NativeChatSpokenReplyButton spoken={control(on)} />
      </div>
    </div>
  )
}

export const speaking = defineFixture({ width: 720, render: composer(true) })

export const off = defineFixture({ width: 720, render: composer(false) })

export const narrow = defineFixture({ width: 360, render: composer(true) })
