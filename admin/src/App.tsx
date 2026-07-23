import { useState } from 'react';

import { AdminAuthProvider, useAuthActions } from './auth';
import { CodesPage } from './pages/CodesPage';
import { UsersPage } from './pages/UsersPage';

type Tab = 'users' | 'codes';

function Dashboard() {
  const { signOut } = useAuthActions();
  const [tab, setTab] = useState<Tab>('users');

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>TerraQuest Admin</h1>
        <button className="link-button" onClick={() => void signOut()} type="button">
          Odhlásit se
        </button>
      </header>
      <nav className="tabs">
        <button className={tab === 'users' ? 'tab active' : 'tab'} onClick={() => setTab('users')} type="button">
          Uživatelé
        </button>
        <button className={tab === 'codes' ? 'tab active' : 'tab'} onClick={() => setTab('codes')} type="button">
          Kódy
        </button>
      </nav>
      <main className="app-main">{tab === 'users' ? <UsersPage /> : <CodesPage />}</main>
    </div>
  );
}

export function App() {
  return (
    <AdminAuthProvider>
      <Dashboard />
    </AdminAuthProvider>
  );
}
