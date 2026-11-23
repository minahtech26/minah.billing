import { collection, doc } from 'firebase/firestore'
import { db, shopId } from '../firebase/config'

export function shopCollection(name) {
  if (!db || !shopId) throw new Error('Firebase is not configured. Add your project values to .env.local.')
  return collection(db, 'shops', shopId, name)
}

export function shopDocument(collectionName, id) {
  if (!db || !shopId) throw new Error('Firebase is not configured. Add your project values to .env.local.')
  return doc(db, 'shops', shopId, collectionName, id)
}
