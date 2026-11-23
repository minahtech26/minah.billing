import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  LayoutDashboard, ShoppingCart, Package, Boxes, Truck, Users, WalletCards,
  ReceiptText, BarChart3, Settings, Search, ChevronDown, Plus, Minus,
  Trash2, CreditCard, IndianRupee, TrendingUp, TrendingDown, AlertTriangle, MoreHorizontal,
  ChevronLeft, ChevronRight, Printer, Download, Store, X, Check, RotateCcw, LogOut,
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from './context/AuthContext'
import { subscribeToProducts, saveProduct, removeProduct } from './services/productService'
import { completeSale } from './services/billingService'
import {
  adjustInventory, completePurchase, deleteRecord, saveRecord, saveShopSettings,
  subscribeToRecords, subscribeToSales, subscribeToShopSettings, timestampDate, voidSale,
} from './services/recordsService'

const nav = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'New Bill', icon: ShoppingCart },
  { label: 'Products', icon: Package },
  { label: 'Inventory', icon: Boxes },
  { label: 'Purchases', icon: Truck },
  { label: 'Suppliers', icon: Users },
  { label: 'Customers', icon: Users },
  { label: 'Expenses', icon: WalletCards },
  { label: 'Bill History', icon: ReceiptText },
  { label: 'Reports', icon: BarChart3 },
  { label: 'Settings', icon: Settings },
]

