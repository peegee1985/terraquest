import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';

import {
  banUserRef,
  deleteUserRef,
  flagUserRef,
  getUserDetailRef,
  grantBonusRef,
  listFlaggedUsersRef,
  listUsersRef,
  setUserPlanRef,
  unbanUserRef,
  unflagUserRef,
  type UserSummary,
} from '../admin-client';

const ITEM_OPTIONS = ['map_theme_token', 'scanner_pulse', 'memory_marker'] as const;

function StatusBadge({ status }: { status: UserSummary['status'] }) {
  if (status === 'active') return null;
  return <span className={`badge badge-${status}`}>{status === 'suspended' ? 'BANNED' : 'MAZÁNÍ'}</span>;
}

function PlanBadge({ plan }: { plan?: 'free' | 'vip' }) {
  if (plan !== 'vip') return null;
  return <span className="vip-badge">VIP</span>;
}

function UserRow({ user, selected, onSelect }: { user: UserSummary; selected: boolean; onSelect: () => void }) {
  return (
    <button className={selected ? 'user-row selected' : 'user-row'} onClick={onSelect} type="button">
      <div className="user-row-main">
        <span className="handle">{user.handle}</span>
        <PlanBadge plan={user.plan} />
        {user.flaggedForReview ? <span className="flag-badge">⚑</span> : null}
        <StatusBadge status={user.status} />
      </div>
      <div className="user-row-sub muted">
        {user.email ?? 'bez e-mailu'} · Lv.{user.level} · {user.totalXp} XP
      </div>
    </button>
  );
}

function UserDetailPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const detail = useQuery(getUserDetailRef, { userId });
  const banUser = useMutation(banUserRef);
  const unbanUser = useMutation(unbanUserRef);
  const deleteUser = useMutation(deleteUserRef);
  const flagUser = useMutation(flagUserRef);
  const unflagUser = useMutation(unflagUserRef);
  const setUserPlan = useMutation(setUserPlanRef);
  const grantBonus = useMutation(grantBonusRef);

  const [flagReason, setFlagReason] = useState('');
  const [xpMultiplier, setXpMultiplier] = useState('1.5');
  const [bonusXp, setBonusXp] = useState('');
  const [bonusItem, setBonusItem] = useState<(typeof ITEM_OPTIONS)[number] | ''>('');
  const [bonusQty, setBonusQty] = useState('1');
  const [busy, setBusy] = useState(false);

  if (detail === undefined) return <div className="detail-panel muted">Načítám...</div>;
  if (detail === null) return <div className="detail-panel muted">Uživatel nenalezen.</div>;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <h2>{detail.handle}</h2>
        <button className="link-button" onClick={onClose} type="button">
          Zavřít
        </button>
      </div>
      <p className="muted">{detail.email ?? 'bez e-mailu'}</p>
      <div className="stat-grid">
        <div>
          <span className="stat-label">Level</span>
          <span className="stat-value">{detail.level}</span>
        </div>
        <div>
          <span className="stat-label">XP</span>
          <span className="stat-value">{detail.totalXp}</span>
        </div>
        <div>
          <span className="stat-label">Streak</span>
          <span className="stat-value">{detail.currentStreakDays}d</span>
        </div>
        <div>
          <span className="stat-label">Vzdálenost</span>
          <span className="stat-value">{Math.round(detail.verifiedDistanceMeters / 1000)} km</span>
        </div>
      </div>

      <section className="detail-section">
        <h3>Účet</h3>
        <div className="button-row">
          {detail.status === 'suspended' ? (
            <button disabled={busy} onClick={() => run(() => unbanUser({ userId }))} type="button">
              Zrušit ban
            </button>
          ) : (
            <button
              className="danger"
              disabled={busy}
              onClick={() => run(() => banUser({ userId }))}
              type="button"
            >
              Banovat
            </button>
          )}
          <button
            className="danger"
            disabled={busy || detail.status === 'deletion_pending'}
            onClick={() => {
              if (confirm(`Opravdu smazat účet ${detail.handle}?`)) void run(() => deleteUser({ userId }));
            }}
            type="button"
          >
            {detail.status === 'deletion_pending' ? 'Smazání naplánováno' : 'Smazat účet'}
          </button>
        </div>
      </section>

      <section className="detail-section">
        <h3>Nahlášení (anti-cheat)</h3>
        {detail.flaggedForReview ? (
          <>
            <p className="muted">Důvod: {detail.flagReason}</p>
            <button disabled={busy} onClick={() => run(() => unflagUser({ userId }))} type="button">
              Zrušit nahlášení
            </button>
          </>
        ) : (
          <div className="button-row">
            <input
              onChange={(e) => setFlagReason(e.target.value)}
              placeholder="Důvod nahlášení"
              value={flagReason}
            />
            <button
              disabled={busy || !flagReason.trim()}
              onClick={() => run(() => flagUser({ userId, reason: flagReason.trim() }))}
              type="button"
            >
              Nahlásit
            </button>
          </div>
        )}
      </section>

      <section className="detail-section">
        <h3>VIP / plán</h3>
        <p className="muted">
          Aktuálně: {detail.plan === 'vip' ? `VIP (×${detail.xpMultiplier ?? 1})` : 'Free'}
          {detail.planExpiresAt ? ` do ${new Date(detail.planExpiresAt).toLocaleDateString('cs-CZ')}` : ''}
        </p>
        <div className="button-row">
          <input
            onChange={(e) => setXpMultiplier(e.target.value)}
            placeholder="XP multiplier"
            style={{ width: 110 }}
            value={xpMultiplier}
          />
          <button
            disabled={busy}
            onClick={() =>
              run(() =>
                setUserPlan({ handle: detail.handle, plan: 'vip', xpMultiplier: Number(xpMultiplier) || 1.5 }),
              )
            }
            type="button"
          >
            Nastavit VIP
          </button>
          <button
            className="danger"
            disabled={busy || detail.plan !== 'vip'}
            onClick={() => run(() => setUserPlan({ handle: detail.handle, plan: 'free' }))}
            type="button"
          >
            Zrušit VIP
          </button>
        </div>
      </section>

      <section className="detail-section">
        <h3>Přidat bonus</h3>
        <div className="button-row">
          <input onChange={(e) => setBonusXp(e.target.value)} placeholder="XP" style={{ width: 90 }} value={bonusXp} />
          <select onChange={(e) => setBonusItem(e.target.value as (typeof ITEM_OPTIONS)[number] | '')} value={bonusItem}>
            <option value="">(žádný item)</option>
            {ITEM_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input onChange={(e) => setBonusQty(e.target.value)} placeholder="Množství" style={{ width: 90 }} value={bonusQty} />
          <button
            disabled={busy || (!bonusXp && !bonusItem)}
            onClick={() =>
              run(() =>
                grantBonus({
                  userId,
                  xpAmount: bonusXp ? Number(bonusXp) : undefined,
                  itemId: bonusItem || undefined,
                  itemQuantity: bonusItem ? Number(bonusQty) || 1 : undefined,
                }),
              )
            }
            type="button"
          >
            Přidat
          </button>
        </div>
      </section>

      <section className="detail-section">
        <h3>Inventář</h3>
        {detail.inventory.length === 0 ? (
          <p className="muted">Prázdný.</p>
        ) : (
          <ul className="plain-list">
            {detail.inventory.map((item) => (
              <li key={item.itemId}>
                {item.itemId} × {item.quantity}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="detail-section">
        <h3>Poslední XP události</h3>
        {detail.recentXpEvents.length === 0 ? (
          <p className="muted">Žádné.</p>
        ) : (
          <ul className="plain-list">
            {detail.recentXpEvents.map((event, i) => (
              <li key={i}>
                +{event.amount} XP — {event.reasonCode} ({new Date(event.occurredAt).toLocaleString('cs-CZ')})
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function UsersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const allUsers = useQuery(listUsersRef, onlyFlagged ? 'skip' : { searchTerm: searchTerm || undefined });
  const flaggedUsers = useQuery(listFlaggedUsersRef, onlyFlagged ? {} : 'skip');
  const users = onlyFlagged ? flaggedUsers : allUsers;

  return (
    <div className="split-view">
      <div className="list-column">
        <div className="list-controls">
          <input
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Hledat podle jména, e-mailu..."
            value={searchTerm}
          />
          <label className="checkbox-label">
            <input checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} type="checkbox" />
            Jen nahlášení
          </label>
        </div>
        {users === undefined ? (
          <p className="muted">Načítám...</p>
        ) : users.length === 0 ? (
          <p className="muted">Žádní uživatelé.</p>
        ) : (
          <div className="user-list">
            {users.map((user) => (
              <UserRow
                key={user.userId}
                onSelect={() => setSelectedUserId(user.userId)}
                selected={selectedUserId === user.userId}
                user={user}
              />
            ))}
          </div>
        )}
      </div>
      {selectedUserId ? (
        <UserDetailPanel key={selectedUserId} onClose={() => setSelectedUserId(null)} userId={selectedUserId} />
      ) : (
        <div className="detail-panel muted">Vyber uživatele ze seznamu.</div>
      )}
    </div>
  );
}
