import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { db, shopId } from '../firebase/config'
import { shopCollection, shopDocument } from './shopPaths'

export function subscribeToRecords(collectionName, onData, onError, maximum = 100) {
  const recordsQuery = query(shopCollection(collectionName), orderBy('createdAt', 'desc'), limit(maximum))
  return onSnapshot(recordsQuery, (snapshot) => {
    onData(snapshot.docs.map((record) => ({ id: record.id, ...record.data() })))
  }, onError)
}

export function subscribeToSales(onData, onError, maximum = 100) {
  const salesQuery = query(shopCollection('sales'), orderBy('createdAt', 'desc'), limit(maximum))
  return onSnapshot(salesQuery, (snapshot) => {
    onData(snapshot.docs.map((record) => ({ id: record.id, ...record.data() })))
  }, onError)
}

export async function saveRecord(collectionName, data, recordId) {
  const reference = recordId
    ? shopDocument(collectionName, recordId)
    : doc(collection(db, 'shops', shopId, collectionName))
  if (recordId) {
    await setDoc(reference, { ...data, updatedAt: serverTimestamp() }, { merge: true })
    return recordId
  }
  await setDoc(reference, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  return reference.id
}

export function deleteRecord(collectionName, recordId) {
  return deleteDoc(shopDocument(collectionName, recordId))
}

export async function adjustInventory({ productId, quantityChange, reason }) {
  if (!db || !shopId) throw new Error('Firebase is not configured.')
  const change = Number(quantityChange)
  const explanation = reason?.trim()
  if (!Number.isFinite(change) || change === 0 || !explanation) {
    throw new Error('Enter a non-zero stock change and a reason.')
  }
  const productRef = shopDocument('products', productId)
  const movementRef = doc(collection(db, 'shops', shopId, 'inventoryMovements'))
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(productRef)
    if (!snapshot.exists()) throw new Error('This product no longer exists.')
    const product = snapshot.data()
    const previous = Number(product.stock || 0)
    const next = Math.round((previous + change + Number.EPSILON) * 1000) / 1000
    if (next < 0) throw new Error('Stock cannot be reduced below zero.')
    transaction.update(productRef, { stock: next, updatedAt: serverTimestamp() })
    transaction.set(movementRef, {
      productId,
      productName: product.name,
      type: change > 0 ? 'stock-in' : 'adjustment',
      quantity: change,
      previousQuantity: previous,
      newQuantity: next,
      reason: explanation,
      createdAt: serverTimestamp(),
    })
  })
}

