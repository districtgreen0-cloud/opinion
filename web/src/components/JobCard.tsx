import { useStore } from '../store'
import type { Comment, JobStatus } from '../lib/types'
import { jobAction, jobActions, LIVE, type JobAction } from '../lib/api'
import { HANDLES } from '../data/mock'
import { ago, nf } from '../lib/format'
import { Avatar } from './bits'
import { Person } from './Profile'

const STEPS: JobStatus[] = ['open', 'funded', 'taken', 'delivered', 'paid']
const LABEL: Record<JobAction, string> = {
  fund: 'Fund escrow',
  take: 'Take job',
  deliver: 'Mark delivered',
  release: 'Release payment',
  cancel: 'Cancel',
}
const TOAST: Record<JobAction, string> = {
  fund: 'USDC locked in escrow · job is live',
  take: 'You took the job · poster is notified',
  deliver: 'Marked delivered · waiting for release',
  release: 'USDC released to the worker ✓',
  cancel: 'Job cancelled · escrow refunded',
}

/** Demo only: play the other side of the deal so the full escrow loop can be tried solo. */
function simulateCounterparty(job: Comment) {
  if (LIVE) return
  const s = useStore.getState
  const step = (ms: number, patch: Partial<Comment>, msg: string) =>
    setTimeout(() => {
      const cur = s().comments.find((c) => c.id === job.id)
      if (!cur || cur.jobStatus === 'cancelled') return
      s().upsertPost({ ...cur, ...patch })
      s().toast(msg, 'violet')
    }, ms)
  if (job.jobStatus === 'funded' && job.wallet === s().wallet?.address) {
    const who = HANDLES[Math.floor(Math.random() * HANDLES.length)]
    step(3500, { jobStatus: 'taken', workerHandle: who, workerWallet: 'demo-' + who }, `${who} took “${job.title}”`)
    step(9000, { jobStatus: 'delivered' }, `${who} marked “${job.title}” delivered`)
  }
  if (job.jobStatus === 'delivered' && job.workerWallet === s().wallet?.address) {
    step(3500, { jobStatus: 'paid' }, `Poster released ${nf(job.priceUsdc ?? 0)} USDC to you ✓`)
  }
}

export default function JobCard({ job, compact, onOpen }: { job: Comment; compact?: boolean; onOpen?: () => void }) {
  const wallet = useStore((s) => s.wallet)
  const me = useStore((s) => s.me)
  const s = useStore.getState
  const status = job.jobStatus ?? 'open'
  const step = STEPS.indexOf(status)
  const mine = !!wallet && job.wallet === wallet.address
  const actions = jobActions(job, wallet?.address, me.handle)

  const act = async (a: JobAction) => {
    if (!wallet) return s().toast('Connect a wallet to use escrow', 'ember')
    const r = await jobAction(job, a, wallet.address, me.handle)
    if (!r.ok) return s().toast(r.reason === 'bad_state' ? 'Someone got there first' : r.reason === 'forbidden' ? 'Not your move' : 'Escrow call failed', 'ember')
    s().upsertPost(r.job)
    s().toast(TOAST[a], a === 'cancel' ? undefined : 'mint')
    if (a === 'release') s().award(5, 'deal closed')
    simulateCounterparty(r.job)
  }

  return (
    <article className={`rounded-[18px] border hairline bg-white/[.02] p-4 ${status === 'cancelled' || status === 'paid' ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <button onClick={onOpen} className="block text-left" disabled={!onOpen}>
            <h4 className="text-[15px] leading-snug font-medium text-white">{job.title}</h4>
          </button>
          {!compact && <p className="mt-0.5 text-[12.5px] leading-snug text-white/70">{job.text}</p>}
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-fog">
            <Person handle={job.handle} avatar={job.avatar} className="flex items-center gap-1.5"><Avatar id={job.avatar} handle={job.handle} size={14} /> {mine ? 'you' : job.handle}</Person> · {ago(job.createdAt)}
            {job.workerHandle && <> · worker <span className="text-white/70">{job.workerHandle === me.handle ? 'you' : job.workerHandle}</span></>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="num text-[20px] leading-none font-semibold text-white">{nf(job.priceUsdc ?? 0)}</div>
          <div className="mt-1 text-[10px] tracking-[0.16em] text-fog">USDC</div>
        </div>
      </div>

      {status === 'cancelled' ? (
        <div className="mt-3 text-[11px] tracking-[0.15em] text-fog uppercase">Cancelled · refunded</div>
      ) : (
        <div className="mt-3 flex gap-1" aria-label={`Status: ${status}`}>
          {STEPS.map((st, i) => (
            <div key={st} className="flex flex-1 flex-col gap-1">
              <div className={`h-1 rounded-full ${i <= step ? (st === 'paid' ? 'bg-mint' : i >= 2 ? 'bg-violet' : 'bg-white/45') : 'bg-white/10'}`} />
              <span className={`text-[8.5px] tracking-[0.12em] uppercase ${i <= step ? 'text-white/70' : 'text-white/25'}`}>{st}</span>
            </div>
          ))}
        </div>
      )}

      {actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((a) => (
            <button key={a} className={`${a === 'cancel' ? 'btn-ghost !text-fog' : 'btn-ghost'} flex-1 text-[12.5px]`} onClick={() => act(a)}>
              {LABEL[a]}
              {a === 'fund' && ` · ${nf(job.priceUsdc ?? 0)} USDC`}
            </button>
          ))}
        </div>
      )}
      {!wallet && status === 'funded' && <p className="mt-2 text-[11px] text-white/35">Connect a wallet to take this job.</p>}
      {mine && status === 'open' && <p className="mt-2 text-[11px] text-white/35">Fund the escrow to publish it to workers.</p>}
      {!mine && status === 'open' && <p className="mt-2 text-[11px] text-white/35">Waiting for the poster to fund the escrow.</p>}
    </article>
  )
}
