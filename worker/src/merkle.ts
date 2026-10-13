/**
 * Mock merkle distributor tree: real sha256 tree over (wallet, amount) leaves.
 * The on-chain Solana distributor program that verifies these proofs is OUT OF SCOPE here;
 * a production version must hash leaves exactly as the on-chain program does (e.g. wallet pubkey bytes + u64 LE amount).
 */
const enc = new TextEncoder();

const hex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

const unhex = (h: string): Uint8Array => {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
};

const sha256 = async (data: Uint8Array): Promise<string> =>
  hex(await crypto.subtle.digest("SHA-256", data as BufferSource));

export const leafHash = (wallet: string, amount: number): Promise<string> =>
  sha256(enc.encode(`${wallet}:${amount}`));

/** Sorted-pair hashing so verifiers do not need left/right flags. */
const parent = async (a: string, b: string): Promise<string> => {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const buf = new Uint8Array(64);
  buf.set(unhex(lo), 0);
  buf.set(unhex(hi), 32);
  return sha256(buf);
};

export interface Leaf {
  wallet: string;
  amount: number;
}

export async function buildTree(leaves: Leaf[]): Promise<{ root: string; proofFor: (wallet: string) => string[] | null }> {
  const sorted = [...leaves].sort((x, y) => (x.wallet < y.wallet ? -1 : x.wallet > y.wallet ? 1 : 0));
  const index = new Map(sorted.map((l, i) => [l.wallet, i]));
  let level: string[] = await Promise.all(sorted.map((l) => leafHash(l.wallet, l.amount)));
  const levels: string[][] = [level];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i] as string;
      const right = level[i + 1] ?? left; // odd node pairs with itself
      next.push(await parent(left, right));
    }
    level = next;
    levels.push(level);
  }
  const root = level[0] ?? "0".repeat(64);
  return {
    root,
    proofFor(wallet) {
      let i = index.get(wallet);
      if (i === undefined) return null;
      const proof: string[] = [];
      for (let l = 0; l < levels.length - 1; l++) {
        const lvl = levels[l] as string[];
        const sib = i % 2 === 0 ? i + 1 : i - 1;
        proof.push((lvl[sib] ?? lvl[i]) as string);
        i = Math.floor(i / 2);
      }
      return proof;
    },
  };
}
