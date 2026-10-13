type PhantomProvider = {
  isPhantom?: boolean
  connect: (o?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>
  disconnect: () => Promise<void>
}
declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider }
    solana?: PhantomProvider
  }
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export function phantom(): PhantomProvider | null {
  const p = window.phantom?.solana ?? window.solana
  return p?.isPhantom ? p : null
}

/** Phantom if installed, otherwise a deterministic-looking mock address so the demo keeps flowing. */
export async function connectWallet(): Promise<{ address: string; kind: 'phantom' | 'mock' }> {
  const p = phantom()
  if (p) {
    const r = await p.connect()
    return { address: r.publicKey.toString(), kind: 'phantom' }
  }
  const addr = Array.from({ length: 44 }, () => B58[Math.floor(Math.random() * B58.length)]).join('')
  return { address: addr, kind: 'mock' }
}

export async function disconnectWallet() {
  await phantom()?.disconnect().catch(() => {})
}
