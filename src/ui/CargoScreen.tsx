import { useState } from 'react';
import { ALL_RES, CRAFTED, MINEABLE, RECIPES, RES, TECH_BY_ID, type CraftRes, type ResId } from '../game/data';
import { BUY_MARKUP, cargoUsed, getMods, hasTech, quoteBuy, quoteSale, sellFeeRate, shipStats, storageCap } from '../game/state';
import * as A from '../game/actions';
import { useGame } from '../store';
import { ResDot, Tabs, fmt, run } from './common';

type Tab = 'market' | 'fab';
type Q = 1 | 10 | 100 | 'max';

export function CargoScreen() {
  const { s } = useGame();
  const [tab, setTab] = useState<Tab>('market');
  const [q, setQ] = useState<Q>(10);
  const st = shipStats(s);
  const used = cargoUsed(s);
  return (
    <div className="panel wide">
      <div className="panel-head">
        <div>
          <h1>Cargo & Market</h1>
          <div className="sub">
            <span className="tag" title="Fee taken from every sale. Halved by the Cargo Freighter and reduced by research.">Sell fee {(sellFeeRate(s) * 100).toFixed(1)}%</span>
            <span className="tag">Ship hold {Math.floor(used)}/{st.cargoCap}</span>
          </div>
        </div>
        <button className="btn" onClick={() => run(() => A.unload(s), { say: true })}>⇩ Unload hold</button>
      </div>
      {used >= 1 && (
        <div className="mini-stats">
          <span className="dimtxt">In ship hold:</span>
          {MINEABLE.filter((r) => s.cargo[r] >= 1).map((r) => (
            <span key={r}><ResDot res={r} size={8} /> {Math.floor(s.cargo[r])} {RES[r].name}</span>
          ))}
        </div>
      )}
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'market', label: 'Warehouse & Market' }, { id: 'fab', label: 'Fabricator' }]} />
      {tab === 'market' ? <Market q={q} setQ={setQ} /> : <Fabricator />}
    </div>
  );
}

function qtyFor(have: number, q: Q): number {
  const h = Math.floor(have + 1e-9);
  return q === 'max' ? h : Math.min(q, h);
}

function Market({ q, setQ }: { q: Q; setQ: (q: Q) => void }) {
  const { s } = useGame();
  return (
    <>
      <div className="qty-pills" role="group" aria-label="Quantity">
        <span className="dimtxt">Quantity</span>
        {([1, 10, 100, 'max'] as Q[]).map((v) => (
          <button key={String(v)} className={`pill ${q === v ? 'on' : ''}`} onClick={() => setQ(v)}>{v === 'max' ? 'Max' : v}</button>
        ))}
      </div>
      <table className="tbl market">
        <thead>
          <tr><th>Resource</th><th>Stock</th><th>Price</th><th>Sell {q === 'max' ? 'all' : `×${q}`}</th><th>Buy</th></tr>
        </thead>
        <tbody>
          {ALL_RES.map((r) => {
            const info = RES[r];
            const have = Math.floor(s.res[r]);
            const mk = s.market[r].mult;
            const n = qtyFor(s.res[r], q);
            const sale = quoteSale(s, r, n);
            const trend = mk > 1.04 ? '▲' : mk < 0.96 ? '▼' : '•';
            const cap = storageCap(s, r);
            const buyN = q === 'max' ? Math.max(0, Math.min(Math.floor(cap - s.res[r]), 100)) : Math.min(q as number, Math.max(0, Math.floor(cap - s.res[r])));
            const bq = quoteBuy(s, r, buyN);
            return (
              <tr key={r}>
                <td><ResDot res={r} /> <b>{info.name}</b><br /><small className="dimtxt">{info.crafted ? 'Fabricated' : 'Raw'}</small></td>
                <td>{fmt(have)} <small className="dimtxt">/ {fmt(cap)}</small></td>
                <td className={mk > 1.04 ? 'good' : mk < 0.96 ? 'bad' : ''} title={`Base price ${info.price}. Selling lowers the price; it recovers over time.`}>¤{(info.price * mk).toFixed(info.price < 10 ? 2 : 0)} {trend}</td>
                <td>
                  <button className={`btn sm ${n > 0 ? 'primary' : 'dim'}`} onClick={() => run(() => A.sell(s, r, n), { say: false })} title={n > 0 ? `Sell ${n}: gross ¤${Math.round(sale.gross)}, fee ¤${Math.round(sale.fee)}` : 'Nothing to sell'}>
                    Sell {n > 0 ? n : ''}
                  </button>
                  {n > 0 && <small className="good"> +¤{fmt(sale.net)}</small>}
                </td>
                <td>
                  {info.buyable ? (
                    <>
                      <button className={`btn sm ${s.credits >= bq.cost && buyN > 0 ? '' : 'dim'}`} onClick={() => run(() => A.buy(s, r, buyN))} title={`Buying costs ${(BUY_MARKUP * 100 - 100).toFixed(0)}% over the sell price`}>Buy {buyN}</button>
                      {buyN > 0 && <small className="dimtxt"> ¤{fmt(bq.cost)}</small>}
                    </>
                  ) : <small className="dimtxt" title="Not sold on the market">—</small>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="hint">Prices drift slowly and drop when you sell large amounts, so spread big sales out or let Cargo Vessels do it. Buying costs {(BUY_MARKUP * 100 - 100).toFixed(0)}% more than selling.</div>
    </>
  );
}

function Fabricator() {
  const { s } = useGame();
  const m = getMods(s);
  return (
    <div className="grid cols2">
      {(CRAFTED as readonly CraftRes[]).map((r) => {
        const rec = RECIPES[r];
        const locked = !!rec.unlock && !hasTech(s, rec.unlock);
        const maxN = Math.min(...(Object.keys(rec.inputs) as ResId[]).map((k) => Math.floor(s.res[k] / (rec.inputs[k] as number))), Math.floor(storageCap(s, r) - s.res[r]));
        return (
          <div key={r} className={`card ${locked ? 'locked' : ''}`}>
            <div className="card-head"><ResDot res={r} size={12} /><b>{RES[r].name}</b><span className="lv">{fmt(s.res[r])}</span></div>
            <p className="flavor">{RES[r].desc}</p>
            <div className="mini-stats">
              {(Object.keys(rec.inputs) as ResId[]).map((k) => (
                <span key={k} className={s.res[k] >= (rec.inputs[k] as number) ? '' : 'bad'}><ResDot res={k} size={8} /> {rec.inputs[k]} {RES[k].name} <small>({fmt(s.res[k])})</small></span>
              ))}
            </div>
            <small className="dimtxt">Refinery time {(rec.time / m.refine).toFixed(0)}s each · sells for ¤{RES[r].price}</small>
            {locked && <div className="hint bad">🔒 Research {TECH_BY_ID[rec.unlock!]?.name}</div>}
            <div className="btn-row">
              <button className={`btn ${!locked && maxN >= 1 ? 'primary' : 'dim'}`} onClick={() => run(() => A.craft(s, r, 1))} title={locked ? 'Locked' : ''}>Craft ×1</button>
              <button className={`btn ${!locked && maxN >= 5 ? '' : 'dim'}`} onClick={() => run(() => A.craft(s, r, 5))}>×5</button>
              <button className={`btn ${!locked && maxN >= 1 ? '' : 'dim'}`} onClick={() => run(() => A.craft(s, r, Math.max(1, maxN)))}>Max {maxN > 0 ? maxN : ''}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