function money(v) {
  return `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function dateInputValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function Sidebar({ active, setActive, collapsed, setCollapsed }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const primaryNav = nav.slice(0, 5)
  const moreNav = nav.slice(5)

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand">
        <div className="brand-mark"><Store size={21} /></div>
        {!collapsed && <div><strong>Grocery POS</strong><span>Shop admin</span></div>}
      </div>
      <button
        className="collapse"
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
        aria-controls="primary-navigation"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
      </button>
      <nav id="primary-navigation">
        {nav.map(({ label, icon: Icon }, index) => (
          <button
            key={label}
            className={`nav-item${active === label ? ' active' : ''}${index >= primaryNav.length ? ' mobile-secondary' : ''}`}
            onClick={() => { setActive(label); setMoreOpen(false) }}
          >
            <Icon size={19} /><span>{label}</span>
            {label === 'New Bill' && !collapsed && <kbd>F2</kbd>}
          </button>
        ))}
        <button
          className={`nav-item mobile-more${moreOpen || moreNav.some(({ label }) => active === label) ? ' active' : ''}`}
          type="button"
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          aria-controls="mobile-more-menu"
          onClick={() => setMoreOpen(!moreOpen)}
        >
          <MoreHorizontal size={19} /><span>More</span>
        </button>
      </nav>
      {moreOpen && (
        <div className="mobile-more-menu" id="mobile-more-menu" role="menu" aria-label="More sections">
          {moreNav.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              className={active === label ? 'active' : ''}
              onClick={() => { setActive(label); setMoreOpen(false) }}
            >
              <Icon size={18} /><span>{label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="store-status">
        <div className="status-dot"></div>
        {!collapsed && <><div><strong>Secure session</strong><span>Administrator signed in</span></div><ChevronRight size={16} /></>}
      </div>
    </aside>
  )
}

function Topbar({ active }) {
  const { user, logout } = useAuth()
  return (
    <header className="topbar">
      <div><h1>{active}</h1><p>{active === 'Dashboard' ? 'Here is what is happening in your store today.' : `Manage ${active.toLowerCase()} efficiently.`}</p></div>
      <div className="top-actions">
        <div className="profile">
          <div className="avatar">{(user?.email?.[0] || 'A').toUpperCase()}</div>
          <div><strong>{user?.email || 'Administrator'}</strong><span>Administrator</span></div>
          <button className="logout-btn" onClick={logout}><LogOut size={15}/><span>Logout</span></button>
        </div>
      </div>
    </header>
  )
}

function StatCard({ title, value, change, icon: Icon, tone, note }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}><Icon size={21} /></div>
      <div className="stat-main"><span>{title}</span><strong>{value}</strong></div>
      {change && <div className={change.startsWith('+') ? 'change up' : 'change down'}>{change.startsWith('+') ? <TrendingUp size={14}/> : <TrendingDown size={14}/>} {change}</div>}
      {note && <div className="stat-note">{note}</div>}
    </div>
  )
}

function Dashboard({ setActive }) {
  const [products, setProducts] = useState([])
  const [sales, setSales] = useState([])
  const [expenses, setExpenses] = useState([])
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(0)
  useEffect(() => {
    let remaining = 3
    const done = () => setLoaded((current) => current + 1)
    const fail = (cause) => { setError(cause.message || 'Could not load dashboard data.'); done() }
    const unsubscribers = [
      subscribeToProducts((items) => { setProducts(items); done() }, fail),
      subscribeToSales((items) => { setSales(items); done() }, fail, 250),
      subscribeToRecords('expenses', (items) => { setExpenses(items); done() }, fail, 250),
    ]
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [])
  const now = new Date()
  const todaySales = sales.filter((sale) => {
    const date = timestampDate(sale.createdAt)
    return date && date.toDateString() === now.toDateString() && sale.status !== 'void'
  })
  const todayExpenses = expenses.filter((expense) => {
    const date = timestampDate(expense.createdAt)
    return date && date.toDateString() === now.toDateString()
  }).reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
  const salesTotal = todaySales.reduce((sum, sale) => sum + Number(sale.total || 0), 0)
  const profit = todaySales.reduce((sum, sale) => sum + Number(sale.total || 0) - Number(sale.tax || 0) - (sale.items || []).reduce((value, item) => value + Number(item.costPrice || 0) * Number(item.quantity || 0), 0), 0)
  const lowStock = products.filter((product) => Number(product.stock || 0) <= Number(product.minimumStock ?? 5))
  const weeklyData = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now)
    date.setDate(now.getDate() - (6 - index))
    const total = sales.filter((sale) => {
      const saleDate = timestampDate(sale.createdAt)
      return saleDate && saleDate.toDateString() === date.toDateString() && sale.status !== 'void'
    }).reduce((sum, sale) => sum + Number(sale.total || 0), 0)
    return { name: date.toLocaleDateString('en-IN', { weekday: 'short' }), sales: total }
  })
  const weeklyTotal = weeklyData.reduce((sum, day) => sum + day.sales, 0)
  const bestSellers = new Map()
  sales.filter((sale) => sale.status !== 'void' && timestampDate(sale.createdAt)?.toDateString() === now.toDateString()).forEach((sale) => {
    (sale.items || []).forEach((item) => {
      const record = bestSellers.get(item.productId) || { name: item.name, quantity: 0, sales: 0 }
      record.quantity += Number(item.quantity || 0)
      record.sales += Number(item.lineTotal || Number(item.unitPrice || 0) * Number(item.quantity || 0))
      bestSellers.set(item.productId, record)
    })
  })
  const best = [...bestSellers.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 4)
  return (
    <div className="page">
      {error && <p className="data-message error">{error}</p>}
      {loaded < 3 && <p className="data-message">Loading live shop data…</p>}
      <div className="stat-grid">
        <StatCard title="Today's Sales" value={money(salesTotal)} icon={IndianRupee} tone="green" />
        <StatCard title="Today's Bills" value={String(todaySales.length)} icon={ReceiptText} tone="blue" />
        <StatCard title="Gross Profit" value={money(profit)} icon={TrendingUp} tone="purple" note={`Expenses today ${money(todayExpenses)}`} />
        <StatCard title="Low Stock Items" value={String(lowStock.length)} icon={AlertTriangle} tone="orange" note="Requires attention" />
      </div>
      <div className="dashboard-grid">
        <section className="card sales-card">
          <div className="card-head">
            <div><h2>Sales Overview</h2><p>Sales performance this week</p></div>
            <span className="select-btn">Last 7 days</span>
          </div>
          <div className="chart-summary"><strong>{money(weeklyTotal)}</strong></div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyData} margin={{ top: 10, right: 5, left: -18, bottom: 0 }}>
                <defs><linearGradient id="sales" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#55B88A" stopOpacity={0.28}/><stop offset="95%" stopColor="#55B88A" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#edf0ed"/>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill:'#8b968f', fontSize:12 }}/>
                <YAxis axisLine={false} tickLine={false} tick={{ fill:'#8b968f', fontSize:12 }} tickFormatter={(v)=>`${v/1000}k`}/>
                <Tooltip formatter={(v)=>money(v)} />
                <Area type="monotone" dataKey="sales" stroke="#2F7657" strokeWidth={3} fill="url(#sales)"/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="card low-stock">
          <div className="card-head"><div><h2>Low Stock Alerts</h2><p>{lowStock.length} items need attention</p></div><button className="text-btn" onClick={()=>setActive('Inventory')}>View All</button></div>
          {lowStock.slice(0, 4).map((product) => (
            <div className="stock-row" key={product.id}><div className="stock-emoji"><Package size={17}/></div><div><strong>{product.name}</strong><span>{product.stock} {product.unit || 'units'} left</span></div><div className="stock-meter"><i style={{width:`${Math.min(Number(product.stock || 0) / Math.max(Number(product.minimumStock || 1), 1) * 45,45)}%`}}/></div><button onClick={()=>setActive('Inventory')}>Update</button></div>
          ))}
          {lowStock.length === 0 && <p className="data-message">No low stock products.</p>}
        </section>
      </div>
      <div className="dashboard-grid bottom-grid">
        <section className="card">
          <div className="card-head"><div><h2>Recent Transactions</h2><p>Latest completed bills</p></div><button className="text-btn" onClick={()=>setActive('Bill History')}>View All</button></div>
          <div className="table">
            <div className="tr th"><span>Invoice</span><span>Customer</span><span>Time</span><span>Payment</span><span>Amount</span></div>
            {sales.filter((sale)=>sale.status!=='void').slice(0, 4).map((sale)=>(
              <div className="tr" key={sale.id}><span>{sale.invoiceNumber}</span><span>{sale.customerName || 'Walk-in'}</span><span>{timestampDate(sale.createdAt)?.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) || '—'}</span><span className="payment"><i/>{sale.paymentMethod}</span><strong>{money(sale.total)}</strong></div>
            ))}
            {sales.length===0 && <p className="data-message">No bills recorded yet.</p>}
          </div>
        </section>
        <section className="card top-products">
          <div className="card-head"><div><h2>Top-Selling Products</h2><p>By quantity sold today</p></div></div>
          {best.map((product,index)=>(
            <div className="product-rank" key={product.name}><b>{index+1}</b><div className="rank-emoji"><Package size={16}/></div><div><strong>{product.name}</strong><span>{product.quantity} sold</span></div><em>{money(product.sales)}</em></div>
          ))}
          {best.length===0 && <p className="data-message">No sales recorded today.</p>}
        </section>
      </div>
    </div>
  )
}

function Billing() {
  const [category, setCategory] = useState('All')
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState([])
  const { records: customers } = useRecords('customers', 250)
  const [shopSettings,setShopSettings]=useState({})
  const [customerId, setCustomerId] = useState('')
  const searchRef = useRef(null)
  const paymentRef = useRef(null)
  const [productError, setProductError] = useState('')
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [cart, setCart] = useState([])
  const [billId, setBillId] = useState(() => crypto.randomUUID())
  const billLock = useRef(false)
  const [payment, setPayment] = useState('Cash')
  const [received, setReceived] = useState('')
  const [discount, setDiscount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [completedSale, setCompletedSale] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [saleError, setSaleError] = useState('')
  const finishBillRef = useRef(null)
  useEffect(() => subscribeToProducts((items) => {
    setProducts(items)
    setLoadingProducts(false)
    setProductError('')
  }, (error) => {
    setProductError(error.message || 'Could not load products.')
    setLoadingProducts(false)
  }), [])
  useEffect(() => subscribeToShopSettings(setShopSettings,(error)=>setProductError(error.message||'Could not load billing settings.')),[])
  const categories = ['All', ...new Set(products.map((p) => p.category).filter(Boolean))]
  const filtered = useMemo(()=>products.filter(p=> (category==='All'||p.category===category) && `${p.name} ${p.barcode || ''}`.toLowerCase().includes(query.toLowerCase())),[products,category,query])
  const subtotal = cart.reduce((s,p)=>s+p.price*p.qty,0)
  const taxable = shopSettings.gstEnabled === true
    ? cart.reduce((sum,item) => {
      const lineTotal = Number(item.price || 0) * Number(item.qty || 0)
      const lineDiscount = subtotal > 0 ? Number(discount || 0) * lineTotal / subtotal : 0
      return sum + Math.max(lineTotal - lineDiscount, 0) * Number(item.gstRate || 0) / 100
    }, 0)
    : 0
  const tax = Math.round((taxable + Number.EPSILON) * 100) / 100
  const total = Math.max(Math.round((subtotal - discount + tax + Number.EPSILON) * 100) / 100,0)
  const add = (product) => {
    const inCart = cart.find((item)=>item.id===product.id)?.qty || 0
    if (Number(product.stock) <= inCart) {
      setSaleError(`Only ${product.stock} ${product.unit || 'units'} of ${product.name} are in stock.`)
      return
    }
    setSaleError('')
    setCart((current)=>current.some((item)=>item.id===product.id)
      ? current.map((item)=>item.id===product.id?{...item,qty:item.qty+1}:item)
      : [...current,{...product,qty:1}])
  }
  const setQty = (id,value)=>setCart((current)=>current.map((item)=>{
    if(item.id!==id)return item
    const quantity=Number(value)
    if(!Number.isFinite(quantity)||quantity<=0)return item
    if(quantity>Number(item.stock)){
      setSaleError(`Only ${item.stock} ${item.unit || 'units'} of ${item.name} are in stock.`)
      return {...item,qty:Number(item.stock)}
    }
    setSaleError('')
    return {...item,qty:Math.round((quantity+Number.EPSILON)*1000)/1000}
  }))
  const changeQty = (id,delta)=>{
    const item=cart.find((product)=>product.id===id)
    if(!item)return
    const next=Math.round((item.qty+delta+Number.EPSILON)*1000)/1000
    if(next<=0){setCart((current)=>current.filter((product)=>product.id!==id));return}
    setQty(id,next)
  }
  async function finishBill() {
    if (billLock.current) return
    billLock.current = true
    setBusy(true)
    setSaleError('')
    setMessage('')
    try {
      const selectedCustomer = customers.find((customer)=>customer.id===customerId)
      const result = await completeSale({
        cart,
        paymentMethod: payment,
        amountReceived: received === '' ? total : received,
        discount,
        idempotencyKey: billId,
        customerId,
        customerName: selectedCustomer?.name || '',
      })
      setCompletedSale({
        invoiceNumber: result.invoiceNumber,
        items: cart.map((item) => ({
          name: item.name,
          quantity: item.qty,
          unitPrice: item.price,
          lineTotal: item.price * item.qty,
        })),
        customerName: selectedCustomer?.name || '',
        subtotal,
        discount,
        tax,
        total,
        paymentMethod: payment,
        amountReceived: received === '' ? total : Number(received),
        change: result.change,
        createdAt: new Date(),
        status: 'completed',
      })
      setCart([])
      setReceived('')
      setDiscount(0)
      setCustomerId('')
      setBillId(crypto.randomUUID())
      setMessage(`${result.invoiceNumber} saved successfully.`)
    } catch (error) {
      setSaleError(error.message || 'Could not save this bill. Your cart is unchanged.')
    } finally {
      setBusy(false)
      billLock.current = false
    }
  }
  finishBillRef.current = finishBill
  async function printCompletedInvoice() {
    if (!completedSale) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      setSaleError('Allow pop-ups for this site to print the invoice.')
      return
    }
    setPrinting(true)
    setSaleError('')
    try {
      const pdf = await createInvoicePdf(completedSale, shopSettings)
      pdf.autoPrint()
      printWindow.location.href = pdf.output('bloburl')
    } catch (error) {
      printWindow.close()
      setSaleError(error.message || 'Could not prepare the invoice for printing.')
    } finally {
      setPrinting(false)
    }
  }
  useEffect(() => {
    function onShortcut(event) {
      if (event.key === 'F2') { event.preventDefault(); searchRef.current?.focus() }
      if (event.key === 'F4') { event.preventDefault(); paymentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
      if (event.key === 'F8') { event.preventDefault(); finishBillRef.current?.() }
    }
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [])

  function scanBarcode(event) {
    if (event.key !== 'Enter') return
    const barcode = query.trim().toLowerCase()
    const match = products.find((product)=>String(product.barcode || '').toLowerCase()===barcode)
    if (match) {
      event.preventDefault()
      add(match)
      setQuery('')
    }
  }

  return (
    <div className="billing-layout">
      <section className="catalog">
        <div className="billing-search"><Search size={18}/><input ref={searchRef} autoFocus value={query} onKeyDown={scanBarcode} onChange={e=>setQuery(e.target.value)} placeholder="Search product or scan barcode..."/><kbd>F2</kbd></div>
        <div className="category-row">{categories.map(c=><button key={c} className={category===c?'selected':''} onClick={()=>setCategory(c)}>{c}</button>)}</div>
        <div className="product-grid">
          {loadingProducts && <p className="data-message">Loading products…</p>}
          {productError && <p className="data-message error">{productError}</p>}
          {!loadingProducts && !productError && filtered.length===0 && <p className="data-message">No products found. Add products before billing.</p>}
          {filtered.map(p=>(
            <button className="product-card" key={p.id} onClick={()=>add(p)}>
              <div className="product-image"><span><Package size={36}/></span>{Number(p.stock)<Number(p.minimumStock || 5)&&<i>{Number(p.stock)<=0?'Out of stock':'Low'}</i>}</div>
              <div className="product-info"><strong>{p.name}</strong><span>{p.unit || 'piece'} · {p.stock} in stock</span><div><b>{money(p.price)}</b><em><Plus size={16}/></em></div></div>
            </button>
          ))}
        </div>
      </section>
      <aside className="cart-panel">
        <div className="cart-head"><div><h2>Current Bill</h2><span>{cart.reduce((sum,item)=>sum+item.qty,0)} items</span></div><button onClick={()=>{setCart([]);setReceived('');setDiscount(0)}}><RotateCcw size={16}/> Clear</button></div>
        <div className="customer-line"><div className="avatar small">{customerId ? customers.find((customer)=>customer.id===customerId)?.name?.[0]?.toUpperCase() || 'C' : 'W'}</div><select aria-label="Optional customer" value={customerId} onChange={(event)=>setCustomerId(event.target.value)}><option value="">Walk-in customer</option>{customers.map((customer)=><option key={customer.id} value={customer.id}>{customer.name}{customer.phone?` · ${customer.phone}`:''}</option>)}</select></div>
        <div className="cart-list">
          {cart.length===0?<div className="empty-cart"><ShoppingCart size={34}/><strong>Your cart is empty</strong><span>Add products to begin a bill</span></div>:cart.map(p=>(
            <div className="cart-row" key={p.id}>
              <div className="cart-emoji"><Package size={19}/></div>
              <div className="cart-name"><strong>{p.name}</strong><span>{money(p.price)} / {p.unit}</span></div>
              <div className="qty"><button onClick={()=>changeQty(p.id,-1)}><Minus size={13}/></button><input aria-label={`Quantity of ${p.name}`} type="number" min="0.001" max={p.stock} step="0.001" value={p.qty} onChange={(event)=>setQty(p.id,event.target.value)}/><button onClick={()=>changeQty(p.id,1)}><Plus size={13}/></button></div>
              <strong className="line-total">{money(p.price*p.qty)}</strong>
              <button className="remove" onClick={()=>setCart(c=>c.filter(x=>x.id!==p.id))}><Trash2 size={15}/></button>
            </div>
          ))}
        </div>
        <div className="bill-summary">
          <div><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
          <div><span>Discount</span><input className="discount-input" type="number" min="0" max={subtotal} step="0.01" value={discount} onChange={(event)=>setDiscount(Number(event.target.value))}/></div>
          <div><span>GST {shopSettings.gstEnabled===true?<small>(product rates)</small>:<small>(off)</small>}</span><strong>{money(tax)}</strong></div>
          <div className="grand"><span>Grand Total</span><strong>{money(total)}</strong></div>
        </div>
        <div className="payment" ref={paymentRef}>
          <span>Payment Method</span>
          <div className="payment-methods">{['Cash','UPI','Card','Other'].map(m=><button key={m} className={payment===m?'selected':''} onClick={()=>setPayment(m)}>{m==='Cash'?'💵':m==='UPI'?'📱':m==='Card'?'💳':'⋯'} {m}</button>)}</div>
          {payment==='Cash'&&<div className="received"><label>Amount Received</label><div><span>₹</span><input type="number" min={total} step="0.01" value={received} onChange={e=>setReceived(e.target.value)} placeholder={String(total)}/></div><p>Balance: <strong>{money(Math.max(Number(received||total)-total,0))}</strong></p></div>}
        </div>
        {saleError && <p className="sale-message error" role="alert">{saleError}</p>}
        {message && <div className="sale-success" role="status"><span>{message}</span><button type="button" className="row-action" disabled={printing} onClick={printCompletedInvoice}><Printer size={14}/>{printing?'Preparing…':'Print Invoice'}</button></div>}
        <button className="complete" disabled={!cart.length||busy} onClick={finishBill}><Printer size={18}/> {busy?'Saving…':'Complete Bill'} <span>{money(total)}</span></button>
      </aside>
    </div>
  )
}

function ProductsPage() {
  const [products, setProducts] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', category: '', price: '', costPrice: '', stock: '', minimumStock: '5', unit: 'piece', barcode: '', stockReason: '', gstRate: '0' })
  const [search, setSearch] = useState('')
  useEffect(() => subscribeToProducts((items) => {
    setProducts(items)
    setLoading(false)
    setError('')
  }, (cause) => {
    setError(cause.message || 'Could not load products.')
    setLoading(false)
  }), [])
  const visibleProducts = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
  function openForm(product = null) {
    setEditing(product)
    setFormOpen(true)
    setForm(product ? {
      name: product.name || '', category: product.category || '', price: product.price ?? '',
      costPrice: product.costPrice ?? '', stock: product.stock ?? '', minimumStock: product.minimumStock ?? '5',
      unit: product.unit || 'piece', barcode: product.barcode || '', gstRate: product.gstRate ?? 0,
      stockReason: '',
    } : { name: '', category: '', price: '', costPrice: '', stock: '', minimumStock: '5', unit: 'piece', barcode: '', stockReason: '', gstRate: '0' })
    setFormError('')
  }
  async function submitProduct(event) {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      await saveProduct(form, editing?.id)
      setEditing(null)
      setFormOpen(false)
    } catch (cause) {
      setFormError(cause.message || 'Could not save this product.')
    } finally {
      setSaving(false)
    }
  }
  async function deleteProduct(product) {
    if (!window.confirm(`Delete ${product.name}? This product will no longer be available for billing.`)) return
    try { await removeProduct(product.id) } catch (cause) { setError(cause.message || 'Could not delete the product.') }
  }
  return (
    <div className="page">
      <div className="page-toolbar">
        <div className="search-box"><Search size={17}/><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search products..."/></div>
        <button className="primary-btn" onClick={()=>openForm()}><Plus size={17}/> Add Product</button>
      </div>
      <section className="card data-card">
        {loading && <p className="data-message">Loading products…</p>}
        {error && <p className="data-message error">{error}</p>}
        {!loading && !error && visibleProducts.length===0 && <p className="data-message">No products yet. Add your first product.</p>}
        {visibleProducts.length>0 && <div className="table products-table">
          <div className="tr th"><span>Product</span><span>Category</span><span>Stock</span><span>Selling Price</span><span>Action</span></div>
          {visibleProducts.map(p=><div className="tr" key={p.id}><span className="table-product"><i><Package size={17}/></i><b>{p.name}</b></span><span>{p.category || '—'}</span><span className={p.stock<p.minimumStock?'danger-text':''}>{p.stock} {p.unit || 'piece'}</span><strong>{money(p.price)}</strong><span><button className="row-action" onClick={()=>openForm(p)}>Edit</button><button className="row-action" onClick={()=>deleteProduct(p)}>Delete</button></span></div>)}
        </div>}
      </section>
      {formOpen && <div className="modal-backdrop" role="presentation" onClick={(event)=>{if(event.target===event.currentTarget)setFormOpen(false)}}>
        <form className="product-form" onSubmit={submitProduct}>
          <h2>{editing ? 'Edit product' : 'Add product'}</h2>
          <label>Product name<input required value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/></label>
          <div className="form-grid">
            <label>Category<input value={form.category} onChange={(e)=>setForm({...form,category:e.target.value})}/></label>
            <label>Selling price (₹)<input type="number" min="0" step="0.01" required value={form.price} onChange={(e)=>setForm({...form,price:e.target.value})}/></label>
            <label>Purchase cost (₹)<input type="number" min="0" step="0.01" value={form.costPrice} onChange={(e)=>setForm({...form,costPrice:e.target.value})}/></label>
            <label>Stock quantity<input type="number" min="0" step="0.001" required value={form.stock} onChange={(e)=>setForm({...form,stock:e.target.value})}/></label>
            <label>Low stock at<input type="number" min="0" step="0.001" value={form.minimumStock} onChange={(e)=>setForm({...form,minimumStock:e.target.value})}/></label>
            <label>Unit<input required value={form.unit} onChange={(e)=>setForm({...form,unit:e.target.value})}/></label>
            <label>GST rate (%)<input type="number" min="0" max="100" step="0.01" value={form.gstRate} onChange={(e)=>setForm({...form,gstRate:e.target.value})}/></label>
            {editing && <label>Stock change reason<input value={form.stockReason} onChange={(e)=>setForm({...form,stockReason:e.target.value})} placeholder="Required if stock changes"/></label>}
          </div>
          {formError && <p className="auth-error" role="alert">{formError}</p>}
          <div className="form-actions"><button type="button" className="row-action" onClick={()=>setFormOpen(false)}>Cancel</button><button type="submit" className="primary-btn" disabled={saving}>{saving?'Saving…':'Save product'}</button></div>
        </form>
      </div>}
    </div>
  )
}

const entityDefinitions = {
  Suppliers: {
    collection: 'suppliers',
    fields: [
      { key: 'name', label: 'Supplier name', required: true },
      { key: 'phone', label: 'Phone number', type: 'tel' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'address', label: 'Address' },
      { key: 'gstin', label: 'GSTIN' },
    ],
    columns: ['name', 'phone', 'email', 'address'],
  },
  Customers: {
    collection: 'customers',
    fields: [
      { key: 'name', label: 'Customer name', required: true },
      { key: 'phone', label: 'Phone number', type: 'tel' },
      { key: 'email', label: 'Email', type: 'email' },
    ],
    columns: ['name', 'phone', 'email'],
  },
  Expenses: {
    collection: 'expenses',
    fields: [
      { key: 'title', label: 'Expense title', required: true },
      { key: 'category', label: 'Category', required: true },
      { key: 'amount', label: 'Amount (₹)', type: 'number', required: true, min: 0.01, step: '0.01' },
      { key: 'paymentMethod', label: 'Payment method', type: 'select', options: ['Cash', 'UPI', 'Card', 'Other'], required: true },
      { key: 'date', label: 'Expense date', type: 'date', required: true },
      { key: 'notes', label: 'Notes' },
    ],
    columns: ['title', 'category', 'amount', 'paymentMethod'],
  },
}

function useRecords(collectionName, maximum = 100) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => subscribeToRecords(collectionName, (items) => {
    setRecords(items)
    setLoading(false)
    setError('')
  }, (cause) => {
    setError(cause.message || `Could not load ${collectionName}.`)
    setLoading(false)
  }, maximum), [collectionName, maximum])
  return { records, setRecords, loading, error, setError }
}

function EntityPage({ name }) {
  const definition = entityDefinitions[name]
  const { records, loading, error, setError } = useRecords(definition.collection)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const visible = records.filter((record) => definition.fields.some((field) => String(record[field.key] || '').toLowerCase().includes(search.toLowerCase())))
  function showForm() {
    setEditing(null)
    setForm(Object.fromEntries(definition.fields.map((field) => [
      field.key,
      field.type === 'select' ? field.options[0] : field.type === 'date' ? dateInputValue() : '',
    ])))
    setFormError('')
    setOpen(true)
  }
  function editForm(record) {
    setEditing(record)
    setForm(Object.fromEntries(definition.fields.map((field) => [field.key, record[field.key] ?? (field.type === 'select' ? field.options[0] : '')])))
    setFormError('')
    setOpen(true)
  }
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setFormError('')
    try {
      const data = { ...form }
      if (Object.prototype.hasOwnProperty.call(data, 'amount')) {
        data.amount = Number(data.amount)
        if (!Number.isFinite(data.amount) || data.amount <= 0) throw new Error('Enter an amount greater than zero.')
      }
      await saveRecord(definition.collection, data, editing?.id)
      setOpen(false)
    } catch (cause) {
      setFormError(cause.message || `Could not save ${name.toLowerCase()}.`)
    } finally {
      setBusy(false)
    }
  }
  async function remove(record) {
    const label = record.name || record.title || 'this record'
    if (!window.confirm(`Delete ${label}?`)) return
    try { await deleteRecord(definition.collection, record.id) } catch (cause) { setError(cause.message || 'Could not delete the record.') }
  }
  return (
    <div className="page">
      <div className="page-toolbar">
        <div className="search-box"><Search size={17}/><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder={`Search ${name.toLowerCase()}...`}/></div>
        <button className="primary-btn" onClick={showForm}><Plus size={17}/> Add {name==='Expenses'?'Expense':name==='Customers'?'Customer':'Supplier'}</button>
      </div>
      <section className="card data-card">
        {loading && <p className="data-message">Loading {name.toLowerCase()}…</p>}
        {error && <p className="data-message error">{error}</p>}
        {!loading && !error && !visible.length && <p className="data-message">No {name.toLowerCase()} found. Add your first record.</p>}
        {!!visible.length && <div className="table entity-table">
          <div className="tr th">{definition.columns.map((column)=><span key={column}>{definition.fields.find((field)=>field.key===column)?.label || column}</span>)}<span>Added</span><span>Action</span></div>
          {visible.map((record)=><div className="tr" key={record.id}>{definition.columns.map((column)=><span key={column}>{column==='amount'?money(record[column]):record[column] || '—'}</span>)}<span>{record.date || timestampDate(record.createdAt)?.toLocaleDateString('en-IN') || '—'}</span><span><button className="row-action" onClick={()=>editForm(record)}>Edit</button><button className="row-action" onClick={()=>remove(record)}>Delete</button></span></div>)}
        </div>}
      </section>
      {open && <div className="modal-backdrop" onClick={(event)=>{if(event.target===event.currentTarget)setOpen(false)}}>
        <form className="product-form" onSubmit={submit}>
          <h2>{editing?'Edit':'Add'} {name==='Expenses'?'expense':name==='Customers'?'customer':'supplier'}</h2>
          {definition.fields.map((field)=><label key={field.key}>{field.label}
            {field.type==='select'
              ? <select required={field.required} value={form[field.key] || ''} onChange={(event)=>setForm({...form,[field.key]:event.target.value})}>{field.options.map((option)=><option key={option}>{option}</option>)}</select>
              : <input type={field.type || 'text'} required={field.required} min={field.min} step={field.step} value={form[field.key] || ''} onChange={(event)=>setForm({...form,[field.key]:event.target.value})}/>}
          </label>)}
          {formError && <p className="auth-error">{formError}</p>}
          <div className="form-actions"><button type="button" className="row-action" onClick={()=>setOpen(false)}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Save'}</button></div>
        </form>
      </div>}
    </div>
  )
}

function InventoryPage() {
  const { records: products, loading, error } = useRecords('products', 250)
  const { records: movements } = useRecords('inventoryMovements', 100)
  const [selected, setSelected] = useState(null)
  const [change, setChange] = useState('')
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const visible = products.filter((product) => product.active !== false && product.name.toLowerCase().includes(search.toLowerCase()))
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setFormError('')
    try {
      await adjustInventory({ productId: selected.id, quantityChange: change, reason })
      setSelected(null)
      setChange('')
      setReason('')
    } catch (cause) { setFormError(cause.message || 'Could not adjust stock.') }
    finally { setBusy(false) }
  }
  return (
    <div className="page">
      <div className="page-toolbar"><div className="search-box"><Search size={17}/><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search products..."/></div><span className="muted-inline">{movements.length} recent stock movements</span></div>
      {error && <p className="data-message error">{error}</p>}
      <section className="card data-card">
        {loading && <p className="data-message">Loading inventory…</p>}
        {!loading && !visible.length && <p className="data-message">No products in inventory. Add products first.</p>}
        {!!visible.length && <div className="table products-table"><div className="tr th"><span>Product</span><span>Current stock</span><span>Low-stock level</span><span>Status</span><span>Action</span></div>
          {visible.map((product)=><div className="tr" key={product.id}><span className="table-product"><i><Package size={17}/></i><b>{product.name}</b></span><span>{product.stock} {product.unit || 'piece'}</span><span>{product.minimumStock ?? 0}</span><span><i className={`status-pill ${Number(product.stock)<=Number(product.minimumStock ?? 0)?'warning-pill':''}`}>{Number(product.stock)<=Number(product.minimumStock ?? 0)?'Low stock':'In stock'}</i></span><span><button className="row-action" onClick={()=>{setSelected(product);setFormError('')}}>Adjust</button></span></div>)}
        </div>}
      </section>
      <section className="card movement-card">
        <div className="card-head"><div><h2>Recent stock movements</h2><p>Stock changes and their reasons</p></div></div>
        {!movements.length?<p className="data-message">No stock movements recorded.</p>:<div className="table movement-table"><div className="tr th"><span>Product</span><span>Type</span><span>Quantity</span><span>Reason</span><span>Date</span></div>{movements.slice(0,20).map((movement)=><div className="tr" key={movement.id}><span>{movement.productName}</span><span>{movement.type}</span><span className={Number(movement.quantity)<0?'danger-text':''}>{movement.quantity}</span><span>{movement.reason}</span><span>{timestampDate(movement.createdAt)?.toLocaleString('en-IN')||'—'}</span></div>)}</div>}
      </section>
      {selected && <div className="modal-backdrop" onClick={(event)=>{if(event.target===event.currentTarget)setSelected(null)}}>
        <form className="product-form" onSubmit={submit}><h2>Adjust {selected.name}</h2><p>Current stock: {selected.stock} {selected.unit || 'piece'}</p><label>Quantity change (use a negative number to reduce stock)<input required type="number" step="0.001" value={change} onChange={(event)=>setChange(event.target.value)}/></label><label>Reason<input required value={reason} onChange={(event)=>setReason(event.target.value)} placeholder="Restock, damage, correction…"/></label>{formError&&<p className="auth-error">{formError}</p>}<div className="form-actions"><button type="button" className="row-action" onClick={()=>setSelected(null)}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Save adjustment'}</button></div></form>
      </div>}
    </div>
  )
}

function PurchasesPage() {
  const { records: purchases, loading, error } = useRecords('purchases')
  const { records: products } = useRecords('products', 250)
  const { records: suppliers } = useRecords('suppliers')
  const [open, setOpen] = useState(false)
  const [supplierId, setSupplierId] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('paid')
  const [paymentMethod,setPaymentMethod]=useState('Cash')
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [items, setItems] = useState([])
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const supplier = suppliers.find((item)=>item.id===supplierId)
  function addItem() {
    const product = products.find((item)=>item.id===productId)
    if (!product || Number(quantity)<=0 || Number(unitCost)<0 || unitCost==='') { setFormError('Choose a product and enter a valid quantity and cost.'); return }
    setItems((current)=>[...current,{productId:product.id,name:product.name,quantity:Number(quantity),unitCost:Number(unitCost)}])
    setProductId('');setQuantity('');setUnitCost('');setFormError('')
  }
  async function submit(event) {
    event.preventDefault();setBusy(true);setFormError('')
    try {
      await completePurchase({supplierId,supplierName:supplier?.name,items,paymentStatus,paymentMethod,notes})
      setOpen(false);setItems([]);setNotes('');setSupplierId('');setPaymentMethod('Cash')
    } catch (cause) { setFormError(cause.message || 'Purchase could not be saved.') }
    finally { setBusy(false) }
  }
  return <div className="page">
    <div className="page-toolbar"><div className="muted-inline">Purchases: {purchases.length} recent records</div><button className="primary-btn" onClick={()=>{setOpen(true);setFormError('')}}><Plus size={17}/> Record purchase</button></div>
    {error&&<p className="data-message error">{error}</p>}
    <section className="card data-card">{loading?<p className="data-message">Loading purchases…</p>:!purchases.length?<p className="data-message">No purchases recorded yet.</p>:<div className="table entity-table"><div className="tr th"><span>Supplier</span><span>Date</span><span>Products</span><span>Total</span><span>Payment</span><span>Status</span></div>{purchases.map((purchase)=><div className="tr" key={purchase.id}><span>{purchase.supplierName}</span><span>{timestampDate(purchase.createdAt)?.toLocaleDateString('en-IN')||'—'}</span><span>{purchase.items?.length||0} items</span><strong>{money(purchase.total)}</strong><span>{purchase.paymentMethod||'Cash'}</span><span><i className="status-pill">{purchase.paymentStatus||'paid'}</i></span></div>)}</div>}</section>
    {open&&<div className="modal-backdrop" onClick={(event)=>{if(event.target===event.currentTarget)setOpen(false)}}><form className="product-form" onSubmit={submit}><h2>Record purchase</h2><label>Supplier<select value={supplierId} onChange={(event)=>setSupplierId(event.target.value)}><option value="">Unspecified supplier</option>{suppliers.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="form-grid"><label>Product<select value={productId} onChange={(event)=>setProductId(event.target.value)}><option value="">Select product</option>{products.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Quantity<input type="number" min="0.001" step="0.001" value={quantity} onChange={(event)=>setQuantity(event.target.value)}/></label><label>Unit purchase cost (₹)<input type="number" min="0" step="0.01" value={unitCost} onChange={(event)=>setUnitCost(event.target.value)}/></label><label>Payment method<select value={paymentMethod} onChange={(event)=>setPaymentMethod(event.target.value)}><option>Cash</option><option>UPI</option><option>Card</option><option>Other</option></select></label><label>Payment status<select value={paymentStatus} onChange={(event)=>setPaymentStatus(event.target.value)}><option value="paid">Paid</option><option value="pending">Pending</option><option value="partial">Partially paid</option></select></label></div><button type="button" className="row-action" onClick={addItem}>Add product to purchase</button>{items.map((item,index)=><div className="purchase-line" key={`${item.productId}-${index}`}><span>{item.name} · {item.quantity}</span><strong>{money(item.quantity*item.unitCost)}</strong><button type="button" className="remove" onClick={()=>setItems((current)=>current.filter((_,lineIndex)=>lineIndex!==index))}><Trash2 size={15}/></button></div>)}<label>Notes<input value={notes} onChange={(event)=>setNotes(event.target.value)}/></label>{formError&&<p className="auth-error">{formError}</p>}<div className="form-actions"><button type="button" className="row-action" onClick={()=>setOpen(false)}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Save purchase'}</button></div></form></div>}
  </div>
}

async function createInvoicePdf(sale, settings = {}, receiptHeight = 0) {
  const { jsPDF } = await import('jspdf')
  const paperSize = settings.invoicePaperSize || '80mm'
  const isA4 = paperSize === 'A4'
  const width = isA4 ? 210 : paperSize === '58mm' ? 58 : 80
  const margin = isA4 ? 18 : paperSize === '58mm' ? 3 : 5
  const items = Array.isArray(sale.items) ? sale.items : []
  const estimatedHeight = isA4 ? 297 : receiptHeight || Math.max(125, 112 + items.length * 17)
  const pdf = new jsPDF({ unit: 'mm', format: isA4 ? 'a4' : [width, estimatedHeight] })
  const right = width - margin
  const center = width / 2
  const rule = (y) => {
    pdf.setDrawColor(205, 214, 208)
    pdf.setLineWidth(0.25)
    pdf.line(margin, y, right, y)
  }
  const centered = (text, y, maxWidth, fontSize = 9) => {
    pdf.setFontSize(fontSize)
    const lines = pdf.splitTextToSize(String(text), maxWidth)
    pdf.text(lines, center, y, { align: 'center' })
    return y + lines.length * (fontSize * 0.42)
  }
  const date = timestampDate(sale.createdAt)?.toLocaleString('en-IN') || '—'
  const storeName = String(settings.shopName || 'FreshMart Grocery').trim()
  const initials = storeName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'GS'
  const currency = (value) => `Rs. ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  let y

  if (isA4) {
    const bannerY = 16
    const bannerHeight = 38
    pdf.setFillColor(36, 95, 73)
    pdf.roundedRect(margin, bannerY, width - margin * 2, bannerHeight, 3, 3, 'F')
    pdf.setFillColor(232, 243, 237)
    pdf.circle(margin + 13, bannerY + 19, 8, 'F')
    pdf.setTextColor(36, 95, 73)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.text(initials, margin + 13, bannerY + 20, { align: 'center' })
    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(18)
    const nameLines = pdf.splitTextToSize(storeName, 91)
    pdf.text(nameLines, margin + 27, bannerY + (nameLines.length > 1 ? 15 : 19))
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.text('GROCERY & RETAIL', margin + 27, bannerY + 30)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    pdf.text('INVOICE', right - 2, bannerY + 13, { align: 'right' })
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.text(String(sale.invoiceNumber || ''), right - 2, bannerY + 19, { align: 'right' })
    y = bannerY + bannerHeight + 7
    pdf.setTextColor(83, 96, 88)
    pdf.setFontSize(8)
    const details = [settings.address, settings.phone, settings.email, settings.gstin ? `GSTIN: ${settings.gstin}` : ''].filter(Boolean)
    details.forEach((detail) => {
      const lines = pdf.splitTextToSize(String(detail), width - margin * 2)
      pdf.text(lines, margin, y)
      y += lines.length * 4
    })
  } else {
    y = 6
    pdf.setFillColor(232, 243, 237)
    pdf.circle(center, y + 5, 5, 'F')
    pdf.setTextColor(36, 95, 73)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.text(initials, center, y + 6, { align: 'center' })
    y += 18
    pdf.setTextColor(30, 52, 40)
    pdf.setFont('helvetica', 'bold')
    y = centered(storeName, y, width - margin * 2, paperSize === '58mm' ? 11 : 13)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(83, 96, 88)
    const details = [settings.address, settings.phone, settings.email, settings.gstin ? `GSTIN: ${settings.gstin}` : ''].filter(Boolean)
    details.forEach((detail) => { y = centered(detail, y + 2, width - margin * 2, paperSize === '58mm' ? 7 : 8) })
  }

  y += isA4 ? 5 : 4
  rule(y)
  y += isA4 ? 10 : 6
  pdf.setTextColor(30, 52, 40)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(isA4 ? 13 : 9)
  pdf.text(settings.gstEnabled ? 'TAX INVOICE' : 'SALES INVOICE', margin, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(isA4 ? 10 : 8)
  pdf.text(isA4 ? `Date: ${date}` : `# ${sale.invoiceNumber || ''}`, right, y, { align: 'right' })
  y += isA4 ? 7 : 5
  pdf.setTextColor(83, 96, 88)
  if (!isA4) pdf.text(date, margin, y)
  else y -= 2
  if (sale.customerName) {
    y += isA4 ? 6 : 5
    pdf.text(`Customer: ${sale.customerName}`, margin, y)
  }
  if (sale.status === 'void') {
    y += isA4 ? 6 : 5
    pdf.setTextColor(170, 45, 45)
    pdf.setFont('helvetica', 'bold')
    pdf.text('VOID', right, y, { align: 'right' })
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(83, 96, 88)
  }
  y += isA4 ? 8 : 6
  rule(y)
  y += isA4 ? 8 : 6

  if (isA4) {
    const qtyX = 129
    const rateX = 158
    const amountX = right
    pdf.setFillColor(241, 246, 242)
    pdf.rect(margin, y - 5, width - margin * 2, 9, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(54, 75, 62)
    pdf.setFontSize(9)
    pdf.text('ITEM', margin + 2, y)
    pdf.text('QTY', qtyX, y, { align: 'right' })
    pdf.text('RATE', rateX, y, { align: 'right' })
    pdf.text('AMOUNT', amountX - 2, y, { align: 'right' })
    y += 9
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(42, 52, 46)
    items.forEach((item, index) => {
      const nameLines = pdf.splitTextToSize(String(item.name || 'Item'), qtyX - margin - 10)
      const rowHeight = Math.max(8, nameLines.length * 4.5 + 2)
      if (index % 2 === 1) {
        pdf.setFillColor(250, 251, 250)
        pdf.rect(margin, y - 5, width - margin * 2, rowHeight, 'F')
      }
      pdf.setFontSize(9)
      pdf.text(nameLines, margin + 2, y)
      pdf.setFontSize(8)
      pdf.setTextColor(83, 96, 88)
      pdf.text(String(item.quantity ?? 0), qtyX, y, { align: 'right' })
      pdf.text(currency(item.unitPrice), rateX, y, { align: 'right' })
      pdf.setTextColor(42, 52, 46)
      pdf.text(currency(item.lineTotal ?? Number(item.quantity || 0) * Number(item.unitPrice || 0)), amountX - 2, y, { align: 'right' })
      y += rowHeight
    })
  } else {
    const amountX = right
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(paperSize === '58mm' ? 7 : 8)
    pdf.setTextColor(83, 96, 88)
    pdf.text('ITEM', margin, y)
    pdf.text('AMOUNT', amountX, y, { align: 'right' })
    y += 5
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(42, 52, 46)
    items.forEach((item) => {
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(paperSize === '58mm' ? 8 : 9)
      const nameLines = pdf.splitTextToSize(String(item.name || 'Item'), width - margin * 2)
      pdf.text(nameLines, margin, y)
      y += nameLines.length * 4
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(paperSize === '58mm' ? 7 : 8)
      pdf.setTextColor(83, 96, 88)
      pdf.text(`${item.quantity ?? 0} x ${currency(item.unitPrice)}`, margin, y)
      pdf.setTextColor(42, 52, 46)
      pdf.text(currency(item.lineTotal ?? Number(item.quantity || 0) * Number(item.unitPrice || 0)), amountX, y, { align: 'right' })
      y += 6
    })
  }

  y += isA4 ? 4 : 2
  rule(y)
  y += isA4 ? 9 : 7
  const summaryX = isA4 ? width - 78 : margin
  const summaryRight = right
  const summaryRow = (label, value, options = {}) => {
    pdf.setFont('helvetica', options.bold ? 'bold' : 'normal')
    pdf.setFontSize(options.size || (isA4 ? 10 : paperSize === '58mm' ? 7 : 8))
    pdf.setTextColor(options.bold ? 30 : 83, options.bold ? 52 : 96, options.bold ? 40 : 88)
    pdf.text(label, summaryX, y)
    pdf.text(value, summaryRight, y, { align: 'right' })
    y += options.spacing || (isA4 ? 6 : 5)
  }
  summaryRow('Subtotal', currency(sale.subtotal))
  if (Number(sale.discount || 0) > 0) summaryRow('Discount', `-${currency(sale.discount)}`)
  if (Number(sale.tax || 0) > 0) summaryRow('Tax', currency(sale.tax))
  y += 1
  rule(y)
  y += isA4 ? 9 : 7
  summaryRow('TOTAL', currency(sale.total), { bold: true, size: isA4 ? 15 : paperSize === '58mm' ? 10 : 12, spacing: isA4 ? 9 : 8 })
  y += 1
  rule(y)
  y += isA4 ? 9 : 7
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(isA4 ? 9 : 8)
  pdf.setTextColor(83, 96, 88)
  pdf.text(`Payment: ${sale.paymentMethod || '—'}`, margin, y)
  y += isA4 ? 6 : 5
  pdf.text(`Received: ${currency(sale.amountReceived)}`, margin, y)
  y += isA4 ? 6 : 5
  pdf.text(`Change: ${currency(sale.change)}`, margin, y)
  y += isA4 ? 14 : 11
  rule(y)
  y += isA4 ? 10 : 8
  pdf.setTextColor(36, 95, 73)
  pdf.setFont('helvetica', 'bold')
  const footer = String(settings.invoiceFooter || '').trim() || 'Thank you for shopping!'
  y = centered(footer, y, width - margin * 2, isA4 ? 11 : paperSize === '58mm' ? 8 : 9)

  if (!isA4 && !receiptHeight) return createInvoicePdf(sale, settings, y + 11)
  return pdf
}

function BillHistoryPage() {
  const { records: sales, loading, error, setError } = useRecords('sales', 250)
  const [shopSettings,setShopSettings]=useState({})
  useEffect(()=>subscribeToShopSettings(setShopSettings,(cause)=>setError(cause.message||'Could not load receipt settings.')),[])
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState('')
  const visible = sales.filter((sale)=>`${sale.invoiceNumber} ${sale.customerName||''} ${sale.paymentMethod||''}`.toLowerCase().includes(search.toLowerCase()))
  async function download(sale) {
    const pdf = await createInvoicePdf(sale, shopSettings)
    pdf.save(`${sale.invoiceNumber}.pdf`)
  }
  async function printSale(sale) {
    const pdf = await createInvoicePdf(sale, shopSettings)
    pdf.autoPrint()
    window.open(pdf.output('bloburl'),'_blank','noopener')
  }
  async function cancel(sale) {
    if (!window.confirm(`Cancel ${sale.invoiceNumber} and restore its stock?`)) return
    const reason = window.prompt('Enter the cancellation reason:')
    if (!reason?.trim()) return
    setBusyId(sale.id);setError('')
    try { await voidSale({saleId:sale.id,reason}) } catch (cause) { setError(cause.message||'Could not cancel this bill.') }
    finally { setBusyId('') }
  }
  return <div className="page"><div className="page-toolbar"><div className="search-box"><Search size={17}/><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search invoice, customer, payment…"/></div></div>{error&&<p className="data-message error">{error}</p>}<section className="card data-card">{loading?<p className="data-message">Loading bills…</p>:!visible.length?<p className="data-message">No bills found.</p>:<div className="table entity-table"><div className="tr th"><span>Invoice</span><span>Date</span><span>Items</span><span>Payment</span><span>Total</span><span>Status / actions</span></div>{visible.map((sale)=><div className="tr" key={sale.id}><strong>{sale.invoiceNumber}</strong><span>{timestampDate(sale.createdAt)?.toLocaleString('en-IN')||'—'}</span><span>{sale.items?.length||0}</span><span>{sale.paymentMethod}</span><strong>{money(sale.total)}</strong><span className="history-actions"><i className={`status-pill ${sale.status==='void'?'void-pill':''}`}>{sale.status||'completed'}</i><button className="row-action" onClick={()=>download(sale)}>PDF</button><button className="row-action" onClick={()=>printSale(sale)}>Print</button>{sale.status!=='void'&&<button className="row-action" disabled={busyId===sale.id} onClick={()=>cancel(sale)}>{busyId===sale.id?'…':'Void'}</button>}</span></div>)}</div>}</section></div>
}

function ReportsPage() {
  const { records:sales, loading:salesLoading, error:salesError } = useRecords('sales', 500)
  const { records:expenses, loading:expensesLoading, error:expenseError } = useRecords('expenses', 500)
  const [startDate,setStartDate]=useState(()=>dateInputValue(new Date(new Date().getFullYear(),new Date().getMonth(),1)))
  const [endDate,setEndDate]=useState(()=>dateInputValue())
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T23:59:59.999`)
  const filteredSales=sales.filter((sale)=>{const date=timestampDate(sale.createdAt);return sale.status!=='void'&&date&&date>=start&&date<=end})
  const filteredExpenses=expenses.filter((expense)=>{const date=expense.date?new Date(`${expense.date}T12:00:00`):timestampDate(expense.createdAt);return date&&date>=start&&date<=end})
  const totalSales=filteredSales.reduce((sum,sale)=>sum+Number(sale.total||0),0)
  const taxes=filteredSales.reduce((sum,sale)=>sum+Number(sale.tax||0),0)
  const cost=filteredSales.reduce((sum,sale)=>sum+(sale.items||[]).reduce((amount,item)=>amount+Number(item.costPrice||0)*Number(item.quantity||0),0),0)
  const totalExpenses=filteredExpenses.reduce((sum,expense)=>sum+Number(expense.amount||0),0)
  const estimatedProfit=totalSales-taxes-cost-totalExpenses
  function exportCsv() {
    const rows=[['Type','Reference','Date','Amount','Payment'],...filteredSales.map((sale)=>['Sale',sale.invoiceNumber,timestampDate(sale.createdAt)?.toISOString()||'',sale.total,sale.paymentMethod]),...filteredExpenses.map((expense)=>['Expense',expense.title,expense.date||timestampDate(expense.createdAt)?.toISOString()||'',expense.amount,expense.paymentMethod])]
    const csv=rows.map((row)=>row.map((cell)=>`"${String(cell??'').replaceAll('"','""')}"`).join(',')).join('\r\n')
    const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));link.download='shop-report.csv';link.click();URL.revokeObjectURL(link.href)
  }
  return <div className="page"><div className="page-toolbar"><label className="date-filter">From <input type="date" value={startDate} onChange={(event)=>setStartDate(event.target.value)}/></label><label className="date-filter">To <input type="date" value={endDate} onChange={(event)=>setEndDate(event.target.value)}/></label><button className="primary-btn" onClick={exportCsv}><Download size={16}/> Export CSV</button></div>{(salesError||expenseError)&&<p className="data-message error">{salesError||expenseError}</p>}{(salesLoading||expensesLoading)&&<p className="data-message">Loading report…</p>}<div className="stat-grid"><StatCard title="Sales collected" value={money(totalSales)} icon={IndianRupee} tone="green"/><StatCard title="Bills" value={String(filteredSales.length)} icon={ReceiptText} tone="blue"/><StatCard title="Cost of goods" value={money(cost)} icon={Boxes} tone="purple"/><StatCard title="Expenses" value={money(totalExpenses)} icon={WalletCards} tone="orange"/></div><section className="card report-profit"><span>Estimated net profit (before tax)</span><strong>{money(estimatedProfit)}</strong><small>Sales collected minus recorded GST, product costs, and expenses. Results depend on complete cost data.</small></section></div>
}

