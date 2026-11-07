/** Tiny pub/sub so pure game logic can notify the UI / audio without importing them. */
type Handler = (payload: any) => void;

class Bus {
  private map = new Map<string, Set<Handler>>();
  on(ev: string, h: Handler): () => void {
    let set = this.map.get(ev);
    if (!set) this.map.set(ev, (set = new Set()));
    set.add(h);
    return () => set!.delete(h);
  }
  emit(ev: string, payload?: unknown): void {
    const set = this.map.get(ev);
    if (set) for (const h of Array.from(set)) h(payload);
  }
}

export const bus = new Bus();
export type ToastKind = 'info' | 'good' | 'bad' | 'loot';
let toastId = 0;
export function toast(msg: string, kind: ToastKind = 'info'): void {
  bus.emit('toast', { id: ++toastId, msg, kind });
}
export type SfxName =
  | 'click' | 'mine' | 'sell' | 'buy' | 'upgrade' | 'error' | 'jump' | 'laser' | 'hit' | 'explode'
  | 'discover' | 'research' | 'mission' | 'scan' | 'alert' | 'achievement' | 'pulse' | 'shield';
export function sfx(name: SfxName): void {
  bus.emit('sfx', name);
}
export interface FxGain { res: string; amount: number }
export function fxGain(res: string, amount: number): void {
  bus.emit('gain', { res, amount } as FxGain);
}
