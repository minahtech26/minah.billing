import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db, shopId } from '../firebase/config'
import { shopCollection, shopDocument } from './shopPaths'

const PAGE_SIZE = 250

export function subscribeToProducts(onProducts, onError) {
  const productsQuery = query(shopCollection('products'), orderBy('name'), limit(PAGE_SIZE))
  return onSnapshot(productsQuery, (snapshot) => {
    onProducts(snapshot.docs
      .map((product) => ({ id: product.id, ...product.data() }))
      .filter((product) => product.active !== false))
  }, onError)
}

export function saveProduct(product, productId) {
  const { stockReason = '', ...fields } = product
  const name = product.name?.trim()
  const price = Number(product.price)
  const costPrice = Number(product.costPrice || 0)
  const gstRate = Number(product.gstRate || 0)
  const stock = Number(product.stock)
  const minimumStock = Number(product.minimumStock || 0)
  if (
    !name ||
    !Number.isFinite(price) || price < 0 ||
    !Number.isFinite(costPrice) || costPrice < 0 ||
    !Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100 ||
    !Number.isFinite(stock) || stock < 0 ||
    !Number.isFinite(minimumStock) || minimumStock < 0
  ) {
    throw new Error('Enter a product name, a valid price, and a valid stock quantity.')
  }
  const data = {
    ...fields,
    name,
    price,
    costPrice,
    gstRate,
    stock,
    minimumStock,
    barcode: product.barcode?.trim() || '',
    updatedAt: serverTimestamp(),
  }
  const productRef = productId
    ? shopDocument('products', productId)
    : doc(collection(db, 'shops', shopId, 'products'))
  const movementRef = doc(collection(db, 'shops', shopId, 'inventoryMovements'))

  return runTransaction(db, async (transaction) => {
    const existing = productId ? await transaction.get(productRef) : null
    if (productId && !existing.exists()) throw new Error('This product no longer exists. Refresh and try again.')
    const previousStock = existing ? Number(existing.data().stock || 0) : 0
    const stockChanged = !existing || previousStock !== stock
    if (existing && stockChanged && !stockReason.trim()) {
      throw new Error('Enter a reason for changing this product’s stock.')
    }

    transaction.set(productRef, existing
      ? { ...data, createdAt: existing.data().createdAt }
      : { ...data, createdAt: serverTimestamp() })
    if (stockChanged) {
      transaction.set(movementRef, {
        productId: productRef.id,
        productName: name,
        type: existing ? 'adjustment' : 'initial',
        previousQuantity: previousStock,
        newQuantity: stock,
        quantity: stock - previousStock,
        reason: existing ? stockReason.trim() : 'Initial stock',
        createdAt: serverTimestamp(),
      })
    }
  })
}

export function removeProduct(productId) {
  return updateDoc(shopDocument('products', productId), {
    active: false,
    updatedAt: serverTimestamp(),
  })
}
