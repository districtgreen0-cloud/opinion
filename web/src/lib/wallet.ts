/**
 * Solflare wallet (Solana). Desktop: the Solflare browser extension injects window.solflare.
 * Phones: Safari/Chrome have no extension → we open OPINION inside Solflare's in-app browser (deep link).
 * No Solflare available → a demo address so the preview keeps flowing.
 */
type SolflareProvider = {
  isSolflare?: boolean
  isConnected?: boolean
  publicKey?: { toString(): string } | null
  connect: () => Promise<unknown>
  disconnect: () => Promise<void>
}
declare global {
  interface Window {
    solflare?: SolflareProvider
  }
}

export type WalletKind = 'solflare' | 'mock'
export const SOLFLARE_ICON = '/wallets/solflare.svg' // official Solflare mark (from @solana/wallet-adapter-solflare)
export const SOLFLARE_DOWNLOAD = 'https://solflare.com/download'

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export function solflare(): SolflareProvider | null {
  const p = window.solflare
  return p?.isSolflare ? p : null
}

/** Open this page inside the Solflare mobile app (where the wallet is available). */
export function openInSolflareApp() {
  location.href = `https://solflare.com/ul/v1/browse/${encodeURIComponent(location.href)}?ref=${encodeURIComponent(location.origin)}`
}

/** Solflare if installed, otherwise a demo address. Throws if the user rejects in Solflare. */
export async function connectWallet(opts: { demo?: boolean } = {}): Promise<{ address: string; kind: WalletKind }> {
  const p = opts.demo ? null : solflare()
  if (p) {
    await p.connect()
    const key = p.publicKey?.toString()
    if (!key) throw new Error('rejected')
    return { address: key, kind: 'solflare' }
  }
  const addr = Array.from({ length: 44 }, () => B58[Math.floor(Math.random() * B58.length)]).join('')
  return { address: addr, kind: 'mock' }
}

export async function disconnectWallet() {
  await solflare()?.disconnect().catch(() => {})
}
