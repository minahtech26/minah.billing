import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { db, shopId } from '../firebase/config'

const roundMoney = (amount) => Math.round((amount + Number.EPSILON) * 100) / 100
const roundQuantity = (quantity) => Math.round((quantity + Number.EPSILON) * 1000) / 1000

export async function completeSale({ cart, paymentMethod, amountReceived, discount = 0, idempotencyKey, customerId, customerName }) {
  if (!db || !shopId) throw new Error('Firebase is not configured. Add your project values to .env.local.')
  if (!Array.isArray(cart) || cart.length === 0) throw new Error('Add at least one product to the bill.')
  if (!['Cash', 'UPI', 'Card', 'Other'].includes(paymentMethod)) throw new Error('Choose a valid payment method.')

  const saleRef = idempotencyKey
    ? doc(db, 'shops', shopId, 'sales', idempotencyKey)
    : doc(collection(db, 'shops', shopId, 'sales'))
  const counterRef = doc(db, 'shops', shopId, 'counters', 'invoices')
  const settingsRef = doc(db, 'shops', shopId, 'settings', 'general')
  const customerRef = customerId ? doc(db, 'shops', shopId, 'customers', customerId) : null
  const itemsById = new Map()
  for (const item of cart) {
    if (!item.id || !Number.isFinite(Number(item.qty)) || Number(item.qty) <= 0) {
      throw new Error('A product in the bill has an invalid quantity.')
    }
    const previous = itemsById.get(item.id)
    itemsById.set(item.id, { ...item, qty: Number(item.qty) + Number(previous?.qty || 0) })
  }
  const items = [...itemsById.values()]
  if (items.length > 200) throw new Error('A bill can contain at most 200 different products.')
  const productRefs = items.map((item) => doc(db, 'shops', shopId, 'products', item.id))

  return runTransaction(db, async (transaction) => {
    const productSnapshots = await Promise.all(productRefs.map((ref) => transaction.get(ref)))
    const counterSnapshot = await transaction.get(counterRef)
    const settingsSnapshot = await transaction.get(settingsRef)
    const previousSale = await transaction.get(saleRef)
    const customerSnapshot = customerRef ? await transaction.get(customerRef) : null
    if (previousSale.exists()) {
      const saved = previousSale.data()
      return {
        saleId: saleRef.id,
        invoiceNumber: saved.invoiceNumber,
        subtotal: saved.subtotal,
        discount: saved.discount,
        total: saved.total,
        change: saved.change,
      }
      if (customerRef && !customerSnapshot?.exists()) throw new Error('The selected customer no longer exists. Choose another customer.')
    }
    const settings = settingsSnapshot.exists() ? settingsSnapshot.data() : {}
    const lines = productSnapshots.map((snapshot, index) => {
      if (!snapshot.exists()) throw new Error('A product in this bill no longer exists. Review the cart and try again.')
      const product = snapshot.data()
      const quantity = Number(items[index].qty)
      const price = Number(product.price)
      const stock = Number(product.stock)
      if (!Number.isFinite(price) || price < 0 || !Number.isFinite(stock) || stock < quantity) {
        throw new Error(`Not enough stock for ${product.name || 'a product'}. The bill was not saved.`)
      }
      return {
        ref: productRefs[index],
        productId: snapshot.id,
        name: product.name,
        quantity,
        unit: product.unit || 'piece',
        unitPrice: price,
        costPrice: Number(product.costPrice || 0),
        gstRate: settings.gstEnabled === true ? Number(product.gstRate || 0) : 0,
        lineTotal: roundMoney(price * quantity),
        previousStock: stock,
      }
    })
    const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0))
    const safeDiscount = Number(discount)
    if (!Number.isFinite(safeDiscount) || safeDiscount < 0 || safeDiscount > subtotal) {
      throw new Error('Discount must be between ₹0 and the subtotal.')
    }
    const tax = roundMoney(lines.reduce((sum, line) => {
      const allocatedDiscount = subtotal > 0 ? safeDiscount * line.lineTotal / subtotal : 0
      return sum + Math.max(line.lineTotal - allocatedDiscount, 0) * line.gstRate / 100
    }, 0))
    const total = roundMoney(subtotal - safeDiscount + tax)
    const received = paymentMethod === 'Cash' ? Number(amountReceived) : total
    if (!Number.isFinite(received) || received < total) {
      throw new Error('Amount received must be at least the bill total.')
    }
    const currentSequence = Number(counterSnapshot.exists() ? counterSnapshot.data().sequence || 0 : 0)
    if (!Number.isSafeInteger(currentSequence) || currentSequence < 0) {
      throw new Error('The invoice counter is invalid. Ask the administrator to check Firebase setup.')
    }
    const nextSequence = currentSequence + 1
    const prefix = String(settings.invoicePrefix || 'INV').trim().replace(/[^a-zA-Z0-9-]/g, '').slice(0, 12) || 'INV'
    const invoiceNumber = `${prefix}-${String(nextSequence).padStart(6, '0')}`

    for (const line of lines) {
      const newStock = roundQuantity(line.previousStock - line.quantity)
      transaction.update(line.ref, {
        stock: newStock,
        updatedAt: serverTimestamp(),
      })
      const movementRef = doc(collection(db, 'shops', shopId, 'inventoryMovements'))
      transaction.set(movementRef, {
        productId: line.productId,
        productName: line.name,
        type: 'sale',
        quantity: -line.quantity,
        previousQuantity: line.previousStock,
        newQuantity: newStock,
        reason: invoiceNumber,
        createdAt: serverTimestamp(),
      })
    }
    transaction.set(counterRef, { sequence: nextSequence, updatedAt: serverTimestamp() })
    transaction.set(saleRef, {
      invoiceNumber,
      status: 'completed',
      items: lines.map(({ ref, previousStock, ...line }) => line),
      customerId: customerId || '',
      customerName: customerRef ? customerSnapshot.data().name : (customerName || ''),
      subtotal,
      discount: safeDiscount,
      tax,
      total,
      paymentMethod,
      amountReceived: received,
      change: roundMoney(Math.max(received - total, 0)),
      createdAt: serverTimestamp(),
    })
    if (customerRef) {
      const customer = customerSnapshot.data()
      transaction.update(customerRef, {
        totalSpent: roundMoney(Number(customer.totalSpent || 0) + total),
        visitCount: Number(customer.visitCount || 0) + 1,
        lastPurchaseAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }
    return { saleId: saleRef.id, invoiceNumber, subtotal, discount: safeDiscount, total, change: roundMoney(Math.max(received - total, 0)) }
  })
}
