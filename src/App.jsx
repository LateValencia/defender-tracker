import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts'
import { loadAll, saveVehicle, addRow, updateRow, deleteRow } from './db.js'

// ── Helpers ──────────────────────────────────────────────────

function fmt(n, dec = 0) {
  if (n == null || isNaN(parseFloat(n))) return '—'
  return parseFloat(n).toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}
function todayStr() { return new Date().toISOString().split('T')[0] }

function sortByDate(arr) {
  return [...arr].sort((a, b) => new Date(b.date) - new Date(a.date))
}

function computeCurrentKm(data) {
  const kms = [
    ...data.maintenance.map(m => parseFloat(m.km) || 0),
    ...(data.trips || []).map(t => parseFloat(t.endKm) || 0),
    ...data.fuel.map(f => parseFloat(f.km) || 0),
  ].filter(k => k > 0)
  return kms.length > 0 ? Math.max(...kms) : (parseFloat(data.vehicle.km) || 0)
}

function computeAvgConso(fuel) {
  const fulls = [...fuel]
    .filter(f => (f.full === true || f.full === 'true') && parseFloat(f.km) > 0 && parseFloat(f.liters) > 0)
    .sort((a, b) => parseFloat(a.km) - parseFloat(b.km))
  if (fulls.length < 2) return null
  let totalL = 0, totalKm = 0
  for (let i = 1; i < fulls.length; i++) {
    totalL += parseFloat(fulls[i].liters)
    totalKm += parseFloat(fulls[i].km) - parseFloat(fulls[i - 1].km)
  }
  return totalKm > 0 ? (totalL / totalKm * 100).toFixed(1) : null
}

function fuelChartData(fuel) {
  const fulls = [...fuel]
    .filter(f => (f.full === true || f.full === 'true') && parseFloat(f.km) > 0 && parseFloat(f.liters) > 0)
    .sort((a, b) => parseFloat(a.km) - parseFloat(b.km))
  return fulls.slice(1).map((f, i) => {
    const km = parseFloat(f.km) - parseFloat(fulls[i].km)
    const c = km > 0 ? parseFloat((parseFloat(f.liters) / km * 100).toFixed(1)) : null
    return { date: f.date?.slice(5) || '', conso: c }
  }).filter(d => d.conso)
}

function expenseByCat(expenses) {
  const cats = {}
  expenses.forEach(e => { const k = e.category || 'Autre'; cats[k] = (cats[k] || 0) + parseFloat(e.amount || 0) })
  return Object.entries(cats).map(([cat, total]) => ({ cat, total: Math.round(total) }))
}

function exportCSV(data) {
  const rows = [
    ['Type', 'Date', 'Description', 'Montant', 'Km', 'Notes'],
    ...data.maintenance.map(m => ['Entretien', m.date, m.type, m.cost, m.km, m.notes || '']),
    ...data.trips.map(t => ['Trajet', t.date, (t.from || '') + ' > ' + (t.to || ''), '', t.km, t.purpose || '']),
    ...data.fuel.map(f => ['Carburant', f.date, (f.liters || '') + 'L', f.totalPrice, f.km, f.station || '']),
    ...data.expenses.map(e => ['Depense', e.date, e.description || e.category || '', e.amount, '', '']),
  ]
  const csv = rows.map(r => r.map(c => '"' + String(c || '').replace(/"/g, '""') + '"').join(',')).join('\n')
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })),
    download: 'defender_journal.csv',
  })
  a.click()
}

