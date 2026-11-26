import { Pressable, Text } from 'react-native'
import { AudioLines } from 'lucide-react-native'
import { colors, radii, spacing, typography, pressedStyle } from '../../../theme/mobile-theme'
import { themedStyleSheet } from '../../../theme/themed-styles'
import { useMobileTranslation } from '../../../i18n/use-mobile-translation'
import type { MobileCodexVoice } from './mobile-codex-voice-view'

/** Starts Voice mode in a Codex chat; typing and dictation stay available below it. */
export function MobileNativeChatVoiceButton({
  voice,
  disabled
}: {
  voice: MobileCodexVoice
  disabled: boolean
}): React.JSX.Element {
  const t = useMobileTranslation()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('chat.voice.action.start', 'Talk with Codex')}
      style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && pressedStyle]}
      onPress={voice.start}
      disabled={disabled}
      testID="native-chat-voice-button"
    >
      <AudioLines size={16} strokeWidth={2} color={colors.textPrimary} />
      <Text style={styles.label}>{t('chat.voice.action.start', 'Talk with Codex')}</Text>
    </Pressable>
  )
}

const styles = themedStyleSheet(() => ({
  button: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 36,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.composerBorder,
    backgroundColor: colors.composerSurface
  },
  disabled: { opacity: 0.4 },
  label: { color: colors.textPrimary, fontSize: typography.metaSize, fontWeight: '600' }
}))