export async function completePurchase({ supplierId, supplierName, items, paymentStatus, paymentMethod, notes }) {
  if (!db || !shopId) throw new Error('Firebase is not configured.')
  if (!Array.isArray(items) || items.length === 0) throw new Error('Add at least one product to this purchase.')
  if (items.length > 200) throw new Error('A purchase can contain at most 200 different products.')
  const combined = new Map()
  for (const item of items) {
    const quantity = Number(item.quantity)
    const unitCost = Number(item.unitCost)
    if (!item.productId || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      throw new Error('Check each product, quantity, and purchase cost.')
    }
    const prior = combined.get(item.productId)
    if (prior) {
      if (prior.unitCost !== unitCost) throw new Error('Use one purchase cost per product in each purchase.')
      prior.quantity += quantity
    } else combined.set(item.productId, { ...item, quantity, unitCost })
  }
  const purchaseItems = [...combined.values()]
  const productRefs = purchaseItems.map((item) => shopDocument('products', item.productId))
  const purchaseRef = doc(collection(db, 'shops', shopId, 'purchases'))
  const movementRefs = purchaseItems.map(() => doc(collection(db, 'shops', shopId, 'inventoryMovements')))

  await runTransaction(db, async (transaction) => {
    const snapshots = await Promise.all(productRefs.map((reference) => transaction.get(reference)))
    const lines = snapshots.map((snapshot, index) => {
      if (!snapshot.exists()) throw new Error('A selected product no longer exists.')
      const current = snapshot.data()
      const quantity = purchaseItems[index].quantity
      const previous = Number(current.stock || 0)
      const oldCost = Number(current.costPrice || 0)
      const unitCost = purchaseItems[index].unitCost
      const newStock = previous + quantity
      const averageCost = newStock > 0 ? ((previous * oldCost) + (quantity * unitCost)) / newStock : unitCost
      return { snapshot, current, previous, newStock, unitCost, averageCost, quantity, index }
    })
    for (const line of lines) {
      transaction.update(line.snapshot.ref, {
        stock: Math.round((line.newStock + Number.EPSILON) * 1000) / 1000,
        costPrice: Math.round((line.averageCost + Number.EPSILON) * 100) / 100,
        updatedAt: serverTimestamp(),
      })
      transaction.set(movementRefs[line.index], {
        productId: line.snapshot.id,
        productName: line.current.name,
        type: 'purchase',
        quantity: line.quantity,
        previousQuantity: line.previous,
        newQuantity: Math.round((line.newStock + Number.EPSILON) * 1000) / 1000,
        reason: purchaseRef.id,
        createdAt: serverTimestamp(),
      })
    }
    const total = purchaseItems.reduce((sum, item) => sum + item.quantity * item.unitCost, 0)
    transaction.set(purchaseRef, {
      supplierId: supplierId || '',
      supplierName: supplierName?.trim() || 'Unspecified supplier',
      items: purchaseItems.map(({ productId, name, quantity, unitCost }) => ({ productId, name, quantity, unitCost, total: quantity * unitCost })),
      total: Math.round((total + Number.EPSILON) * 100) / 100,
      paymentStatus: paymentStatus || 'paid',
      paymentMethod: paymentMethod || 'Cash',
      notes: notes?.trim() || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
  return purchaseRef.id
}

export async function voidSale({ saleId, reason }) {
  if (!db || !shopId) throw new Error('Firebase is not configured.')
  const explanation = reason?.trim()
  if (!explanation) throw new Error('Enter a reason for cancelling this bill.')
  const saleRef = shopDocument('sales', saleId)
  const movementCollection = collection(db, 'shops', shopId, 'inventoryMovements')

  await runTransaction(db, async (transaction) => {
    const saleSnapshot = await transaction.get(saleRef)
    if (!saleSnapshot.exists()) throw new Error('This bill could not be found.')
    const sale = saleSnapshot.data()
    if (sale.status === 'void') throw new Error('This bill has already been cancelled.')
    const items = sale.items || []
    const productRefs = items.map((item) => shopDocument('products', item.productId))
    const productSnapshots = await Promise.all(productRefs.map((reference) => transaction.get(reference)))
    const nextStocks = productSnapshots.map((snapshot, index) => {
      if (!snapshot.exists()) throw new Error(`Product "${items[index].name}" no longer exists; stock was not restored.`)
      return Number(snapshot.data().stock || 0) + Number(items[index].quantity || 0)
    })
    const movementRefs = items.map(() => doc(movementCollection))
    items.forEach((item, index) => {
      const current = Number(productSnapshots[index].data().stock || 0)
      const next = Math.round((nextStocks[index] + Number.EPSILON) * 1000) / 1000
      transaction.update(productRefs[index], { stock: next, updatedAt: serverTimestamp() })
      transaction.set(movementRefs[index], {
        productId: item.productId,
        productName: item.name,
        type: 'sale-void',
        quantity: Number(item.quantity || 0),
        previousQuantity: current,
        newQuantity: next,
        reason: `${sale.invoiceNumber}: ${explanation}`,
        createdAt: serverTimestamp(),
      })
    })
    transaction.update(saleRef, {
      status: 'void',
      voidReason: explanation,
      voidedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
}

export async function saveShopSettings(settings) {
  if (!db || !shopId) throw new Error('Firebase is not configured.')
  await setDoc(shopDocument('settings', 'general'), {
    ...settings,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export function subscribeToShopSettings(onData, onError) {
  const settingsRef = shopDocument('settings', 'general')
  return onSnapshot(settingsRef, (snapshot) => onData(snapshot.exists() ? snapshot.data() : {}), onError)
}

export function timestampDate(timestamp) {
  if (!timestamp) return null
  if (typeof timestamp.toDate === 'function') return timestamp.toDate()
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? null : date
}
