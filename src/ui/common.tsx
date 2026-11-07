import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { RES, type ResBag, type ResId } from '../game/data';
import { canAfford, type Cost, type GameState } from '../game/state';
import { toast } from '../game/events';
import { store } from '../store';
import type { Result } from '../game/actions';

export function fmt(n: number, digits = 0): string {
  if (!isFinite(n)) return '0';
  const a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  if (digits > 0) return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return Math.floor(n + 1e-9).toLocaleString('en-US');
}
export function fmtRate(n: number): string {
  if (n === 0) return '0';
  if (n < 10) return n.toFixed(2);
  if (n < 100) return n.toFixed(1);
  return fmt(n);
}
export function fmtTime(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Run a game action, show errors as toasts, and refresh the UI. */
export function run(fn: () => Result, opts: { say?: boolean } = {}): Result {
  const s = store.state;
  if (!s) return { ok: false, msg: 'No game.' };
  const r = fn();
  if (!r.ok) toast(r.msg, 'bad');
  else if (opts.say && r.msg) toast(r.msg, 'info');
  store.notify();
  return r;
}

export function AnimatedNumber({ value, className, format = (v: number) => fmt(v) }: { value: number; className?: string; format?: (v: number) => string }) {
  const [shown, setShown] = useState(value);
  const cur = useRef(value);
  const goal = useRef(value);
  const raf = useRef(0);
  useEffect(() => {
    goal.current = value;
    cancelAnimationFrame(raf.current);
    const step = () => {
      const diff = goal.current - cur.current;
      if (Math.abs(diff) < Math.max(0.5, Math.abs(goal.current) * 0.0005)) {
        cur.current = goal.current;
        setShown(goal.current);
        return;
      }
      cur.current += diff * 0.2;
      setShown(cur.current);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);
  return <span className={className}>{format(shown)}</span>;
}

export function ResDot({ res, size = 10 }: { res: ResId; size?: number }) {
  return <span className="resdot" style={{ background: RES[res].color, width: size, height: size, boxShadow: `0 0 8px ${RES[res].color}` }} />;
}

export function Bar({ value, max, color = 'var(--cyan)', label, height = 8, warn }: { value: number; max: number; color?: string; label?: string; height?: number; warn?: boolean }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="bar" style={{ height }} title={label}>
      <div className="bar-fill" style={{ width: `${pct}%`, background: warn && pct < 25 ? 'var(--red)' : color }} />
    </div>
  );
}

/** Shows a cost list, colouring items the player cannot afford. */
export function CostList({ s, cost, inline }: { s: GameState; cost: Cost; inline?: boolean }) {
  const items: ReactNode[] = [];
  if (cost.credits > 0) {
    const ok = s.credits >= cost.credits;
    items.push(
      <span key="cr" className={`cost ${ok ? '' : 'short'}`} title={ok ? '' : `You have ${fmt(s.credits)}`}>
        <b>¤</b> {fmt(cost.credits)}
      </span>,
    );
  }
  for (const k of Object.keys(cost.res) as ResId[]) {
    const need = cost.res[k] as number;
    if (!need) continue;
    const have = Math.floor(s.res[k]);
    items.push(
      <span key={k} className={`cost ${have >= need ? '' : 'short'}`} title={`${RES[k].name}: have ${fmt(have)}`}>
        <ResDot res={k} size={8} /> {fmt(need)} <small>{RES[k].name}</small>
      </span>,
    );
  }
  return <div className={`costs ${inline ? 'inline' : ''}`}>{items}</div>;
}

export function BuyButton({ s, cost, onClick, label, disabledReason, className = '', small }: { s: GameState; cost: Cost; onClick: () => void; label: string; disabledReason?: string; className?: string; small?: boolean }) {
  const afford = canAfford(s, cost);
  const blocked = !!disabledReason;
  return (
    <button className={`btn ${afford && !blocked ? 'primary' : 'dim'} ${small ? 'sm' : ''} ${className}`} onClick={onClick} title={blocked ? disabledReason : afford ? '' : 'Not enough resources'} aria-disabled={!afford || blocked}>
      {label}
    </button>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; badge?: number }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={`tab ${value === t.id ? 'on' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
          {t.badge ? <span className="badge">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Modal({ children, onClose, title, wide, danger }: { children: ReactNode; onClose?: () => void; title?: string; wide?: boolean; danger?: boolean }) {
  useEffect(() => {
    if (!onClose) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''} ${danger ? 'danger' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Pips({ level, max, cap }: { level: number; max: number; cap: number }) {
  return (
    <div className="pips" aria-label={`Level ${level} of ${cap}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`pip ${i < level ? 'on' : ''} ${i >= cap ? 'locked' : ''}`} />
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, style }: { label: string; value: ReactNode; sub?: ReactNode; style?: CSSProperties }) {
  return (
    <div className="stat" style={style}>
      <span className="stat-l">{label}</span>
      <span className="stat-v">{value}</span>
      {sub && <span className="stat-s">{sub}</span>}
    </div>
  );
}

export function costOf(credits: number, res: ResBag): Cost {
  return { credits, res };
}

export function Tip({ children, text }: { children: ReactNode; text: string }) {
  return (
    <span className="tip" data-tip={text}>
      {children}
    </span>
  );
}

// ───────────── confirmation dialogs ─────────────
type ConfirmReq = { title: string; body: ReactNode; confirm: string; danger?: boolean; resolve: (v: boolean) => void };
let confirmHandler: ((r: ConfirmReq) => void) | null = null;
export function setConfirmHandler(h: ((r: ConfirmReq) => void) | null) {
  confirmHandler = h;
}
export function askConfirm(title: string, body: ReactNode, confirm = 'Confirm', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    if (!confirmHandler) return resolve(window.confirm(typeof body === 'string' ? body : title));
    confirmHandler({ title, body, confirm, danger, resolve });
  });
}
export type { ConfirmReq };
