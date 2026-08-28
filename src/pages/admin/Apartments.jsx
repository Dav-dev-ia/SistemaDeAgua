import { useState, useEffect } from 'react';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';

export default function Apartments() {
  const [apartments, setApartments] = useState([]);
  const [search, setSearch] = useState('');
  const [blocks, setBlocks] = useState([]);
  const [blockFilter, setBlockFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ block: '', number: '', owner_name: '', phone: '', username: '', password: '', meter_code: '', is_inverted: false });
  const toast = useToast();

  const loadData = async () => {
    try {
      const [aptRes, blkRes] = await Promise.all([
        client.get('/admin/apartments', { params: { block: blockFilter || undefined, search: search || undefined } }),
        client.get('/admin/blocks'),
      ]);
      if (aptRes.data.ok) setApartments(aptRes.data.items);
      if (blkRes.data.ok) setBlocks(blkRes.data.items);
    } catch (err) {
      toast.error('Error al cargar departamentos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [blockFilter]);

  const filtered = apartments.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.owner_name.toLowerCase().includes(q) || a.number.toLowerCase().includes(q) || a.block.toLowerCase().includes(q) || (a.phone && a.phone.includes(q));
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await client.post('/admin/apartments', form);
      if (data.ok) {
        toast.success('Departamento creado exitosamente');
        setShowModal(false);
        setForm({ block: '', number: '', owner_name: '', phone: '', username: '', password: '', meter_code: '', is_inverted: false });
        loadData();
      } else {
        toast.error(data.message);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al crear departamento');
    }
  };

  if (loading) {
    return <div className="loading-overlay"><div className="spinner" /> Cargando departamentos...</div>;
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Departamentos</h1>
          <p className="page-subtitle">{apartments.length} departamentos registrados</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <i className="bi bi-building-add" /> Nuevo Departamento
        </button>
      </div>

      <div className="filter-bar">
        <div className="search-bar" style={{ flex: 1 }}>
          <i className="bi bi-search" />
          <input className="form-control" placeholder="Buscar por nombre, departamento, bloque..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-control form-select" style={{ maxWidth: '200px' }} value={blockFilter} onChange={e => setBlockFilter(e.target.value)}>
          <option value="">Todos los bloques</option>
          {blocks.map(b => <option key={b} value={b}>Bloque {b}</option>)}
        </select>
      </div>

      <div className="glass-card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bloque</th>
                <th>Dpto</th>
                <th>Adjudicatario</th>
                <th>Teléfono</th>
                <th>Medidor</th>
                <th className="text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6}><div className="empty-state"><i className="bi bi-building" /><p>No se encontraron departamentos</p></div></td></tr>
              ) : filtered.map(apt => (
                <tr key={apt.id}>
                  <td><span className="status-badge open">Bloque {apt.block}</span></td>
                  <td><strong>{apt.number}</strong></td>
                  <td>{apt.owner_name}</td>
                  <td className="text-muted">{apt.phone || '—'}</td>
                  <td>
                    {apt.meter ? (
                      <span className="text-sm">
                        {apt.meter.code}
                        {apt.meter.is_inverted && <span className="status-badge partial" style={{ marginLeft: '6px', fontSize: '0.65rem' }}>Invertido</span>}
                      </span>
                    ) : <span className="text-muted text-sm">Sin medidor</span>}
                  </td>
                  <td className="center">
                    <span className={`status-badge ${apt.is_active ? 'paid' : 'pending'}`}>
                      {apt.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="bi bi-building-add" style={{ marginRight: '8px', color: 'var(--accent-primary)' }} />Nuevo Departamento</h3>
              <button className="btn btn-icon btn-outline" onClick={() => setShowModal(false)}><i className="bi bi-x-lg" /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Bloque</label>
                    <input className="form-control" placeholder="A" value={form.block} onChange={e => setForm(p => ({ ...p, block: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">N° Dpto</label>
                    <input className="form-control" placeholder="101" value={form.number} onChange={e => setForm(p => ({ ...p, number: e.target.value }))} required />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Nombre del Adjudicatario</label>
                  <input className="form-control" placeholder="Juan Pérez" value={form.owner_name} onChange={e => setForm(p => ({ ...p, owner_name: e.target.value }))} required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Teléfono</label>
                    <input className="form-control" placeholder="Opcional" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Código Medidor</label>
                    <input className="form-control" placeholder="MED-A101" value={form.meter_code} onChange={e => setForm(p => ({ ...p, meter_code: e.target.value }))} required />
                  </div>
                </div>
                <div className="form-check" style={{ marginBottom: '16px' }}>
                  <input type="checkbox" id="inv-check" checked={form.is_inverted} onChange={e => setForm(p => ({ ...p, is_inverted: e.target.checked }))} />
                  <label htmlFor="inv-check" className="text-sm">Medidor invertido (cuenta hacia atrás)</label>
                </div>
                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '16px 0' }} />
                <p className="text-sm font-semibold mb-2">Credenciales de Acceso</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Usuario</label>
                    <input className="form-control" value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contraseña</label>
                    <input className="form-control" type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required minLength={6} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary"><i className="bi bi-check-lg" /> Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
