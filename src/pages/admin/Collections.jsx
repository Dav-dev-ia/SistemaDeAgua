import { useState, useEffect } from 'react';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';

export default function Collections() {
  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [allocations, setAllocations] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [payModal, setPayModal] = useState(null);
  const [payForm, setPayForm] = useState({ amount_bs: '', payment_method: 'EFECTIVO', reference: '' });
  const toast = useToast();

  useEffect(() => {
    client.get('/admin/periods').then(({ data }) => {
      if (data.ok) {
        const items = data.items || [];
        setPeriods(items);
        const calculated = items.find(p => p.status === 'CALCULATED');
        if (calculated) setSelectedPeriod(String(calculated.id));
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedPeriod) { setAllocations([]); return; }
    setLoading(true);
    client.get(`/admin/periods/${selectedPeriod}/allocations`, {
      params: { status: statusFilter || undefined, search: search || undefined }
    }).then(({ data }) => {
      if (data.ok) setAllocations(data.items || []);
    }).finally(() => setLoading(false));
  }, [selectedPeriod, statusFilter]);

  const filtered = allocations.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.apartment?.owner_name?.toLowerCase().includes(q) ||
      a.apartment?.number?.toLowerCase().includes(q) ||
      a.apartment?.block?.toLowerCase().includes(q);
  });

  const openPay = (alloc) => {
    setPayModal(alloc);
    setPayForm({ amount_bs: alloc.pending_amount_bs.toFixed(2), payment_method: 'EFECTIVO', reference: '' });
  };

  const submitPayment = async (e) => {
    e.preventDefault();
    try {
      const { data } = await client.post(`/admin/allocations/${payModal.id}/payments`, {
        amount_bs: parseFloat(payForm.amount_bs),
        payment_method: payForm.payment_method,
        reference: payForm.reference,
      });
      if (data.ok) {
        toast.success(`Pago registrado — Dpto ${data.allocation?.apartment?.number || ''}`);
        setPayModal(null);
        // Refresh allocations
        const res = await client.get(`/admin/periods/${selectedPeriod}/allocations`);
        if (res.data.ok) setAllocations(res.data.items || []);
      } else {
        toast.error(data.message);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al registrar pago');
    }
  };

  const stats = {
    total: allocations.length,
    pending: allocations.filter(a => a.status === 'PENDIENTE').length,
    partial: allocations.filter(a => a.status === 'PARCIAL').length,
    paid: allocations.filter(a => a.status === 'PAGADO').length,
    totalDue: allocations.reduce((s, a) => s + a.amount_due_bs, 0),
    totalPaid: allocations.reduce((s, a) => s + a.amount_paid_bs, 0),
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cobro Rápido</h1>
          <p className="page-subtitle">Busca un departamento y registra el pago en segundos</p>
        </div>
      </div>

      <div className="filter-bar">
        <select className="form-control form-select" style={{ maxWidth: '220px' }} value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)}>
          <option value="">Seleccionar periodo...</option>
          {periods.map(p => (
            <option key={p.id} value={p.id}>{p.code} — {p.status === 'CALCULATED' ? 'Calculado' : 'Abierto'}</option>
          ))}
        </select>
        <div className="search-bar" style={{ flex: 1 }}>
          <i className="bi bi-search" />
          <input className="form-control" placeholder="Buscar por nombre, departamento..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-control form-select" style={{ maxWidth: '180px' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="PENDIENTE">Pendiente</option>
          <option value="PARCIAL">Parcial</option>
          <option value="PAGADO">Pagado</option>
        </select>
      </div>

      {selectedPeriod && allocations.length > 0 && (
        <div className="kpi-grid" style={{ marginBottom: '20px' }}>
          <div className="kpi-card">
            <div className="kpi-icon warning"><i className="bi bi-clock-history" /></div>
            <div className="kpi-info"><div className="kpi-label">Pendientes</div><div className="kpi-value">{stats.pending}</div></div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon info"><i className="bi bi-pie-chart" /></div>
            <div className="kpi-info"><div className="kpi-label">Parciales</div><div className="kpi-value">{stats.partial}</div></div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon success"><i className="bi bi-check-circle" /></div>
            <div className="kpi-info"><div className="kpi-label">Pagados</div><div className="kpi-value">{stats.paid}</div></div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon primary"><i className="bi bi-cash-coin" /></div>
            <div className="kpi-info"><div className="kpi-label">Recaudado</div><div className="kpi-value">{stats.totalPaid.toFixed(2)} <span style={{ fontSize: '0.55em', fontWeight: 500 }}>Bs</span></div></div>
          </div>
        </div>
      )}

      <div className="glass-card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bloque</th>
                <th>Dpto</th>
                <th>Adjudicatario</th>
                <th className="text-right">Consumo (m³)</th>
                <th className="text-right">Debe (Bs)</th>
                <th className="text-right">Pagado (Bs)</th>
                <th className="text-right">Pendiente (Bs)</th>
                <th className="text-center">Estado</th>
                <th className="text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9}><div className="loading-overlay"><div className="spinner" /></div></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9}><div className="empty-state"><i className="bi bi-inbox" /><p>{!selectedPeriod ? 'Selecciona un periodo para ver los cobros' : 'No se encontraron resultados'}</p></div></td></tr>
              ) : filtered.map(a => (
                <tr key={a.id}>
                  <td><span className="status-badge open">Blq {a.apartment?.block}</span></td>
                  <td><strong>{a.apartment?.number}</strong></td>
                  <td>{a.apartment?.owner_name}</td>
                  <td className="numeric">{a.consumption_m3.toFixed(2)}</td>
                  <td className="numeric font-semibold">{a.amount_due_bs.toFixed(2)}</td>
                  <td className="numeric" style={{ color: 'var(--success)' }}>{a.amount_paid_bs.toFixed(2)}</td>
                  <td className="numeric font-bold" style={{ color: a.pending_amount_bs > 0 ? 'var(--danger)' : 'var(--success)' }}>
                    {a.pending_amount_bs.toFixed(2)}
                  </td>
                  <td className="center">
                    <span className={`status-badge ${a.status === 'PAGADO' ? 'paid' : a.status === 'PARCIAL' ? 'partial' : 'pending'}`}>
                      <i className={`bi bi-${a.status === 'PAGADO' ? 'check-circle-fill' : a.status === 'PARCIAL' ? 'pie-chart-fill' : 'clock-history'}`} />
                      {a.status === 'PAGADO' ? 'Pagado' : a.status === 'PARCIAL' ? 'Parcial' : 'Pendiente'}
                    </span>
                  </td>
                  <td className="center">
                    {a.status !== 'PAGADO' ? (
                      <button className="btn btn-success btn-sm" onClick={() => openPay(a)}>
                        <i className="bi bi-cash-stack" /> Cobrar
                      </button>
                    ) : (
                      <span className="text-muted text-sm"><i className="bi bi-lock-fill" /> Completo</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Modal */}
      {payModal && (
        <div className="modal-overlay" onClick={() => setPayModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="bi bi-cash-stack" style={{ marginRight: '8px', color: 'var(--success)' }} />Registrar Pago</h3>
              <button className="btn btn-icon btn-outline" onClick={() => setPayModal(null)}><i className="bi bi-x-lg" /></button>
            </div>
            <form onSubmit={submitPayment}>
              <div className="modal-body">
                <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: '20px' }}>
                  <p className="text-sm"><strong>Bloque {payModal.apartment?.block} — Dpto {payModal.apartment?.number}</strong></p>
                  <p className="text-sm text-muted">{payModal.apartment?.owner_name}</p>
                  <div className="flex justify-between mt-2">
                    <span className="text-sm">Debe: <strong>{payModal.amount_due_bs.toFixed(2)} Bs</strong></span>
                    <span className="text-sm" style={{ color: 'var(--danger)' }}>Pendiente: <strong>{payModal.pending_amount_bs.toFixed(2)} Bs</strong></span>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Monto a Pagar (Bs)</label>
                  <input className="form-control" type="number" step="0.01" value={payForm.amount_bs} onChange={e => setPayForm(p => ({ ...p, amount_bs: e.target.value }))} required min="0.01" />
                </div>
                <div className="form-group">
                  <label className="form-label">Método de Pago</label>
                  <select className="form-control form-select" value={payForm.payment_method} onChange={e => setPayForm(p => ({ ...p, payment_method: e.target.value }))}>
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="QR">QR</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Referencia (opcional)</label>
                  <input className="form-control" placeholder="N° de transferencia, recibo..." value={payForm.reference} onChange={e => setPayForm(p => ({ ...p, reference: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setPayModal(null)}>Cancelar</button>
                <button type="submit" className="btn btn-success"><i className="bi bi-check-lg" /> Confirmar Pago</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
