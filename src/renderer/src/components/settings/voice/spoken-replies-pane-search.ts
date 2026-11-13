import type { SettingsSearchEntry } from '../search/settings-search'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from '../search/settings-search-keywords'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getSpokenRepliesSearchEntry = createLocalizedCatalog((): SettingsSearchEntry => ({
  title: translate(
    'components.settings.voice.spokenReplies.title',
    'Spoken replies (experimental)'
  ),
  description: translate(
    'auto.components.settings.voice.pane.search.spokenRepliesDescription',
    'Hear replies read aloud with a system voice.'
  ),
  keywords: [
    ...translateSearchKeyword('auto.components.settings.voice.pane.search.7640ed9848', 'voice'),
    ...translateSearchKeyword(
      'auto.components.settings.voice.pane.search.spokenRepliesSpeakKeyword',
      'speak'
    ),
    ...translateSearchKeyword(
      'auto.components.settings.voice.pane.search.spokenRepliesReadAloudKeyword',
      'read aloud'
    )
  ]
}))