function SettingsPage() {
  const [settings,setSettings]=useState({shopName:'',ownerName:'',phone:'',address:'',email:'',gstin:'',invoicePrefix:'INV',invoiceFooter:'Thank you for shopping!',gstEnabled:false,invoicePaperSize:'80mm'})
  const [saved,setSaved]=useState(false)
  const [saveError,setSaveError]=useState('')
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  useEffect(()=>subscribeToShopSettings((data)=>{setSettings((current)=>({...current,...data}));setLoading(false)},(cause)=>{setSaveError(cause.message||'Could not load settings.');setLoading(false)}),[])
  async function submit(event){event.preventDefault();setBusy(true);setSaveError('');setSaved(false);try{await saveShopSettings(settings);setSaved(true)}catch(cause){setSaveError(cause.message||'Could not save settings.')}finally{setBusy(false)}}
  return <div className="page"><section className="card settings-card"><form className="product-form settings-form" onSubmit={submit}><h2>Shop details and billing preferences</h2>{loading&&<p className="muted-inline">Loading your shop settings…</p>}<div className="form-grid">{[['shopName','Shop name'],['ownerName','Owner name'],['phone','Phone number'],['email','Email'],['address','Address'],['gstin','GSTIN'],['invoicePrefix','Invoice prefix'],['invoiceFooter','Invoice footer message']].map(([key,label])=><label key={key}>{label}<input value={settings[key]||''} onChange={(event)=>setSettings({...settings,[key]:event.target.value})}/></label>)}<label>Invoice paper size<select value={settings.invoicePaperSize||'80mm'} onChange={(event)=>setSettings({...settings,invoicePaperSize:event.target.value})}><option>58mm</option><option>80mm</option><option>A4</option></select></label><label className="checkbox-field"><input type="checkbox" checked={settings.gstEnabled===true} onChange={(event)=>setSettings({...settings,gstEnabled:event.target.checked})}/> Enable GST using each product’s GST rate</label></div>{saveError&&<p className="auth-error">{saveError}</p>}{saved&&<p className="auth-success">Settings saved.</p>}<div className="form-actions"><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Save settings'}</button></div></form></section></div>
}

export default function App() {
  const [active, setActive] = useState('Dashboard')
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(min-width: 761px) and (max-width: 1100px)').matches)
  useEffect(() => {
    const responsiveSidebar = window.matchMedia('(min-width: 761px) and (max-width: 1100px)')
    const syncSidebar = (event) => setCollapsed(event.matches)
    responsiveSidebar.addEventListener('change', syncSidebar)
    return () => responsiveSidebar.removeEventListener('change', syncSidebar)
  }, [])
  return (
    <div className="app-shell">
      <Sidebar active={active} setActive={setActive} collapsed={collapsed} setCollapsed={setCollapsed}/>
      <main className="main">
        <Topbar active={active}/>
        {active==='Dashboard'&&<Dashboard setActive={setActive}/>}
        {active==='New Bill'&&<Billing/>}
        {active==='Products'&&<ProductsPage/>}
        {active==='Inventory'&&<InventoryPage/>}
        {active==='Purchases'&&<PurchasesPage/>}
        {entityDefinitions[active]&&<EntityPage name={active}/>}
        {active==='Bill History'&&<BillHistoryPage/>}
        {active==='Reports'&&<ReportsPage/>}
        {active==='Settings'&&<SettingsPage/>}
      </main>
    </div>
  )
}
