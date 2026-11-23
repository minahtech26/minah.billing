import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { firebaseConfigured, shopId } from '../firebase/config'
import { LockKeyhole, Store } from 'lucide-react'

function ConfigurationRequired() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand"><Store size={23} /></div>
        <h1>Connect your Firebase project</h1>
        <p>Add your Firebase web app settings and shop ID to <code>.env.local</code>, then restart the app.</p>
        <div className="setup-notice">Use <strong>.env.example</strong> as the template. The app will not show demo data or allow access until Firebase is configured.</div>
      </section>
    </main>
  )
}

function SignIn() {
  const { login, resetPassword, error: authError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await login(email, password)
    } catch (cause) {
      setError(cause.code === 'auth/invalid-credential' ? 'Email or password is incorrect.' : cause.message)
    } finally {
      setBusy(false)
    }
  }

  async function forgotPassword() {
    if (!email.trim()) {
      setError('Enter your email address first.')
      return
    }
    setError('')
    setMessage('')
    try {
      await resetPassword(email)
      setMessage('If this email has an account, a password reset link has been sent.')
    } catch (cause) {
      setError(cause.message)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand"><Store size={23} /></div>
        <h1>Welcome back</h1>
        <p>Sign in to your shop administrator account.</p>
        <form onSubmit={submit}>
          <label htmlFor="admin-email">Email address</label>
          <input id="admin-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="admin-password">Password</label>
          <input id="admin-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          {(error || authError) && <div className="auth-error" role="alert">{error || authError}</div>}
          {message && <div className="auth-success" role="status">{message}</div>}
          <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <button className="forgot-link" onClick={forgotPassword}>Forgot password?</button>
        <div className="auth-secure"><LockKeyhole size={14} /> Administrator access only</div>
      </section>
    </main>
  )
}

export default function AuthGate({ children }) {
  const { user, status, error } = useAuth()
  if (!firebaseConfigured || !shopId) return <ConfigurationRequired />
  if (status === 'loading' || status === 'checking-access') {
    return <main className="auth-page"><div className="auth-loading">Checking secure access…</div></main>
  }
  if (status === 'error') {
    return <main className="auth-page"><section className="auth-card"><h1>Could not verify access</h1><p>{error || 'Check your Firebase connection and administrator membership setup, then reload.'}</p></section></main>
  }
  return user ? children : <SignIn />
}
