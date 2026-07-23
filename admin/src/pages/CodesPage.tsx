import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';

import {
  createDiscountCodeRef,
  createInviteCodeRef,
  listDiscountCodesRef,
  listInviteCodesRef,
  setDiscountCodeActiveRef,
  setInviteCodeActiveRef,
  type DiscountCode,
  type PromoCode,
} from '../admin-client';

function CodeRow({
  code,
  extra,
  onToggle,
}: {
  code: PromoCode;
  extra?: string;
  onToggle: (active: boolean) => void;
}) {
  return (
    <tr>
      <td className="mono">{code.code}</td>
      <td>{extra}</td>
      <td>
        {code.redemptionsCount}
        {code.maxRedemptions !== undefined ? ` / ${code.maxRedemptions}` : ''}
      </td>
      <td>{code.expiresAt ? new Date(code.expiresAt).toLocaleDateString('cs-CZ') : '—'}</td>
      <td className="muted">{code.note ?? '—'}</td>
      <td>
        <button className={code.active ? 'danger' : ''} onClick={() => onToggle(!code.active)} type="button">
          {code.active ? 'Deaktivovat' : 'Aktivovat'}
        </button>
      </td>
    </tr>
  );
}

function DiscountCodesSection() {
  const codes = useQuery(listDiscountCodesRef, {});
  const createCode = useMutation(createDiscountCodeRef);
  const setActive = useMutation(setDiscountCodeActiveRef);

  const [bonusXpMultiplier, setBonusXpMultiplier] = useState('1.5');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [note, setNote] = useState('');
  const [lastCreated, setLastCreated] = useState<string | null>(null);

  const create = async () => {
    const result = await createCode({
      bonusXpMultiplier: Number(bonusXpMultiplier) || undefined,
      maxRedemptions: maxRedemptions ? Number(maxRedemptions) : undefined,
      note: note.trim() || undefined,
    });
    setLastCreated(result.code);
    setNote('');
  };

  return (
    <section className="detail-section">
      <h3>Slevové kódy (VIP + XP bonus)</h3>
      <div className="button-row">
        <input
          onChange={(e) => setBonusXpMultiplier(e.target.value)}
          placeholder="XP multiplier"
          style={{ width: 120 }}
          value={bonusXpMultiplier}
        />
        <input
          onChange={(e) => setMaxRedemptions(e.target.value)}
          placeholder="Max. použití (prázdné = neomezeně)"
          style={{ width: 220 }}
          value={maxRedemptions}
        />
        <input onChange={(e) => setNote(e.target.value)} placeholder="Poznámka" value={note} />
        <button onClick={() => void create()} type="button">
          Vytvořit kód
        </button>
      </div>
      {lastCreated ? (
        <p className="muted">
          Vytvořeno: <span className="mono">{lastCreated}</span>
        </p>
      ) : null}
      {codes === undefined ? (
        <p className="muted">Načítám...</p>
      ) : codes.length === 0 ? (
        <p className="muted">Zatím žádné kódy.</p>
      ) : (
        <table className="code-table">
          <thead>
            <tr>
              <th>Kód</th>
              <th>Bonus</th>
              <th>Použito</th>
              <th>Platnost</th>
              <th>Poznámka</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {codes.map((code: DiscountCode) => (
              <CodeRow
                code={code}
                extra={code.bonusXpMultiplier ? `VIP ×${code.bonusXpMultiplier}` : 'VIP'}
                key={code.code}
                onToggle={(active) => void setActive({ code: code.code, active })}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function InviteCodesSection() {
  const codes = useQuery(listInviteCodesRef, {});
  const createCode = useMutation(createInviteCodeRef);
  const setActive = useMutation(setInviteCodeActiveRef);

  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [note, setNote] = useState('');
  const [lastCreated, setLastCreated] = useState<string | null>(null);

  const create = async () => {
    const result = await createCode({
      maxRedemptions: maxRedemptions ? Number(maxRedemptions) : undefined,
      note: note.trim() || undefined,
    });
    setLastCreated(result.code);
    setNote('');
  };

  return (
    <section className="detail-section">
      <h3>Pozvánky</h3>
      <div className="button-row">
        <input
          onChange={(e) => setMaxRedemptions(e.target.value)}
          placeholder="Max. použití (prázdné = neomezeně)"
          style={{ width: 220 }}
          value={maxRedemptions}
        />
        <input onChange={(e) => setNote(e.target.value)} placeholder="Poznámka" value={note} />
        <button onClick={() => void create()} type="button">
          Vytvořit pozvánku
        </button>
      </div>
      {lastCreated ? (
        <p className="muted">
          Vytvořeno: <span className="mono">{lastCreated}</span>
        </p>
      ) : null}
      {codes === undefined ? (
        <p className="muted">Načítám...</p>
      ) : codes.length === 0 ? (
        <p className="muted">Zatím žádné pozvánky.</p>
      ) : (
        <table className="code-table">
          <thead>
            <tr>
              <th>Kód</th>
              <th />
              <th>Použito</th>
              <th>Platnost</th>
              <th>Poznámka</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {codes.map((code: PromoCode) => (
              <CodeRow code={code} key={code.code} onToggle={(active) => void setActive({ code: code.code, active })} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function CodesPage() {
  return (
    <div className="codes-page">
      <DiscountCodesSection />
      <InviteCodesSection />
    </div>
  );
}
