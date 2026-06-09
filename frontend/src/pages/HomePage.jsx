import { Link } from 'react-router-dom';
import apiClient from '../api/client';

export default function HomePage() {
  const ping = async () => {
    try {
      // Axios client will auto-inject mock headers
      const res = await apiClient.get('/health');
      alert('Backend Response:\n' + JSON.stringify(res.data, null, 2));
    } catch (e) {
      console.error(e);
      alert('Backend not reachable: ' + e.message);
    }
  };

  return (
    <div className="home-page">
      <h2>Welcome</h2>
      <p>Use the Mock Identity Bar at the bottom to switch roles.</p>
      <nav style={{ margin: '1rem 0', display: 'flex', gap: '1rem' }}>
        <Link to="/admin/dashboard">Admin Dashboard</Link>
        <Link to="/student/dashboard">Student Dashboard</Link>
      </nav>
      <div style={{ marginTop: '2rem' }}>
        <button 
          onClick={ping}
          style={{ padding: '8px 16px', background: '#2196f3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Ping /api/health
        </button>
      </div>
    </div>
  );
}