const MAINT_TYPES = ['Vidange huile', 'Filtres', 'Freins avant', 'Freins arriere', 'Pneus', 'Courroie distribution', 'Controle technique', 'Revision generale', 'Batterie', 'Amortisseurs', 'Climatisation', 'Liquide de frein', 'Bougies', 'Autre']
const EXP_CATS = ['Assurance', 'Reparation', 'Accessoires', 'Peage', 'Parking', 'Amende', 'Carrosserie', 'Pneumatiques', 'Lavage', 'Autre']
const COLORS = ['#3B6D11', '#639922', '#0F6E56', '#1D9E75', '#185FA5', '#BA7517', '#993556']
const TTS = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 11, borderRadius: 6 }

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&display=swap');
  .df * { box-sizing: border-box; }
  .df { background: var(--bg); min-height: 100vh; min-height: 100dvh; color: var(--text); }
  .df-hdr {
    border-bottom: 1px solid var(--border);
    padding-top: calc(14px + env(safe-area-inset-top));
    padding-left: 16px; padding-right: 16px; padding-bottom: 0;
    background: var(--surface);
    position: sticky; top: 0; z-index: 10;
  }
  .df-hdr-top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; }
  .df-vname { font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:22px; letter-spacing:2px; text-transform:uppercase; line-height:1; }
  .df-vsub { font-size:11px; color:var(--text-3); letter-spacing:1px; margin-top:3px; }
  .df-vsub button { background:none; border:none; color:var(--accent); cursor:pointer; font-size:11px; text-decoration:underline; padding:0; }
  .df-km { text-align:right; }
  .df-km-n { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:28px; line-height:1; }
  .df-km-l { font-size:10px; color:var(--text-3); letter-spacing:1.5px; text-transform:uppercase; }
  .df-tabs { display:flex; overflow-x:auto; scrollbar-width:none; }
  .df-tabs::-webkit-scrollbar { display:none; }
  .df-tab { flex-shrink:0; padding:10px 13px; background:none; border:none; border-bottom:2px solid transparent; color:var(--text-3); cursor:pointer; font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:13px; letter-spacing:1px; text-transform:uppercase; position:relative; }
  .df-tab.on { color:var(--accent); border-bottom-color:var(--accent); }
  .df-badge { position:absolute; top:6px; right:6px; width:7px; height:7px; border-radius:50%; background:var(--danger); }
  .df-body { padding:14px 16px 32px; }
  .df-kpis { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; margin-bottom:14px; }
  .df-kpi { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:11px 13px; }
  .df-kpi-l { font-size:9px; color:var(--text-3); letter-spacing:1.5px; text-transform:uppercase; margin-bottom:4px; }
  .df-kpi-v { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:22px; color:var(--accent); line-height:1; }
  .df-kpi-u { font-size:11px; color:var(--text-2); margin-left:2px; }
  .df-sh { display:flex; justify-content:space-between; align-items:center; margin:14px 0 8px; }
  .df-st { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:13px; letter-spacing:1.5px; text-transform:uppercase; color:var(--text-2); }
  .df-btn { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:8px 14px; cursor:pointer; font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:12px; letter-spacing:1px; text-transform:uppercase; color:var(--text); }
  .df-btn.p { background:var(--success-bg); border-color:var(--accent-dim); color:var(--accent); }
  .df-del { background:none; border:none; color:var(--text-3); cursor:pointer; font-size:18px; padding:4px 8px; border-radius:4px; line-height:1; flex-shrink:0; }
  .df-del:hover { color:var(--danger); background:var(--danger-bg); }
  .df-b { display:inline-block; padding:2px 7px; font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:10px; letter-spacing:1px; text-transform:uppercase; border-radius:var(--radius); }
  .df-bg { background:var(--success-bg); color:var(--accent); }
  .df-ba { background:var(--warning-bg); color:var(--amber); }
  .df-br { background:var(--danger-bg); color:var(--danger); }
  .df-bn { background:var(--surface-2); color:var(--text-2); border:1px solid var(--border); }
  .df-alert { background:var(--warning-bg); border:1px solid #3d2800; border-left:3px solid var(--amber); border-radius:var(--radius); padding:10px 12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; }
  .df-at { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:14px; color:var(--amber); }
  .df-as { font-size:10px; color:var(--text-2); margin-top:2px; }
  .df-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:12px; }
  .df-stat { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:9px 8px; text-align:center; }
  .df-sv { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:18px; color:var(--accent); }
  .df-sl { font-size:9px; color:var(--text-3); letter-spacing:1px; text-transform:uppercase; margin-top:2px; }
  .df-card {
    background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg);
    padding:12px 14px; margin-bottom:8px;
    cursor:pointer; transition:border-color .15s;
  }
  .df-card:hover { border-color:var(--accent-dim); }
  .df-card-title { font-family:'Barlow Condensed',sans-serif; font-size:10px; letter-spacing:2px; text-transform:uppercase; color:var(--text-3); margin-bottom:8px; }
  .df-empty { border:1px dashed var(--border); border-radius:var(--radius); padding:28px; text-align:center; color:var(--text-3); font-size:12px; }
  .df-form-hdr {
    display:flex; align-items:center; gap:12px;
    padding-top:calc(12px + env(safe-area-inset-top));
    padding-left:16px; padding-right:16px; padding-bottom:12px;
    border-bottom:1px solid var(--border);
    background:var(--surface); position:sticky; top:0; z-index:10;
  }
  .df-form-back { background:none; border:none; color:var(--text-2); cursor:pointer; font-size:22px; padding:2px 6px; border-radius:4px; line-height:1; }
  .df-form-title { font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:17px; letter-spacing:2px; text-transform:uppercase; }
  .df-form-body { padding:16px; }
  .df-f { margin-bottom:14px; }
  .df-lbl { display:block; font-size:9px; color:var(--text-3); letter-spacing:1.5px; text-transform:uppercase; margin-bottom:6px; font-family:'Barlow Condensed',sans-serif; font-weight:600; }
  .df-in { width:100%; background:var(--surface-2); border:1px solid var(--border); border-radius:var(--radius); color:var(--text); padding:10px 11px; font-size:15px; outline:none; -webkit-appearance:none; appearance:none; }
  .df-in:focus { border-color:var(--accent-dim); }
  .df-2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .df-form-foot { display:flex; gap:10px; margin-top:20px; padding-top:14px; border-top:1px solid var(--border); }
  .df-form-foot .df-btn { flex:1; padding:12px; font-size:13px; text-align:center; }
  .df-foot { margin-top:16px; border-top:1px solid var(--border); padding-top:10px; display:flex; justify-content:space-between; align-items:center; }
  .df-mu { color:var(--text-3); font-size:10px; }
  .df-loader { display:flex; align-items:center; justify-content:center; min-height:200px; color:var(--text-3); font-family:'Barlow Condensed',sans-serif; letter-spacing:2px; text-transform:uppercase; font-size:13px; }
  .df-err { padding:20px; background:var(--danger-bg); border:1px solid var(--danger); border-radius:var(--radius); color:var(--danger); font-size:12px; margin:16px; }
  @media(max-width:420px){ .df-2{grid-template-columns:1fr;} }
