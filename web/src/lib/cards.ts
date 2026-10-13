import type { City } from './types'

/** Crypto / neobank cards — researched from each issuer's own official pages (see `sources`, `checkedAt`). */
export type Avail = 'available' | 'not_available' | 'waitlist' | 'unknown'
/** US = New York State (our NYC data), USCA = California (San Francisco): card availability differs by state. */
export type CountryCode = 'GB' | 'US' | 'USCA' | 'RS'
export type CryptoCard = {
  id: string
  name: string
  issuer: string
  network: 'Visa' | 'Mastercard' | string
  type: 'debit' | 'prepaid' | 'credit' | string
  custody: 'self' | 'custodial' | string
  kyc: 'full' | 'light' | 'none' | string
  chains: string[]
  solana: boolean
  cashback: string | null
  fees: string
  physical: boolean
  virtual: boolean
  countries: Record<CountryCode, Avail>
  url: string
  sources: string[]
  notes?: string
  brand: [string, string]
  checkedAt: string
}

// every JSON batch dropped into src/data/cards.*.json is merged (missing files are fine)
const batches = import.meta.glob<{ default: CryptoCard[] }>('../data/cards.*.json', { eager: true })
const AVAILS: Avail[] = ['available', 'not_available', 'waitlist', 'unknown']
const norm = (c: CryptoCard): CryptoCard => ({
  ...c,
  issuer: c.issuer || c.name,
  network: c.network || 'Unconfirmed network',
  type: c.type || 'debit',
  custody: c.custody || 'custodial',
  kyc: c.kyc || 'unconfirmed',
  chains: Array.isArray(c.chains) ? c.chains : [],
  solana: !!c.solana,
  // research placeholders like "Not stated on official pages" are not a cashback offer
  cashback: c.cashback && !/not (stated|published|confirmed)|unknown|^n\/?a$|^none$/i.test(c.cashback) ? c.cashback : null,
  fees: c.fees || 'Not published by the issuer',
  physical: !!c.physical,
  virtual: !!c.virtual,
  sources: Array.isArray(c.sources) ? c.sources : [],
  brand: Array.isArray(c.brand) && c.brand.length === 2 ? c.brand : ['#111111', '#9945ff'],
  countries: {
    GB: AVAILS.includes(c.countries?.GB) ? c.countries.GB : 'unknown',
    US: AVAILS.includes(c.countries?.US) ? c.countries.US : 'unknown',
    USCA: AVAILS.includes(c.countries?.USCA) ? c.countries.USCA : 'unknown',
    RS: AVAILS.includes(c.countries?.RS) ? c.countries.RS : 'unknown',
  },
})
// a card the issuer has shut down everywhere we cover is dropped rather than listed as "not here"
const discontinued = (c: CryptoCard) =>
  /discontinu|shut down|closed|no longer/i.test(c.notes ?? '') && Object.values(c.countries).every((v) => v === 'not_available')

export const CARDS: CryptoCard[] = Object.values(batches)
  .flatMap((m) => m.default)
  .filter((c) => c && c.id && c.name && c.url)
  .map(norm)
  .filter((c) => !discontinued(c))
  .sort((a, b) => a.name.localeCompare(b.name))

export const CITY_COUNTRY: Record<City['id'], { code: CountryCode; name: string; flag: string; short: string }> = {
  ldn: { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', short: 'UK' },
  nyc: { code: 'US', name: 'New York, US', flag: '🇺🇸', short: 'NY' },
  sf: { code: 'USCA', name: 'California, US', flag: '🇺🇸', short: 'CA' },
  bgd: { code: 'RS', name: 'Serbia', flag: '🇷🇸', short: 'RS' },
  ns: { code: 'RS', name: 'Serbia', flag: '🇷🇸', short: 'RS' },
}
export const COUNTRIES: { code: CountryCode; name: string; flag: string; short: string }[] = [
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', short: 'UK' },
  { code: 'US', name: 'New York, US', flag: '🇺🇸', short: 'NY' },
  { code: 'USCA', name: 'California, US', flag: '🇺🇸', short: 'CA' },
  { code: 'RS', name: 'Serbia', flag: '🇷🇸', short: 'RS' },
]

/** Short brand for art + buttons: "MetaMask Card" → "MetaMask", drops legal-entity parentheses. */
export const brandName = (c: CryptoCard) => c.name.replace(/\s*\(.*?\)\s*/g, ' ').trim().replace(/\s+(Visa\s+)?Card$/i, '').trim()

export const availableIn = (code: CountryCode) => CARDS.filter((c) => c.countries[code] === 'available')
