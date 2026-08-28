import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

export default function Layout({ title = 'AguaPago' }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="main-content">
        <Navbar title={title} onMenuToggle={() => setSidebarOpen(prev => !prev)} />
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