`

export default function App() {
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('dashboard')
  const [formType, setFormType] = useState(null)
  const [form, setForm] = useState({})
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadAll().then(setData).catch(() => setError('Erreur de connexion Supabase.'))
  }, [])

  const currentKm = data ? computeCurrentKm(data) : 0

  const openForm = (type, existing = null) => {
    const defaults = {
      maintenance: { date: todayStr(), km: String(currentKm) },
      trip: { date: todayStr() },
      fuel: { date: todayStr(), km: String(currentKm), full: true },
      expense: { date: todayStr() },
      vehicle: { ...data.vehicle },
    }
    setFormType(type)
    setEditingId(existing ? existing.id : null)
    setForm(existing ? { ...existing } : (defaults[type] || { date: todayStr() }))
  }

  const closeForm = () => { setFormType(null); setForm({}); setEditingId(null) }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (formType === 'vehicle') {
        await saveVehicle(form)
        setData(p => ({ ...p, vehicle: { ...p.vehicle, ...form } }))
      } else {
        const keyMap = { maintenance: 'maintenance', trip: 'trips', fuel: 'fuel', expense: 'expenses' }
        const key = keyMap[formType]
        if (editingId) {
          await updateRow(key, editingId, { ...form, id: editingId })
          setData(p => ({ ...p, [key]: p[key].map(e => e.id === editingId ? { ...form, id: editingId } : e) }))
        } else {
          const entry = { id: Date.now().toString(), ...form }
          await addRow(key, entry)
          setData(p => ({ ...p, [key]: [entry, ...p[key]] }))
        }
      }
      closeForm()
    } catch (e) {
      alert('Erreur sauvegarde : ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const del = async (key, id, e) => {
    e.stopPropagation()
    if (!window.confirm('Supprimer cette entrée ?')) return
    await deleteRow(key, id)
    setData(p => ({ ...p, [key]: p[key].filter(x => x.id !== id) }))
  }

  if (error) return <div className="df"><div className="df-err">{error}</div></div>
  if (!data) return <div className="df"><div className="df-loader">Chargement...</div></div>

  const avgConso = computeAvgConso(data.fuel)
  const chartData = fuelChartData(data.fuel)
  const byCategory = expenseByCat(data.expenses)
  const yearTotal = data.expenses
    .filter(e => e.date?.startsWith(String(new Date().getFullYear())))
    .reduce((s, e) => s + parseFloat(e.amount || 0), 0)
  const alerts = data.maintenance.filter(m => {
    return (m.nextKm && parseFloat(m.nextKm) - currentKm < 2000) ||
           (m.nextDate && new Date(m.nextDate) < new Date(Date.now() + 30 * 86400000))
  })
  const kmLogged = data.trips.reduce((s, t) => s + parseFloat(t.km || 0), 0)
  const totalCosts = data.expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0) +
                     data.fuel.reduce((s, f) => s + parseFloat(f.totalPrice || 0), 0)
  const costPerKm = kmLogged > 100 ? (totalCosts / kmLogged).toFixed(2) : null

  const FORM_TITLES = { vehicle: 'Vehicule', maintenance: 'Nouvel entretien', trip: 'Nouveau trajet', fuel: 'Nouveau plein', expense: 'Nouvelle depense' }

  return (
    <>
      <style>{CSS}</style>
      <div className="df">
        <div className="df-hdr">
          <div className="df-hdr-top">
            <div>
              <div className="df-vname">{data.vehicle.name} · {data.vehicle.model}</div>
              <div className="df-vsub">
                {data.vehicle.year} · {data.vehicle.plate || 'Immat. non saisie'} ·{' '}
                <button onClick={() => openForm('vehicle')}>Modifier</button>
              </div>
            </div>
            <div className="df-km">
              <div className="df-km-n">{currentKm.toLocaleString('fr-FR')}</div>
              <div className="df-km-l">km au compteur</div>
            </div>
          </div>
          {!formType && (
            <div className="df-tabs">
              {[['dashboard','Bord'],['maintenance','Entretien'],['trips','Trajets'],['fuel','Carburant'],['expenses','Depenses']].map(([k, l]) => (
                <button key={k} className={'df-tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>
                  {l}
                  {k === 'maintenance' && alerts.length > 0 && <span className="df-badge" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {formType ? (
          <div>
            <div className="df-form-hdr">
              <button className="df-form-back" onClick={closeForm}>←</button>
              <div className="df-form-title">{editingId ? 'Modifier' : FORM_TITLES[formType]}</div>
            </div>
            <div className="df-form-body">
              {formType === 'maintenance' && <MaintForm form={form} set={setForm} />}
              {formType === 'trip' && <TripForm form={form} set={setForm} />}
              {formType === 'fuel' && <FuelForm form={form} set={setForm} />}
              {formType === 'expense' && <ExpForm form={form} set={setForm} />}
              {formType === 'vehicle' && <VehForm form={form} set={setForm} />}
              <div className="df-form-foot">
                <button className="df-btn" onClick={closeForm}>Annuler</button>
                <button className="df-btn p" onClick={handleSave} disabled={saving}>{saving ? 'Sauvegarde...' : 'Enregistrer'}</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="df-body">
            {tab === 'dashboard' && <DashTab data={data} alerts={alerts} avgConso={avgConso} yearTotal={yearTotal} currentKm={currentKm} costPerKm={costPerKm} kmLogged={kmLogged} />}
            {tab === 'maintenance' && <MaintTab rows={data.maintenance} currentKm={currentKm} onAdd={() => openForm('maintenance')} onEdit={e => openForm('maintenance', e)} onDel={(id, ev) => del('maintenance', id, ev)} />}
            {tab === 'trips' && <TripsTab rows={data.trips} onAdd={() => openForm('trip')} onEdit={e => openForm('trip', e)} onDel={(id, ev) => del('trips', id, ev)} />}
            {tab === 'fuel' && <FuelTab rows={data.fuel} avgConso={avgConso} chartData={chartData} onAdd={() => openForm('fuel')} onEdit={e => openForm('fuel', e)} onDel={(id, ev) => del('fuel', id, ev)} />}
            {tab === 'expenses' && <ExpTab rows={data.expenses} byCategory={byCategory} yearTotal={yearTotal} onAdd={() => openForm('expense')} onEdit={e => openForm('expense', e)} onDel={(id, ev) => del('expenses', id, ev)} />}
            <div className="df-foot">
              <span className="df-mu">Supabase PostgreSQL · Appuyer sur une carte pour modifier</span>
              <button className="df-btn" onClick={() => exportCSV(data)}>Export CSV</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ── TABS ─────────────────────────────────────────────────────

function DashTab({ data, alerts, avgConso, yearTotal, currentKm, costPerKm, kmLogged }) {
  const recent = [
    ...data.maintenance.map(e => ({ ...e, _t: 'Entretien', _d: e.type })),
    ...data.trips.map(e => ({ ...e, _t: 'Trajet', _d: (e.from || '-') + ' → ' + (e.to || '-') })),
    ...data.fuel.map(e => ({ ...e, _t: 'Carburant', _d: (e.liters || '?') + 'L · ' + (e.totalPrice || '?') + '€' })),
    ...data.expenses.map(e => ({ ...e, _t: 'Depense', _d: e.description || e.category || '-' })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6)
  const last = data.maintenance[0]
  return (
    <div>
      <div className="df-kpis">
        <div className="df-kpi"><div className="df-kpi-l">Km journaux</div><div className="df-kpi-v">{fmt(kmLogged)}<span className="df-kpi-u">km</span></div></div>
        <div className="df-kpi"><div className="df-kpi-l">Conso moy.</div><div className="df-kpi-v">{avgConso || '—'}<span className="df-kpi-u">{avgConso ? 'L/100' : ''}</span></div></div>
        <div className="df-kpi"><div className="df-kpi-l">Depenses {new Date().getFullYear()}</div><div className="df-kpi-v">{fmt(yearTotal)}<span className="df-kpi-u">€</span></div></div>
        <div className="df-kpi"><div className="df-kpi-l">Cout / km</div><div className="df-kpi-v">{costPerKm || '—'}<span className="df-kpi-u">{costPerKm ? '€' : ''}</span></div></div>
      </div>
      {alerts.length > 0 && (<>
        <div className="df-sh"><div className="df-st" style={{ color: 'var(--amber)' }}>⚠ Alertes entretien</div></div>
        {sortByDate(alerts).map(m => {
          const kl = m.nextKm ? parseFloat(m.nextKm) - currentKm : null
          return (
            <div key={m.id} className="df-alert">
              <div><div className="df-at">{m.type}</div><div className="df-as">{m.nextKm && 'A ' + parseInt(m.nextKm).toLocaleString('fr-FR') + ' km'}{m.nextKm && m.nextDate && ' · '}{m.nextDate}</div></div>
              {kl != null && <span className={'df-b ' + (kl < 0 ? 'df-br' : 'df-ba')}>{kl < 0 ? Math.abs(Math.round(kl)) + ' km dep.' : Math.round(kl) + ' km'}</span>}
            </div>
          )
        })}
      </>)}
      <div className="df-sh" style={{ marginTop: 14 }}><div className="df-st">Activite recente</div></div>
      {recent.length === 0
        ? <div className="df-empty">Aucune activite - commencer par renseigner le vehicule</div>
        : recent.map(e => (
          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-3)', fontSize: 11, minWidth: 80 }}>{e.date}</span>
            <span className="df-b df-bg" style={{ marginLeft: 8 }}>{e._t}</span>
            <span style={{ color: 'var(--text-2)', fontSize: 12, marginLeft: 10, flex: 1, textAlign: 'right' }}>{e._d}</span>
          </div>
        ))}
    </div>
  )
}

function MaintTab({ rows, currentKm, onAdd, onEdit, onDel }) {
  return (
    <div>
      <div className="df-sh"><div className="df-st">Entretiens ({rows.length})</div><button className="df-btn p" onClick={onAdd}>+ Ajouter</button></div>
      {rows.length === 0 ? <div className="df-empty">Aucun entretien enregistre</div> : sortByDate(rows).map(m => {
        const kl = m.nextKm ? parseFloat(m.nextKm) - currentKm : null
        return (
          <div key={m.id} className="df-card" onClick={() => onEdit(m)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 16 }}>{m.type}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{m.date}{m.km ? ' · ' + parseInt(m.km).toLocaleString('fr-FR') + ' km' : ''}{m.garage ? ' · ' + m.garage : ''}</div>
              </div>
              <button className="df-del" onClick={e => onDel(m.id, e)}>×</button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {m.cost && <span className="df-b df-bg">{fmt(m.cost, 2)} €</span>}
              {m.nextKm && <span className={'df-b ' + (kl < 0 ? 'df-br' : kl < 2000 ? 'df-ba' : 'df-bg')}>Prochain : {parseInt(m.nextKm).toLocaleString('fr-FR')} km</span>}
              {m.nextDate && <span className="df-b df-bn">{m.nextDate}</span>}
            </div>
            {m.notes && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, fontStyle: 'italic' }}>{m.notes}</div>}
          </div>
        )
      })}
    </div>
  )
}

function TripsTab({ rows, onAdd, onEdit, onDel }) {
  const now = new Date()
  const ym = now.toISOString().slice(0, 7)
  const yr = String(now.getFullYear())
  const kmM = rows.filter(t => t.date?.slice(0, 7) === ym).reduce((s, t) => s + parseFloat(t.km || 0), 0)
  const kmY = rows.filter(t => t.date?.startsWith(yr)).reduce((s, t) => s + parseFloat(t.km || 0), 0)
  const kmT = rows.reduce((s, t) => s + parseFloat(t.km || 0), 0)
  return (
    <div>
      <div className="df-sh"><div className="df-st">Trajets ({rows.length})</div><button className="df-btn p" onClick={onAdd}>+ Ajouter</button></div>
      <div className="df-stats">
        <div className="df-stat"><div className="df-sv">{fmt(kmM)}</div><div className="df-sl">Ce mois</div></div>
        <div className="df-stat"><div className="df-sv">{fmt(kmY)}</div><div className="df-sl">{yr}</div></div>
        <div className="df-stat"><div className="df-sv">{fmt(kmT)}</div><div className="df-sl">Total</div></div>
      </div>
      {rows.length === 0 ? <div className="df-empty">Aucun trajet enregistre</div> : sortByDate(rows).map(t => (
        <div key={t.id} className="df-card" onClick={() => onEdit(t)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 15 }}>{t.from || '—'} → {t.to || '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{t.date}{t.purpose ? ' · ' + t.purpose : ''}</div>
            </div>
            <button className="df-del" onClick={e => onDel(t.id, e)}>×</button>
          </div>
          <div style={{ marginTop: 6 }}><span className="df-b df-bg">{fmt(t.km)} km</span></div>
        </div>
      ))}
    </div>
  )
}

function FuelTab({ rows, avgConso, chartData, onAdd, onEdit, onDel }) {
  const totalL = rows.reduce((s, f) => s + parseFloat(f.liters || 0), 0)
  const totalC = rows.reduce((s, f) => s + parseFloat(f.totalPrice || 0), 0)
  const lastFill = sortByDate(rows)[0]
  return (
    <div>
      <div className="df-sh"><div className="df-st">Carburant ({rows.length})</div><button className="df-btn p" onClick={onAdd}>+ Ajouter</button></div>
      <div className="df-stats">
        <div className="df-stat"><div className="df-sv">{avgConso || '—'}</div><div className="df-sl">L/100km</div></div>
        <div className="df-stat"><div className="df-sv">{fmt(totalL)}</div><div className="df-sl">Litres</div></div>
        <div className="df-stat"><div className="df-sv">{fmt(totalC)} €</div><div className="df-sl">Cout</div></div>
      </div>
      {chartData.length > 1 && (
        <div className="df-card" style={{ cursor: 'default' }} onClick={e => e.stopPropagation()}>
          <div className="df-card-title">Consommation L/100km</div>
          <ResponsiveContainer width="100%" height={100}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fill: 'var(--text-3)', fontSize: 9 }} />
              <YAxis tick={{ fill: 'var(--text-3)', fontSize: 9 }} domain={['auto', 'auto']} />
              <Tooltip contentStyle={TTS} />
              <Line type="monotone" dataKey="conso" stroke="#639922" strokeWidth={2} dot={{ fill: '#639922', r: 3 }} name="L/100km" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {rows.length === 0 ? <div className="df-empty">Aucun plein enregistre</div> : sortByDate(rows).map(f => (
        <div key={f.id} className="df-card" onClick={() => onEdit(f)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 15 }}>
                {f.liters ? parseFloat(f.liters).toFixed(1) + ' L' : '—'} · {f.totalPrice ? parseFloat(f.totalPrice).toFixed(2) + ' €' : '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                {f.date}{f.km ? ' · ' + parseInt(f.km).toLocaleString('fr-FR') + ' km' : ''}{f.station ? ' · ' + f.station : ''}
              </div>
            </div>
            <button className="df-del" onClick={e => onDel(f.id, e)}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {f.pricePerLiter && <span className="df-b df-bn">{parseFloat(f.pricePerLiter).toFixed(3)} €/L</span>}
            {(f.full === true || f.full === 'true') ? <span className="df-b df-bg">Plein complet</span> : <span className="df-b df-bn">Partiel</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function ExpTab({ rows, byCategory, yearTotal, onAdd, onEdit, onDel }) {
  const total = rows.reduce((s, e) => s + parseFloat(e.amount || 0), 0)
  return (
    <div>
      <div className="df-sh"><div className="df-st">Depenses ({rows.length})</div><button className="df-btn p" onClick={onAdd}>+ Ajouter</button></div>
      <div className="df-stats">
        <div className="df-stat"><div className="df-sv">{fmt(yearTotal)} €</div><div className="df-sl">{new Date().getFullYear()}</div></div>
        <div className="df-stat"><div className="df-sv">{fmt(total)} €</div><div className="df-sl">Total</div></div>
        <div className="df-stat"><div className="df-sv">{byCategory.length}</div><div className="df-sl">Categories</div></div>
      </div>
      {byCategory.length > 1 && (
        <div className="df-card" style={{ cursor: 'default' }} onClick={e => e.stopPropagation()}>
          <div className="df-card-title">Par categorie (€)</div>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={byCategory} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <XAxis dataKey="cat" tick={{ fill: 'var(--text-3)', fontSize: 9 }} />
              <YAxis tick={{ fill: 'var(--text-3)', fontSize: 9 }} />
              <Tooltip contentStyle={TTS} formatter={v => [v + ' €', 'Montant']} />
              <Bar dataKey="total" radius={[3, 3, 0, 0]}>{byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {rows.length === 0 ? <div className="df-empty">Aucune depense enregistree</div> : sortByDate(rows).map(e => (
        <div key={e.id} className="df-card" onClick={() => onEdit(e)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 15 }}>{e.description || e.category || '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{e.date}</div>
            </div>
            <button className="df-del" onClick={ev => onDel(e.id, ev)}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <span className="df-b df-bg">{parseFloat(e.amount || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
            {e.category && <span className="df-b df-bn">{e.category}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── FORMS ────────────────────────────────────────────────────

function F({ label, children }) { return <div className="df-f"><label className="df-lbl">{label}</label>{children}</div> }
function I(props) { return <input className="df-in" {...props} /> }
function Sel({ children, ...p }) { return <select className="df-in" {...p}>{children}</select> }

function MaintForm({ form, set }) {
  const u = k => e => set(p => ({ ...p, [k]: e.target.value }))
  return (<>
    <div className="df-2">
      <F label="Date"><I type="date" value={form.date || ''} onChange={u('date')} /></F>
      <F label="Type"><Sel value={form.type || ''} onChange={u('type')}><option value=''>Selectionner...</option>{MAINT_TYPES.map(t => <option key={t}>{t}</option>)}</Sel></F>
    </div>
    <div className="df-2">
      <F label="Km compteur"><I type="number" inputMode="numeric" placeholder="45000" value={form.km || ''} onChange={u('km')} /></F>
      <F label="Cout (€)"><I type="number" inputMode="decimal" step="0.01" placeholder="180.00" value={form.cost || ''} onChange={u('cost')} /></F>
    </div>
    <div className="df-2">
      <F label="Prochain km"><I type="number" inputMode="numeric" placeholder="60000" value={form.nextKm || ''} onChange={u('nextKm')} /></F>
      <F label="Prochaine date"><I type="date" value={form.nextDate || ''} onChange={u('nextDate')} /></F>
    </div>
    <F label="Garage"><I type="text" placeholder="Nom du garage..." value={form.garage || ''} onChange={u('garage')} /></F>
    <F label="Notes"><textarea className="df-in" rows={2} placeholder="Observations..." value={form.notes || ''} onChange={u('notes')} style={{ resize: 'vertical' }} /></F>
  </>)
}

function TripForm({ form, set }) {
  const u = k => e => set(p => ({ ...p, [k]: e.target.value }))
  return (<>
    <F label="Date"><I type="date" value={form.date || ''} onChange={u('date')} /></F>
    <div className="df-2">
      <F label="Depart"><I type="text" placeholder="Mouvaux" value={form.from || ''} onChange={u('from')} /></F>
      <F label="Arrivee"><I type="text" placeholder="Destination" value={form.to || ''} onChange={u('to')} /></F>
    </div>
    <div className="df-2">
      <F label="Distance (km)"><I type="number" inputMode="numeric" placeholder="300" value={form.km || ''} onChange={u('km')} /></F>
      <F label="Km compteur fin"><I type="number" inputMode="numeric" placeholder="45300" value={form.endKm || ''} onChange={u('endKm')} /></F>
    </div>
    <F label="Objet"><I type="text" placeholder="Weekend, pro, vacances..." value={form.purpose || ''} onChange={u('purpose')} /></F>
  </>)
}

function FuelForm({ form, set }) {
  const u = k => v => set(p => ({ ...p, [k]: v }))
  const onL = e => {
    const l = parseFloat(e.target.value), p = parseFloat(form.pricePerLiter)
    set(prev => ({ ...prev, liters: e.target.value, totalPrice: (!isNaN(l) && !isNaN(p)) ? (l * p).toFixed(2) : prev.totalPrice }))
  }
  const onP = e => {
    const l = parseFloat(form.liters), p = parseFloat(e.target.value)
    set(prev => ({ ...prev, pricePerLiter: e.target.value, totalPrice: (!isNaN(l) && !isNaN(p)) ? (l * p).toFixed(2) : prev.totalPrice }))
  }
  return (<>
    <div className="df-2">
      <F label="Date"><I type="date" value={form.date || ''} onChange={e => u('date')(e.target.value)} /></F>
      <F label="Km compteur"><I type="number" inputMode="numeric" placeholder="45000" value={form.km || ''} onChange={e => u('km')(e.target.value)} /></F>
    </div>
    <div className="df-2">
      <F label="Litres"><I type="number" inputMode="decimal" step="0.01" placeholder="65.00" value={form.liters || ''} onChange={onL} /></F>
      <F label="Prix/litre (€)"><I type="number" inputMode="decimal" step="0.001" placeholder="1.859" value={form.pricePerLiter || ''} onChange={onP} /></F>
    </div>
    <div className="df-2">
      <F label="Total (€) — auto"><I type="number" inputMode="decimal" step="0.01" value={form.totalPrice || ''} onChange={e => u('totalPrice')(e.target.value)} /></F>
      <F label="Plein complet ?">
        <Sel value={form.full === false || form.full === 'false' ? 'false' : 'true'} onChange={e => u('full')(e.target.value !== 'false')}>
          <option value="true">Oui — plein complet</option>
          <option value="false">Non — partiel</option>
        </Sel>
      </F>
    </div>
    <F label="Station"><I type="text" placeholder="Total, BP, Leclerc..." value={form.station || ''} onChange={e => u('station')(e.target.value)} /></F>
  </>)
}

function ExpForm({ form, set }) {
  const u = k => e => set(p => ({ ...p, [k]: e.target.value }))
  return (<>
    <div className="df-2">
      <F label="Date"><I type="date" value={form.date || ''} onChange={u('date')} /></F>
      <F label="Categorie"><Sel value={form.category || ''} onChange={u('category')}><option value=''>Selectionner...</option>{EXP_CATS.map(c => <option key={c}>{c}</option>)}</Sel></F>
    </div>
    <F label="Description"><I type="text" placeholder="Detail de la depense..." value={form.description || ''} onChange={u('description')} /></F>
    <F label="Montant (€)"><I type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={form.amount || ''} onChange={u('amount')} /></F>
  </>)
}

function VehForm({ form, set }) {
  const u = k => e => set(p => ({ ...p, [k]: e.target.value }))
  return (<>
    <div className="df-2">
      <F label="Nom"><I type="text" placeholder="Mon Defender" value={form.name || ''} onChange={u('name')} /></F>
      <F label="Modele"><I type="text" placeholder="90 / 110 / 130" value={form.model || ''} onChange={u('model')} /></F>
    </div>
    <div className="df-2">
      <F label="Annee"><I type="number" inputMode="numeric" placeholder="1996" value={form.year || ''} onChange={u('year')} /></F>
      <F label="Immatriculation"><I type="text" placeholder="AB-123-CD" value={form.plate || ''} onChange={u('plate')} /></F>
    </div>
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px', fontSize: 11, color: 'var(--text-3)' }}>
      Le kilométrage est calculé automatiquement depuis tes relevés (carburant, entretien, trajets).
    </div>
  </>)
}
