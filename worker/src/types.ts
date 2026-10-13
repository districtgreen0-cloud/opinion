/** Shared with the frontend: must match exactly. */
export type PostKind = 'note' | 'topic' | 'reply' | 'job'
export type JobStatus = 'open' | 'funded' | 'taken' | 'delivered' | 'paid' | 'cancelled'
export interface Comment {
  id: string; cell: string; text: string; handle: string; avatar: string; wallet?: string; createdAt: number
  accountId?: string       // set server-side when the poster had a valid session
  kind?: PostKind          // default 'note'
  title?: string           // topic + job: 1..80 chars, required for those kinds
  parentId?: string        // reply → the topic id (must exist in the same hex, kind 'topic')
  priceUsdc?: number       // job: 1..100000, max 2 decimals, required for jobs
  jobStatus?: JobStatus    // job only; 'open' on create
  workerHandle?: string    // job: who took it
  workerWallet?: string
}

export interface OpinionEvent {
  id: string;
  title: string;
  host: string;
  venue: string;
  lat: number;
  lng: number;
  /** ms epoch */
  startsAt: number;
  endsAt: number;
  status: "live" | "upcoming";
  cover: string;
  lumaUrl: string;
  attendees: number;
}

export interface NewComment {
  text: string;
  handle: string;
  avatar: string;
  wallet?: string;
  accountId?: string;      // server-side only, never taken from the request body
  kind?: PostKind;
  title?: string;
  parentId?: string;
  priceUsdc?: number;
}

export type PostResult =
  | { ok: true; comment: Comment }
  | { ok: false; error: "invalid"; field: string }
  | { ok: false; error: "rate_limited"; retryAfter: number };

export interface Account { id: string; email: string | null; name: string | null; picture: string | null; handle: string; avatar: string; providers: ("google" | "email")[]; createdAt: number }

/** Zero-knowledge chat relay (see zk.ts). Shared with the frontend: must match exactly. */
export interface ZkKey { fp: string; handle: string; avatar: string; pub: { kty: 'EC'; crv: 'P-256'; x: string; y: string }; createdAt: number }
export interface ZkWrapped { iv: string; ct: string }              // base64url
export interface ZkRoom { id: string; kind: 'dm' | 'group'; name: string /* already encrypted by client for groups is fine; treat as opaque ≤200 chars */; members: string[] /* fps */; admin: string /* fp */; epoch: number; keys: Record<string /*epoch*/, { by: string /*wrapper fp*/; to: Record<string /*member fp*/, ZkWrapped> }>; updatedAt: number }
export interface ZkEnvelope { id: string; room: string; from: string; epoch: number; iv: string; ct: string; ts: number }
