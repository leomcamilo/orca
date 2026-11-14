import { ENGLISH_RESPELLINGS, LETTERS, UNIT_WORDS } from './spoken-portuguese-words'

const UNITS = [
  'zero',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez',
  'onze',
  'doze',
  'treze',
  'catorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove'
]
const TENS = [
  '',
  '',
  'vinte',
  'trinta',
  'quarenta',
  'cinquenta',
  'sessenta',
  'setenta',
  'oitenta',
  'noventa'
]
const HUNDREDS = [
  '',
  'cento',
  'duzentos',
  'trezentos',
  'quatrocentos',
  'quinhentos',
  'seiscentos',
  'setecentos',
  'oitocentos',
  'novecentos'
]
const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro'
]
const SCALES: [number, string, string][] = [
  [1_000_000_000, 'bilhão', 'bilhões'],
  [1_000_000, 'milhão', 'milhões'],
  [1000, 'mil', 'mil']
]

function belowThousand(n: number): string {
  if (n < 20) {
    return UNITS[n]
  }
  if (n < 100) {
    const unit = n % 10
    return unit === 0 ? TENS[n / 10] : `${TENS[Math.floor(n / 10)]} e ${UNITS[unit]}`
  }
  if (n === 100) {
    return 'cem'
  }
  const rest = n % 100
  const hundred = HUNDREDS[Math.floor(n / 100)]
  return rest === 0 ? hundred : `${hundred} e ${belowThousand(rest)}`
}

/** A whole number in Brazilian Portuguese words, as it is said aloud. */
export function numberInWords(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    return String(value)
  }
  if (value < 1000) {
    return belowThousand(value)
  }
  const groups: { count: number; words: string }[] = []
  let rest = value
  for (const [size, one, many] of SCALES) {
    const count = Math.floor(rest / size)
    if (count > 0) {
      groups.push({
        count,
        words:
          size === 1000 && count === 1 ? one : `${numberInWords(count)} ${count === 1 ? one : many}`
      })
      rest %= size
    }
  }
  if (rest > 0) {
    groups.push({ count: rest, words: belowThousand(rest) })
  }
  // The last group joins with "e" when it is under a hundred or round hundreds: "mil e dez",
  // "um milhão e quinhentos mil", but "mil duzentos e dez".
  const last = groups.at(-1)
  const joins =
    last !== undefined && groups.length > 1 && (last.count < 100 || last.count % 100 === 0)
  return groups
    .map((group, index) =>
      joins && index === groups.length - 1 ? `e ${group.words}` : group.words
    )
    .join(' ')
}

const ORDINALS = [
  '',
  'primeir',
  'segund',
  'terceir',
  'quart',
  'quint',
  'sext',
  'sétim',
  'oitav',
  'non',
  'décim'
]

/** Digits after a decimal comma are read as a number, keeping leading zeros: 0,015 is
 *  "zero vírgula zero quinze". */
function decimalInWords(whole: string, fraction: string): string {
  const zeros = /^0*/.exec(fraction)?.[0].length ?? 0
  const rest = fraction.slice(zeros)
  const fractionWords = [
    ...Array.from({ length: zeros }, () => 'zero'),
    ...(rest ? [numberInWords(Number(rest))] : [])
  ].join(' ')
  return `${numberInWords(Number(whole))} vírgula ${fractionWords}`
}

function amountInWords(text: string): string {
  const [whole, fraction] = text.replace(/\./g, '').split(',')
  return fraction ? decimalInWords(whole, fraction) : numberInWords(Number(whole))
}

// Said as words, not letter by letter.
const WORD_ACRONYMS = new Set([
  'OK',
  'ONU',
  'NASA',
  'UFRJ',
  'UFF',
  'UERJ',
  'USP',
  'COPPEAD',
  'FIFA'
])

function spelled(acronym: string): string {
  return acronym
    .split('')
    .map((letter) => LETTERS[letter] ?? letter)
    .join(' ')
}

export type SpokenPortugueseOptions = {
  /** Respell common English terms for a voice that reads them with Portuguese rules. */
  respellEnglish: boolean
}

/** A Portuguese line as a voice should say it: times, dates, numbers, money, percentages,
 *  units and acronyms in words. */
