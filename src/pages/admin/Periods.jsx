import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';

export default function Periods() {
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showReadings, setShowReadings] = useState(null);
  const [apartments, setApartments] = useState([]);
  const [readingsForm, setReadingsForm] = useState({});
  const [readingsSearch, setReadingsSearch] = useState('');
  const [form, setForm] = useState({ code: '', total_common_amount_bs: '', general_total_consumption_m3: '', price_per_m3: '7.5' });
  const toast = useToast();

  const loadPeriods = async () => {
    try {
      const { data } = await client.get('/admin/periods');
      if (data.ok) setPeriods(data.items);
    } catch (err) {
      toast.error('Error al cargar periodos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPeriods(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const { data } = await client.post('/admin/periods', {
        code: form.code,
        common_amount: parseFloat(form.total_common_amount_bs) || 0,
        general_total_consumption_m3: parseFloat(form.general_total_consumption_m3) || 0,
        price_per_m3: parseFloat(form.price_per_m3) || 7.5,
      });
      if (data.ok) {
        toast.success('Periodo creado exitosamente');
        setShowCreate(false);
        setForm({ code: '', total_common_amount_bs: '', general_total_consumption_m3: '', price_per_m3: '7.5' });
        loadPeriods();
      } else {
        toast.error(data.message);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al crear periodo');
    }
  };

  const openReadings = async (period) => {
    setShowReadings(period);
    setReadingsSearch('');
    try {
      const { data } = await client.get('/admin/apartments');
      if (data.ok) {
        setApartments(data.items);
        const initialForm = {};
        data.items.forEach(a => {
          initialForm[a.id] = { previous_reading: '', current_reading: '' };
        });
        setReadingsForm(initialForm);
      }
    } catch (err) {
      toast.error('Error al cargar departamentos');
    }
  };

  const handleReadingChange = (aptId, field, value) => {
    setReadingsForm(prev => ({
      ...prev,
      [aptId]: { ...prev[aptId], [field]: value }
    }));
  };

  const submitReadings = async (e) => {
    e.preventDefault();
    const readings = apartments
      .filter(a => readingsForm[a.id]?.current_reading !== '')
      .map(a => ({
        apartment_id: a.id,
        previous_reading: parseFloat(readingsForm[a.id]?.previous_reading) || 0,
        current_reading: parseFloat(readingsForm[a.id]?.current_reading) || 0,
      }));

    if (readings.length === 0) {
      toast.warning('Ingresa al menos una lectura');
      return;
    }

    try {
      const { data } = await client.post(`/admin/periods/${showReadings.id}/readings`, { readings });
      if (data.ok) {
        toast.success(`${(data.saved || []).length} lecturas guardadas`);
        setShowReadings(null);
      } else {
        toast.error(data.message);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar lecturas');
    }
  };

  const handleSettle = async (periodId) => {
    if (!confirm('¿Deseas liquidar este periodo? Se calcularán los montos para cada departamento.')) return;
    try {
      const { data } = await client.post(`/admin/periods/${periodId}/settle`);
      if (data.ok) {
        toast.success('Periodo liquidado correctamente');
        loadPeriods();
      } else {
        toast.error(data.message);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al liquidar');
    }
  };

  const filteredApartments = apartments.filter(a => {
    if (!readingsSearch) return true;
    const q = readingsSearch.toLowerCase();
    return a.block.toLowerCase().includes(q) || a.number.toLowerCase().includes(q) || a.owner_name.toLowerCase().includes(q);
  });

  const handleDownloadGeneral = () => {
    if (!periods || periods.length === 0) return toast.warning('No hay periodos para exportar');
    
    const data = periods.map(p => ({
      'Periodo': p.code,
      'Estado': p.status === 'OPEN' ? 'Abierto' : 'Calculado',
      'Monto Total (Bs)': p.total_common_amount_bs,
      'Consumo General (m³)': p.general_total_consumption_m3,
      'Consumo Individual (m³)': p.total_individual_consumption_m3,
      'Diferencia (m³)': p.common_difference_m3,
      'Monto Distribuido (Bs)': p.distributed_total_bs || 0
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    
    const wscols = [
      {wch: 15}, // Periodo
      {wch: 15}, // Estado
      {wch: 20}, // Monto Total
      {wch: 22}, // Consumo General
      {wch: 22}, // Consumo Ind
      {wch: 18}, // Dif
      {wch: 22}  // Monto Distribuido
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Resumen Histórico');
    
    XLSX.writeFile(workbook, `Reporte_General_Agua.xlsx`);
  };

  if (loading) {
    return <div className="loading-overlay"><div className="spinner" /> Cargando periodos...</div>;
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Periodos de Facturación</h1>
          <p className="page-subtitle">Gestión de periodos mensuales y lecturas</p>
        </div>
        <div className="flex gap-2 items-center">
          <button className="btn btn-outline" onClick={handleDownloadGeneral}>
            <i className="bi bi-file-earmark-spreadsheet" style={{ color: 'var(--success)' }} /> Descargar Excel
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <i className="bi bi-plus-lg" /> Nuevo Periodo
          </button>
        </div>
      </div>

      <div className="glass-card" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div className="table-responsive">
          <table className="data-table">
            <caption className="sr-only">Lista de periodos de facturación</caption>
            <thead>
              <tr>
                <th scope="col">Periodo</th>
                <th scope="col" className="text-right">Monto Total (Bs)</th>
                <th scope="col" className="text-right">Consumo General (m³)</th>
                <th scope="col" className="text-right">Consumo Individual (m³)</th>
                <th scope="col" className="text-right">Diferencia (m³)</th>
                <th scope="col" className="text-center">Estado</th>
                <th scope="col" className="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {periods.length === 0 ? (
                <tr><td colSpan={7}><div className="empty-state"><i className="bi bi-calendar-x" /><p>No hay periodos creados</p></div></td></tr>
              ) : periods.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.code}</strong></td>
                  <td className="numeric">{p.total_common_amount_bs.toFixed(2)}</td>
                  <td className="numeric">{p.general_total_consumption_m3.toFixed(2)}</td>
                  <td className="numeric">{p.total_individual_consumption_m3.toFixed(2)}</td>
                  <td className="numeric">{p.common_difference_m3.toFixed(2)}</td>
                  <td className="center">
                    <span className={`status-badge ${p.status === 'OPEN' ? 'open' : 'calculated'}`}>
                      {p.status === 'OPEN' ? 'Abierto' : 'Calculado'}
                    </span>
                  </td>
                  <td className="center">
                    <div className="flex gap-2 items-center" style={{ justifyContent: 'center' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openReadings(p)} title="Cargar lecturas" aria-label={`Cargar lecturas del periodo ${p.code}`}>
                        <i className="bi bi-file-earmark-plus" />
                      </button>
                      {p.status === 'OPEN' && (
                        <button className="btn btn-success btn-sm" onClick={() => handleSettle(p.id)} title="Liquidar periodo" aria-label={`Liquidar el periodo ${p.code}`}>
                          <i className="bi bi-calculator" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Period Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="bi bi-calendar-plus" style={{ marginRight: '8px', color: 'var(--accent-primary)' }} />Nuevo Periodo</h3>
              <button className="btn btn-icon btn-outline" onClick={() => setShowCreate(false)}><i className="bi bi-x-lg" /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Código de Periodo</label>
                  <input className="form-control" type="month" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Monto Total a Repartir (Bs)</label>
                  <input className="form-control" type="number" step="0.01" placeholder="9600.00" value={form.total_common_amount_bs} onChange={e => setForm(p => ({ ...p, total_common_amount_bs: e.target.value }))} required />
                  <span className="text-xs text-muted mt-2" style={{ display: 'block' }}>Total de la factura del proveedor de agua</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Precio por m³ (Bs)</label>
                  <input className="form-control" type="number" step="0.01" value={form.price_per_m3} onChange={e => setForm(p => ({ ...p, price_per_m3: e.target.value }))} required />
                  <span className="text-xs text-muted mt-2" style={{ display: 'block' }}>Precio fijo por defecto: 7.5 Bs</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Consumo Total Medidores Generales (m³)</label>
                  <input className="form-control" type="number" step="0.01" placeholder="1280.00" value={form.general_total_consumption_m3} onChange={e => setForm(p => ({ ...p, general_total_consumption_m3: e.target.value }))} />
                  <span className="text-xs text-muted mt-2" style={{ display: 'block' }}>Suma de los 3 medidores generales</span>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowCreate(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary"><i className="bi bi-check-lg" /> Crear Periodo</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Readings Modal */}
      {showReadings && (
        <div className="modal-overlay" onClick={() => setShowReadings(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '90vh' }}>
            <div className="modal-header">
              <h3><i className="bi bi-speedometer2" style={{ marginRight: '8px', color: 'var(--accent-primary)' }} />Lecturas — {showReadings.code}</h3>
              <button className="btn btn-icon btn-outline" onClick={() => setShowReadings(null)}><i className="bi bi-x-lg" /></button>
            </div>
            <form onSubmit={submitReadings} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ padding: '0 24px 16px' }}>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="Buscar por bloque, departamento o nombre..." 
                  value={readingsSearch}
                  onChange={e => setReadingsSearch(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Dpto</th>
                      <th>Adjudicatario</th>
                      <th>Anterior (m³)</th>
                      <th>Actual (m³)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredApartments.length === 0 ? (
                      <tr><td colSpan={4} className="text-center">No se encontraron departamentos</td></tr>
                    ) : filteredApartments.map(a => (
                      <tr key={a.id}>
                        <td style={{ whiteSpace: 'nowrap' }}><strong>Blq {a.block}-{a.number}</strong></td>
                        <td className="text-sm" style={{ minWidth: '120px' }}>{a.owner_name}</td>
                        <td>
                          <input className="form-control" type="number" step="0.01" placeholder="0.00" value={readingsForm[a.id]?.previous_reading || ''} onChange={e => handleReadingChange(a.id, 'previous_reading', e.target.value)} style={{ minWidth: '80px', padding: '6px' }} />
                        </td>
                        <td>
                          <input className="form-control" type="number" step="0.01" placeholder="0.00" value={readingsForm[a.id]?.current_reading || ''} onChange={e => handleReadingChange(a.id, 'current_reading', e.target.value)} style={{ minWidth: '80px', padding: '6px' }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowReadings(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary"><i className="bi bi-save" /> Guardar Lecturas</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
