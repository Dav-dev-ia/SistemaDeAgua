import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [dashRes, periodRes] = await Promise.all([
          client.get('/admin/dashboard'),
          client.get('/admin/periods'),
        ]);
        if (dashRes.data.ok) setSummary(dashRes.data.stats);
        if (periodRes.data.ok) setPeriods((periodRes.data.items || []).slice(0, 5));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return <div className="loading-overlay"><div className="spinner" /> Cargando dashboard...</div>;
  }

  const kpis = summary ? [
    { label: 'Departamentos', value: summary.total_apartments ?? 0, icon: 'bi-building', color: 'primary' },
    { label: 'Periodo Activo', value: summary.active_period ?? 'Ninguno', icon: 'bi-calendar3', color: 'info' },
    { label: 'Total Cobrado', value: `${(summary.total_collected ?? 0).toFixed(2)} Bs`, icon: 'bi-cash', color: 'success' },
    { label: 'Por Cobrar', value: `${(summary.pending_collection ?? 0).toFixed(2)} Bs`, icon: 'bi-clock-history', color: 'warning' },
  ] : [];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Resumen general del sistema de agua</p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/apartamentos" className="btn btn-outline btn-sm">
            <i className="bi bi-building-add" /> Nuevo Dpto
          </Link>
          <Link to="/admin/periodos" className="btn btn-primary btn-sm">
            <i className="bi bi-plus-lg" /> Nuevo Periodo
          </Link>
        </div>
      </div>

      <div className="kpi-grid">
        {kpis.map((kpi, i) => (
          <div className="kpi-card" key={i}>
            <div className={`kpi-icon ${kpi.color}`}>
              <i className={`bi ${kpi.icon}`} />
            </div>
            <div className="kpi-info">
              <div className="kpi-label">{kpi.label}</div>
              <div className="kpi-value">{kpi.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="glass-card" style={{ marginTop: '8px' }}>
        <div className="glass-card-header">
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>
            <i className="bi bi-calendar3 text-muted" style={{ marginRight: '8px' }} />
            Últimos Periodos
          </h3>
          <Link to="/admin/periodos" className="btn btn-outline btn-sm">Ver todos</Link>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <caption className="sr-only">Últimos periodos de facturación</caption>
            <thead>
              <tr>
                <th scope="col">Periodo</th>
                <th scope="col" className="text-right">Monto Total (Bs)</th>
                <th scope="col" className="text-right">Consumo General (m³)</th>
                <th scope="col" className="text-center">Estado</th>
                <th scope="col" className="text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {periods.length === 0 ? (
                <tr><td colSpan={5} className="empty-state"><i className="bi bi-inbox" /><p>No hay periodos registrados aún.</p></td></tr>
              ) : periods.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.code}</strong></td>
                  <td className="numeric">{p.total_common_amount_bs.toFixed(2)}</td>
                  <td className="numeric">{p.general_total_consumption_m3.toFixed(2)}</td>
                  <td className="center">
                    <span className={`status-badge ${p.status === 'OPEN' ? 'open' : p.status === 'CALCULATED' ? 'calculated' : 'paid'}`}>
                      {p.status === 'OPEN' ? 'Abierto' : p.status === 'CALCULATED' ? 'Calculado' : p.status}
                    </span>
                  </td>
                  <td className="center">
                    <Link to={`/admin/periodos`} className="btn btn-outline btn-sm">
                      <i className="bi bi-eye" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
