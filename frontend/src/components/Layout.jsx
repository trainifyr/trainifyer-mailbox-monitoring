import { Outlet } from 'react-router-dom';
import MockIdentityBar from './MockIdentityBar';

export default function Layout() {
  return (
    <div className="app-layout" style={{ minHeight: '100vh', paddingBottom: '50px' }}>
      <header className="app-header" style={{ padding: '1rem', background: '#f5f5f5', borderBottom: '1px solid #ddd' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Trainifyer Mailbox Monitoring</h1>
      </header>
      <main className="app-main" style={{ padding: '2rem' }}>
        <Outlet />
      </main>
      <MockIdentityBar />
    </div>
  );
}
