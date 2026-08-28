import { useState, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import client from '../../api/client';
import { useTheme } from '../../context/ThemeContext';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function OwnerDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { theme } = useTheme();

  useEffect(() => {
    client.get('/owner/dashboard').then(({ data: res }) => {
      if (res.ok) setData(res);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="loading-overlay"><div className="spinner" /> Cargando tu información...</div>;
  }

  if (!data) {
    return (
      <div className="empty-state">
        <i className="bi bi-exclamation-triangle" />
        <p>No tienes un departamento asignado. Contacta al administrador.</p>
      </div>
    );
  }

  const { owner, apartment, allocations } = data;
  const latest = allocations[0];
  const totalDebt = allocations.reduce((s, a) => s + a.pending_amount_bs, 0);

  const chartData = {
    labels: allocations.slice(0, 12).reverse().map(a => a.period.code),
    datasets: [
      {
        label: 'Consumo (m³)',
        data: allocations.slice(0, 12).reverse().map(a => a.consumption_m3),
        backgroundColor: theme === 'dark' ? 'rgba(14, 165, 233, 0.6)' : 'rgba(14, 165, 233, 0.8)',
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: theme === 'dark' ? '#1e293b' : '#fff',
        titleColor: theme === 'dark' ? '#f1f5f9' : '#0f172a',
        bodyColor: theme === 'dark' ? '#94a3b8' : '#475569',
        borderColor: theme === 'dark' ? '#334155' : '#e2e8f0',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: theme === 'dark' ? '#64748b' : '#94a3b8' },
      },
      y: {
        grid: { color: theme === 'dark' ? '#1e293b' : '#f0f4f8' },
        ticks: { color: theme === 'dark' ? '#64748b' : '#94a3b8' },
      },
    },
  };

  return (
    <>
      <div className="owner-hero">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p className="owner-hero-sub">Bienvenido, {owner.full_name}</p>
          <h1 className="owner-hero-title">
            {apartment ? `Bloque ${apartment.block} — Dpto ${apartment.number}` : 'Mi Departamento'}
          </h1>

          <div className="owner-stats">
            <div className="owner-stat">
              <div className="owner-stat-value">{latest ? latest.consumption_m3.toFixed(1) : '—'}</div>
              <div className="owner-stat-label">Consumo del Mes (m³)</div>
            </div>
            <div className="owner-stat">
              <div className="owner-stat-value">{latest ? `${latest.amount_due_bs.toFixed(2)}` : '—'}</div>
              <div className="owner-stat-label">Monto del Mes (Bs)</div>
            </div>
            <div className="owner-stat">
              <div className="owner-stat-value" style={{ color: totalDebt > 0 ? '#fbbf24' : '#6ee7b7' }}>
                {totalDebt.toFixed(2)}
              </div>
              <div className="owner-stat-label">Deuda Total (Bs)</div>
            </div>
            <div className="owner-stat">
              <div className="owner-stat-value">{latest?.period?.code || '—'}</div>
              <div className="owner-stat-label">Último Periodo</div>
            </div>
          </div>
        </div>
      </div>

      {latest && (
        <div className="glass-card mb-6">
          <div className="glass-card-header">
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>
              <i className="bi bi-receipt" style={{ marginRight: '8px', color: 'var(--accent-primary)' }} />
              Estado del Periodo Actual — {latest.period.code}
            </h3>
            <span className={`status-badge ${latest.status === 'PAGADO' ? 'paid' : latest.status === 'PARCIAL' ? 'partial' : 'pending'}`}>
              <i className={`bi bi-${latest.status === 'PAGADO' ? 'check-circle-fill' : 'clock-history'}`} />
              {latest.status === 'PAGADO' ? 'Pagado' : latest.status === 'PARCIAL' ? 'Parcial' : 'Pendiente'}
            </span>
          </div>
          <div className="glass-card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
              <div>
                <p className="text-xs text-muted mb-2">Consumo</p>
                <p className="font-bold" style={{ fontSize: '1.2rem' }}>{latest.consumption_m3.toFixed(2)} <span className="text-sm text-muted">m³</span></p>
              </div>
              <div>
                <p className="text-xs text-muted mb-2">Participación</p>
                <p className="font-bold" style={{ fontSize: '1.2rem' }}>{latest.percentage_share.toFixed(2)}<span className="text-sm text-muted">%</span></p>
              </div>
              <div>
                <p className="text-xs text-muted mb-2">Total a Pagar</p>
                <p className="font-bold" style={{ fontSize: '1.2rem', color: 'var(--accent-primary)' }}>{latest.amount_due_bs.toFixed(2)} <span className="text-sm">Bs</span></p>
              </div>
              <div>
                <p className="text-xs text-muted mb-2">Pagado</p>
                <p className="font-bold" style={{ fontSize: '1.2rem', color: 'var(--success)' }}>{latest.amount_paid_bs.toFixed(2)} <span className="text-sm">Bs</span></p>
              </div>
            </div>
          </div>
        </div>
      )}

      {allocations.length > 1 && (
        <div className="glass-card mb-6">
          <div className="glass-card-header">
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>
              <i className="bi bi-bar-chart" style={{ marginRight: '8px', color: 'var(--accent-primary)' }} />
              Historial de Consumo
            </h3>
          </div>
          <div className="glass-card-body">
            <div style={{ height: '280px' }}>
              <Bar data={chartData} options={chartOptions} />
            </div>
          </div>
        </div>
      )}

      <div className="glass-card">
        <div className="glass-card-header">
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>
            <i className="bi bi-clock-history" style={{ marginRight: '8px', color: 'var(--accent-primary)' }} />
            Historial de Periodos
          </h3>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Periodo</th>
                <th className="text-right">Consumo (m³)</th>
                <th className="text-right">Monto (Bs)</th>
                <th className="text-right">Pagado (Bs)</th>
                <th className="text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {allocations.length === 0 ? (
                <tr><td colSpan={5}><div className="empty-state"><i className="bi bi-droplet" /><p>Aún no hay lecturas registradas para tu departamento</p></div></td></tr>
              ) : allocations.map(a => (
                <tr key={a.id}>
                  <td><strong>{a.period.code}</strong></td>
                  <td className="numeric">{a.consumption_m3.toFixed(2)}</td>
                  <td className="numeric font-semibold">{a.amount_due_bs.toFixed(2)}</td>
                  <td className="numeric" style={{ color: 'var(--success)' }}>{a.amount_paid_bs.toFixed(2)}</td>
                  <td className="center">
                    <span className={`status-badge ${a.status === 'PAGADO' ? 'paid' : a.status === 'PARCIAL' ? 'partial' : 'pending'}`}>
                      {a.status === 'PAGADO' ? 'Pagado' : a.status === 'PARCIAL' ? 'Parcial' : 'Pendiente'}
                    </span>
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
