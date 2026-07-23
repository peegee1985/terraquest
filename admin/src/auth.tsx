import { ConvexAuthProvider, useAuthActions, useAuthToken, useConvexAuth } from '@convex-dev/auth/react';
import { jwtDecode } from 'jwt-decode';
import { FormEvent, ReactNode, useState } from 'react';

import { convex } from './convex-client';

// Display-only convenience so the UI can show "not authorized" without a
// round trip — the real gate is convex/admin.ts's requireAdmin, checked
// server-side on every single query/mutation in this app. Keep this list in
// sync with ADMIN_EMAILS there, but never treat this copy as the actual
// security boundary.
const KNOWN_ADMIN_EMAILS: readonly string[] = ['petr.gottstein@gmail.com'];

type AuthClaims = { email?: string; isAnonymous?: boolean };

function useAdminEmail(): string | null {
  const token = useAuthToken();
  if (!token) return null;
  try {
    return jwtDecode<AuthClaims>(token).email ?? null;
  } catch {
    return null;
  }
}

function LoginForm() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn('password', { email: email.trim(), password, flow: 'signIn' });
    } catch {
      setError('Přihlášení se nepovedlo. Zkontroluj e-mail a heslo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <h1>TerraQuest Admin</h1>
        <p className="muted">Přihlaš se admin účtem.</p>
        <input
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
          type="email"
          value={email}
        />
        <input
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Heslo"
          type="password"
          value={password}
        />
        {error ? <p className="error">{error}</p> : null}
        <button disabled={submitting} type="submit">
          {submitting ? 'Přihlašuji...' : 'Přihlásit se'}
        </button>
      </form>
    </div>
  );
}

function NotAuthorized() {
  const { signOut } = useAuthActions();
  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Nemáš přístup</h1>
        <p className="muted">Tento účet není na seznamu adminů.</p>
        <button onClick={() => void signOut()} type="button">
          Odhlásit se
        </button>
      </div>
    </div>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const email = useAdminEmail();

  if (isLoading) return <div className="login-screen muted">Načítám...</div>;
  if (!isAuthenticated) return <LoginForm />;
  if (!email || !KNOWN_ADMIN_EMAILS.includes(email)) return <NotAuthorized />;
  return <>{children}</>;
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthProvider client={convex}>
      <AuthGate>{children}</AuthGate>
    </ConvexAuthProvider>
  );
}

export { useAuthActions };
