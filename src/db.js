// ============================================================
// Couche base de données — mapping entre app (camelCase) et
// Supabase (snake_case). App.jsx ne connaît pas les noms de
// colonnes SQL, seulement les fonctions ci-dessous.
// ============================================================

import { supabase } from './supabase.js'

// ── App → DB ────────────────────────────────────────────────

function maintToDB({ id, date, type, km, cost, nextKm, nextDate, garage, notes }) {
  return {
    id,
    date: date || null,
    type: type || null,
    km: km ? parseInt(km) : null,
    cost: cost ? parseFloat(cost) : null,
    next_km: nextKm ? parseInt(nextKm) : null,
    next_date: nextDate || null,
    garage: garage || null,
    notes: notes || null,
  }
}

function tripToDB({ id, date, from, to, km, endKm, purpose }) {
  return {
    id,
    date: date || null,
    origin: from || null,
    destination: to || null,
    km: km ? parseFloat(km) : null,
    end_km: endKm ? parseInt(endKm) : null,
    purpose: purpose || null,
  }
}

function fuelToDB({ id, date, km, liters, pricePerLiter, totalPrice, full, station }) {
  return {
    id,
    date: date || null,
    km: km ? parseInt(km) : null,
    liters: liters ? parseFloat(liters) : null,
    price_per_liter: pricePerLiter ? parseFloat(pricePerLiter) : null,
    total_price: totalPrice ? parseFloat(totalPrice) : null,
    full_tank: full === true || full === 'true',
    station: station || null,
  }
}

function expenseToDB({ id, date, category, description, amount }) {
  return {
    id,
    date: date || null,
    category: category || null,
    description: description || null,
    amount: amount ? parseFloat(amount) : null,
  }
}

// ── DB → App ────────────────────────────────────────────────

const maintToApp = m => ({
  ...m,
  km: m.km ? String(m.km) : '',
  cost: m.cost ? String(m.cost) : '',
  nextKm: m.next_km ? String(m.next_km) : '',
  nextDate: m.next_date || '',
})

const tripToApp = t => ({
  ...t,
  from: t.origin || '',
  to: t.destination || '',
  km: t.km ? String(t.km) : '',
  endKm: t.end_km ? String(t.end_km) : '',
})

const fuelToApp = f => ({
  ...f,
  km: f.km ? String(f.km) : '',
  liters: f.liters ? String(f.liters) : '',
  pricePerLiter: f.price_per_liter ? String(f.price_per_liter) : '',
  totalPrice: f.total_price ? String(f.total_price) : '',
  full: f.full_tank,
})

const expenseToApp = e => ({
  ...e,
  amount: e.amount ? String(e.amount) : '',
})

// ── Public API ───────────────────────────────────────────────

export async function loadAll() {
  const [vRes, mRes, tRes, fRes, eRes] = await Promise.all([
    supabase.from('vehicle').select('*').eq('id', 'default').maybeSingle(),
    supabase.from('maintenance').select('*').order('date', { ascending: false }),
    supabase.from('trips').select('*').order('date', { ascending: false }),
    supabase.from('fuel').select('*').order('date', { ascending: false }),
    supabase.from('expenses').select('*').order('date', { ascending: false }),
  ])

  return {
    vehicle: vRes.data || { name: 'Mon Defender', model: '110', year: 2020, km: 0, plate: '' },
    maintenance: (mRes.data || []).map(maintToApp),
    trips: (tRes.data || []).map(tripToApp),
    fuel: (fRes.data || []).map(fuelToApp),
    expenses: (eRes.data || []).map(expenseToApp),
  }
}

export async function saveVehicle(v) {
  const { error } = await supabase.from('vehicle').upsert({
    id: 'default',
    name: v.name || '',
    model: v.model || '',
    year: v.year ? parseInt(v.year) : null,
    km: v.km ? parseInt(v.km) : 0,
    plate: v.plate || '',
    updated_at: new Date().toISOString(),
  })
  if (error) console.error('saveVehicle:', error)
}

export async function addRow(table, data) {
  const converters = {
    maintenance: maintToDB,
    trips: tripToDB,
    fuel: fuelToDB,
    expenses: expenseToDB,
  }
  const dbData = converters[table](data)
  const { error } = await supabase.from(table).insert(dbData)
  if (error) console.error(`addRow(${table}):`, error)
}

export async function deleteRow(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) console.error(`deleteRow(${table}):`, error)
}
