import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  browserLocalPersistence,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db, shopId } from '../firebase/config'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(auth ? 'loading' : 'ready')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!auth || !db) return undefined

    let active = true
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!active) return
      if (!firebaseUser) {
        setUser(null)
        setStatus((current) => current === 'unauthorized' ? 'unauthorized' : 'ready')
        return
      }
      setError('')
      setStatus('checking-access')
      try {
        const membership = await getDoc(doc(db, 'shops', shopId, 'users', firebaseUser.uid))
        if (!active) return
        if (!membership.exists() || membership.data().active !== true || membership.data().role !== 'admin') {
          setUser(null)
          setError('This account is not authorized for this shop. Add its UID to the shop administrator list in Firestore.')
          setStatus('unauthorized')
          await signOut(auth)
          return
        }
        setUser(firebaseUser)
        setStatus('authenticated')
      } catch (cause) {
        if (!active) return
        setUser(null)
        setError(cause.message || 'Could not verify administrator access.')
        setStatus('error')
      }
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const value = useMemo(() => ({
    user,
    status,
    error,
    async login(email, password) {
      if (!auth) throw new Error('Firebase is not configured.')
      await setPersistence(auth, browserLocalPersistence)
      await signInWithEmailAndPassword(auth, email.trim(), password)
    },
    async resetPassword(email) {
      if (!auth) throw new Error('Firebase is not configured.')
      await sendPasswordResetEmail(auth, email.trim())
    },
    async logout() {
      if (auth) await signOut(auth)
    },
  }), [user, status, error])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider.')
  return value
}
