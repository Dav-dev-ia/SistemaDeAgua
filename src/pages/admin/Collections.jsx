import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/Modal';

export default function Collections() {
  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [allocations, setAllocations] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [payModal, setPayModal] = useState(null);
  const [payForm, setPayForm] = useState({ amount_bs: '', payment_method: 'EFECTIVO', reference: '' });
  const [detailModal, setDetailModal] = useState(null);
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
  }, [selectedPeriod, statusFilter, search]);

  const openDetail = (alloc) => setDetailModal(alloc);

  const FMT = (v) => `${Number(v).toFixed(2)} Bs`;
  const methodLabel = (m) => ({ EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia', QR: 'QR' }[m] || m);

  useEffect(() => {
    if (!payModal) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setPayModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [payModal]);

  const openPay = (alloc) => {
    setPayModal(alloc);
    setPayForm({ amount_bs: alloc.pending_amount_bs.toFixed(2), payment_method: 'EFECTIVO', reference: '' });
  };

  const submitPayment = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const { data } = await client.post(`/admin/allocations/${payModal.id}/payments`, {
        amount_bs: parseFloat(payForm.amount_bs),
        payment_method: payForm.payment_method,
        reference: payForm.reference,
      });
      if (data.ok) {
        toast.success(`Pago registrado — Dpto ${data.allocation?.apartment?.number || ''}`);
        setPayModal(null);
        const res = await client.get(`/admin/periods/${selectedPeriod}/allocations`, {
          params: { status: statusFilter || undefined, search: search || undefined }
        });
        if (res.data.ok) setAllocations(res.data.items || []);
      } else {
        toast.error(data.message);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al registrar pago');
    } finally {
      setSubmitting(false);
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

  const handleDownloadExcel = () => {
    if (!allocations || allocations.length === 0) return toast.warning('No hay datos para exportar');
    
    // Ordenar por bloque y número
    const sorted = [...allocations].sort((a, b) => {
      if (a.apartment?.block !== b.apartment?.block) return (a.apartment?.block || '').localeCompare(b.apartment?.block || '');
      return (a.apartment?.number || '').localeCompare(b.apartment?.number || '', undefined, { numeric: true });
    });

    const data = sorted.map(a => ({
      'Bloque': a.apartment?.block || '',
      'Dpto': a.apartment?.number || '',
      'Adjudicatario': a.apartment?.owner_name || '',
      'Consumo (m³)': a.consumption_m3,
      'Deuda (Bs)': a.amount_due_bs,
      'Pagado (Bs)': a.amount_paid_bs,
      'Pendiente (Bs)': a.pending_amount_bs,
      'Estado': a.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Ajustar anchos de columna (opcional, pero útil)
    const wscols = [
      {wch: 8}, // Bloque
      {wch: 8}, // Dpto
      {wch: 30}, // Adjudicatario
      {wch: 15}, // Consumo
      {wch: 12}, // Deuda
      {wch: 12}, // Pagado
      {wch: 15}, // Pendiente
      {wch: 15}  // Estado
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Cobros Mensuales');
    
    const pCode = periods.find(p => p.id === parseInt(selectedPeriod))?.code || 'reporte';
    XLSX.writeFile(workbook, `Cobros_Agua_${pCode}.xlsx`);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cobro Rápido</h1>
          <p className="page-subtitle">Busca un departamento y registra el pago en segundos</p>
        </div>
        {selectedPeriod && allocations.length > 0 && (
          <button className="btn btn-outline" onClick={handleDownloadExcel}>
            <i className="bi bi-file-earmark-spreadsheet" style={{ color: 'var(--success)' }} /> Descargar Excel
          </button>
        )}
      </div>

      <div className="filter-bar">
        <select className="form-control form-select" style={{ maxWidth: '220px' }} aria-label="Seleccionar periodo" value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)}>
          <option value="">Seleccionar periodo...</option>
          {periods.map(p => (
            <option key={p.id} value={p.id}>{p.code} — {p.status === 'CALCULATED' ? 'Calculado' : 'Abierto'}</option>
          ))}
        </select>
        <div className="search-bar" style={{ flex: 1 }}>
          <i className="bi bi-search" />
          <input className="form-control" placeholder="Buscar por nombre, departamento..." aria-label="Buscar recibo" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-control form-select" style={{ maxWidth: '180px' }} aria-label="Filtrar por estado" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
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

      <div className="glass-card" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div className="table-responsive">
          <table className="data-table">
            <caption className="sr-only">Deudas y cobros del periodo seleccionado</caption>
            <thead>
              <tr>
                <th scope="col">Bloque</th>
                <th scope="col">Dpto</th>
                <th scope="col">Adjudicatario</th>
                <th scope="col" className="text-right">Consumo (m³)</th>
                <th scope="col" className="text-right">Debe (Bs)</th>
                <th scope="col" className="text-right">Pagado (Bs)</th>
                <th scope="col" className="text-right">Pendiente (Bs)</th>
                <th scope="col" className="text-center">Estado</th>
                <th scope="col" className="text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9}><div className="loading-overlay"><div className="spinner" /></div></td></tr>
              ) : allocations.length === 0 ? (
                <tr><td colSpan={9}><div className="empty-state"><i className="bi bi-inbox" /><p>{!selectedPeriod ? 'Selecciona un periodo para ver los cobros' : 'No se encontraron resultados'}</p></div></td></tr>
              ) : allocations.map(a => (
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
                    <div className="flex gap-2 items-center" style={{ justifyContent: 'center' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openDetail(a)} title="Ver detalle e historial" aria-label={`Ver historial de ${a.apartment?.owner_name}`}>
                        <i className="bi bi-eye" />
                      </button>
                      {a.status !== 'PAGADO' ? (
                        <button className="btn btn-success btn-sm" onClick={() => openPay(a)}>
                          <i className="bi bi-cash-stack" /> Cobrar
                        </button>
                      ) : (
                        <span className="text-muted text-sm"><i className="bi bi-lock-fill" /> Completo</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Modal */}
      {payModal && (
        <Modal
          id="pay-modal-title"
          title={<><i className="bi bi-cash-stack" style={{ marginRight: '8px', color: 'var(--success)' }} />Registrar Pago</>}
          onClose={() => setPayModal(null)}
          footer={(
            <>
              <button type="button" className="btn btn-outline" onClick={() => setPayModal(null)}>Cancelar</button>
              <button type="submit" form="pay-form" className="btn btn-success"><i className="bi bi-check-lg" /> Confirmar Pago</button>
            </>
          )}
        >
          <form id="pay-form" onSubmit={submitPayment}>
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
                <label className="form-label" htmlFor="pay-amount">Monto a Pagar (Bs)</label>
                <input id="pay-amount" className="form-control" type="number" step="0.01" value={payForm.amount_bs} onChange={e => setPayForm(p => ({ ...p, amount_bs: e.target.value }))} required min="0.01" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="pay-method">Método de Pago</label>
                <select id="pay-method" className="form-control form-select" value={payForm.payment_method} onChange={e => setPayForm(p => ({ ...p, payment_method: e.target.value }))}>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="QR">QR</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="pay-ref">Referencia (opcional)</label>
                <input id="pay-ref" className="form-control" placeholder="N° de transferencia, recibo..." value={payForm.reference} onChange={e => setPayForm(p => ({ ...p, reference: e.target.value }))} />
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Detail / payment history modal */}
      {detailModal && (
        <Modal
          id="detail-modal-title"
          size="lg"
          title={<><i className="bi bi-receipt" style={{ marginRight: '8px', color: 'var(--accent-primary)' }} />Detalle del Recibo</>}
          onClose={() => setDetailModal(null)}
          footer={<button type="button" className="btn btn-outline" onClick={() => setDetailModal(null)}>Cerrar</button>}
        >
          <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: '16px' }}>
            <p className="font-semibold">Bloque {detailModal.apartment?.block} — Dpto {detailModal.apartment?.number}</p>
            <p className="text-sm text-muted">{detailModal.apartment?.owner_name}</p>
            <p className="text-sm text-muted">Periodo {detailModal.period?.code || ''}</p>
          </div>

          {detailModal.breakdown && (
            <>
              <p className="text-sm font-semibold mb-2">Desglose del cálculo</p>
              <div className="table-responsive" style={{ marginBottom: '16px' }}>
                <table className="data-table">
                  <tbody>
                    <tr><th scope="row">Precio por m³</th><td className="numeric">{detailModal.breakdown.price_per_m3} Bs</td></tr>
                    <tr><th scope="row">Consumo (m³)</th><td className="numeric">{detailModal.breakdown.consumption_m3}</td></tr>
                    <tr><th scope="row">Coeficiente</th><td className="numeric">{detailModal.breakdown.coefficient}</td></tr>
                    <tr><th scope="row">Consumo efectivo (m³)</th><td className="numeric">{detailModal.breakdown.effective_consumption_m3}</td></tr>
                    <tr><th scope="row">Participación</th><td className="numeric">{detailModal.breakdown.share_percent}%</td></tr>
                    <tr><th scope="row">Base consumo ({detailModal.breakdown.price_per_m3} × {detailModal.breakdown.consumption_m3})</th><td className="numeric">{detailModal.breakdown.base_bs} Bs</td></tr>
                    <tr><th scope="row">Parte común repartida</th><td className="numeric">{detailModal.breakdown.common_share_bs} Bs</td></tr>
                    <tr><th scope="row">Factura del inmueble</th><td className="numeric">{detailModal.breakdown.invoice_bs} Bs</td></tr>
                    {detailModal.breakdown.common_difference_m3 > 0 && (
                      <tr><th scope="row">Diferencia general vs. medidores</th><td className="numeric">{detailModal.breakdown.common_difference_m3} m³</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <p className="text-sm font-semibold mb-2">Historial de pagos {detailModal.payments.length > 0 ? `(${detailModal.payments.length})` : ''}</p>
          {detailModal.payments.length === 0 ? (
            <div className="empty-state" style={{ padding: '12px' }}>
              <i className="bi bi-inbox" />
              <p>Aún no hay pagos registrados para este recibo</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <caption className="sr-only">Pagos registrados para este recibo</caption>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Monto</th>
                    <th scope="col">Método</th>
                    <th scope="col">Referencia</th>
                  </tr>
                </thead>
                <tbody>
                  {detailModal.payments.map(p => (
                    <tr key={p.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{new Date(p.created_at).toLocaleString()}</td>
                      <td className="numeric font-semibold">{FMT(p.amount_bs)}</td>
                      <td><span className="status-badge open">{methodLabel(p.payment_method)}</span></td>
                      <td className="text-muted">{p.reference || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={1}>Total pagado</th>
                    <td className="numeric font-bold" style={{ color: 'var(--success)' }} colSpan={3}>{FMT(detailModal.amount_paid_bs)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