export function spokenPortuguese(text: string, options: SpokenPortugueseOptions): string {
  let spoken = text
    // 13/11/2026, 06/01/2027, 13/11
    .replace(
      /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g,
      (match, day: string, month: string, year?: string) => {
        const monthName = MONTHS[Number(month) - 1]
        if (!monthName || Number(day) < 1 || Number(day) > 31) {
          return match
        }
        const dayWords = Number(day) === 1 ? 'primeiro' : numberInWords(Number(day))
        return `${dayWords} de ${monthName}${year ? ` de ${numberInWords(Number(year))}` : ''}`
      }
    )
    // 1º, 2ª
    .replace(/\b(\d{1,2})([ºª])/g, (match, count: string, gender: string) => {
      const stem = ORDINALS[Number(count)]
      return stem ? `${stem}${gender === 'ª' ? 'a' : 'o'}` : match
    })
    // 2026-11-14
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (match, year: string, month: string, day: string) => {
      const monthName = MONTHS[Number(month) - 1]
      return monthName
        ? `${numberInWords(Number(day))} de ${monthName} de ${numberInWords(Number(year))}`
        : match
    })
    // 07:46, 07:46:48, 20h, 20h30
    .replace(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/g, (match, hour: string, minute: string) =>
      Number(hour) > 23 || Number(minute) > 59
        ? match
        : Number(minute) === 0
          ? `${numberInWords(Number(hour))} horas`
          : `${numberInWords(Number(hour))} e ${numberInWords(Number(minute))}`
    )
    .replace(/\b(\d{1,2})h(\d{2})?\b/g, (match, hour: string, minute?: string) =>
      Number(hour) > 23
        ? match
        : `${numberInWords(Number(hour))} horas${minute && Number(minute) > 0 ? ` e ${numberInWords(Number(minute))}` : ''}`
    )
    // 1.4.258-leo.6: a version, read part by part.
    .replace(
      /\b(\d+(?:\.\d+){2,})(-[A-Za-z]+(?:\.\d+)?)?/g,
      (_match, version: string, suffix?: string) =>
        `${version.split('.').join(' ponto ')}${suffix ? ` ${suffix.slice(1).replace('.', ' ponto ')}` : ''}`
    )
    // US$ 0,015, R$ 10, € 3
    .replace(/(US\$|R\$|€)\s?(\d[\d.]*(?:,\d+)?)/g, (_match, currency: string, amount: string) => {
      const plural = amount.replace(/\./g, '') !== '1'
      const name =
        currency === 'R$'
          ? plural
            ? 'reais'
            : 'real'
          : currency === '€'
            ? plural
              ? 'euros'
              : 'euro'
            : plural
              ? 'dólares'
              : 'dólar'
      return `${amountInWords(amount)} ${name}`
    })
    // 31,1%, 8%
    .replace(
      /(\d[\d.]*(?:,\d+)?)\s?%/g,
      (_match, amount: string) => `${amountInWords(amount)} por cento`
    )
    // 740 MB, 30 s, 1,4 s
    .replace(
      /\b(\d[\d.]*(?:,\d+)?)\s?(KB|MB|GB|TB|ms|min|km|kg|s|h)\b/g,
      (_match, amount: string, unit: string) => {
        const [one, many] = UNIT_WORDS[unit]
        return `${amountInWords(amount)} ${amount === '1' ? one : many}`
      }
    )
    // 1.500, 0,6, 42
    .replace(/\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b|\b\d+(?:,\d+)?\b/g, (amount) =>
      amountInWords(amount)
    )
    .replace(/\b[A-Z]{2,5}s?\b/g, (word) => {
      const acronym = word.endsWith('s') ? word.slice(0, -1) : word
      if (WORD_ACRONYMS.has(acronym)) {
        return word.toLowerCase()
      }
      return spelled(acronym) + (word.endsWith('s') ? 's' : '')
    })
  if (options.respellEnglish) {
    spoken = spoken.replace(/\b[A-Za-z]+\b/g, (word) => {
      const respelled = ENGLISH_RESPELLINGS[word.toLowerCase()]
      return respelled ?? word
    })
  }
  return spoken.replace(/\s+/g, ' ').trim()
}
