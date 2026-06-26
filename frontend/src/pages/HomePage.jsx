import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  CheckCircle2, 
  Video, 
  Mail, 
  BarChart3, 
  ShieldCheck, 
  Zap,
  ArrowRight,
  Monitor
} from 'lucide-react';

export default function HomePage() {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="home-page animate-fade-in">
      {/* Hero Section */}
      <section style={{ 
        padding: '4rem 0 6rem', 
        textAlign: 'center',
        background: 'radial-gradient(circle at 50% 0%, var(--primary-glow), transparent 70%)',
        borderRadius: 'var(--radius-xl)',
        marginBottom: '4rem'
      }}>
        <div className="counter-badge" style={{ marginBottom: '1.5rem' }}>
          <Zap size={14} style={{ marginRight: '6px' }} /> Now with Real-time AI Monitoring
        </div>
        <h1 style={{ 
          fontSize: '4.5rem', 
          marginBottom: '1.5rem', 
          background: 'linear-gradient(to bottom, var(--text-heading), #475569)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          letterSpacing: '-0.04em'
        }}>
          Master Your Training <br /> Operations with Confidence
        </h1>
        <p style={{ 
          fontSize: '1.25rem', 
          color: 'var(--text-muted)', 
          maxWidth: '700px', 
          margin: '0 auto 2.5rem',
          lineHeight: '1.6'
        }}>
          The ultimate platform for meeting management, automated attendance, and secure communication. Built for professional trainers and agile students.
        </p>
        
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
          {!isAuthenticated ? (
            <>
              <Link to="/login" className="btn btn-primary" style={{ padding: '1rem 2.5rem', fontSize: '1.125rem' }}>
                Get Started Free <ArrowRight size={18} />
              </Link>
              <button className="btn btn-ghost" style={{ padding: '1rem 2.5rem', fontSize: '1.125rem', border: '1px solid var(--border)' }}>
                View Demo
              </button>
            </>
          ) : (
            <Link to={user?.role === 'ADMIN' ? "/admin/dashboard" : "/student/dashboard"} className="btn btn-primary" style={{ padding: '1rem 2.5rem', fontSize: '1.125rem' }}>
              Go to Dashboard <ArrowRight size={18} />
            </Link>
          )}
        </div>

        <div style={{ marginTop: '4rem', display: 'flex', justifyContent: 'center', gap: '3rem', opacity: 0.5 }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}><ShieldCheck size={20} /> Secure SSL</div>
           <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}><Monitor size={20} /> Multi-Device</div>
           <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}><CheckCircle2 size={20} /> SOC2 Compliant</div>
        </div>
      </section>

      {/* Features Grid */}
      <section style={{ marginBottom: '6rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
           <h2 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Platform Features</h2>
           <p style={{ color: 'var(--text-muted)' }}>Everything you need to manage your coaching batches at scale.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
          <div className="card">
            <div style={{ width: '48px', height: '48px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', marginBottom: '1.5rem' }}>
              <Video size={24} />
            </div>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>Meeting Management</h3>
            <p style={{ color: 'var(--text-muted)' }}>Automate scheduled sessions and manage batch-specific meeting links with zero friction.</p>
          </div>

          <div className="card">
            <div style={{ width: '48px', height: '48px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', marginBottom: '1.5rem' }}>
              <BarChart3 size={24} />
            </div>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>Deep Insights</h3>
            <p style={{ color: 'var(--text-muted)' }}>Real-time attendance tracking with percentage analytics, join logs, and automated reports.</p>
          </div>

          <div className="card">
            <div style={{ width: '48px', height: '48px', background: 'rgba(236, 72, 153, 0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ec4899', marginBottom: '1.5rem' }}>
              <Mail size={24} />
            </div>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>Internal Mailbox</h3>
            <p style={{ color: 'var(--text-muted)' }}>Communicate securely within your batches. Dedicated internal inbox for all critical training updates.</p>
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="card" style={{ padding: '4rem', textAlign: 'center', border: '1px solid var(--primary-glow)', background: 'linear-gradient(135deg, var(--bg-card), var(--border-light))' }}>
         <h2 style={{ fontSize: '2.5rem', marginBottom: '1.5rem' }}>Ready to elevate your training?</h2>
         <p style={{ fontSize: '1.25rem', color: 'var(--text-muted)', marginBottom: '2.5rem', maxWidth: '600px', margin: '0 auto 2.5rem' }}>
           Join hundreds of successful trainers using Trainifyer to scale their educational coaching programs.
         </p>
         <Link to="/login" className="btn btn-primary" style={{ padding: '1rem 3rem' }}>Get Access Now</Link>
      </section>
      
      <footer style={{ padding: '6rem 0 2rem', marginTop: '4rem', borderTop: '1px solid var(--border)' }}>
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.25rem' }}>Trainifyer</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>© 2024 Trainifyer Inc. All rights reserved.</div>
            <div style={{ display: 'flex', gap: '2rem', fontSize: '0.875rem' }}>
               <a href="#" style={{ color: 'var(--text-muted)' }}>Privacy Policy</a>
               <a href="#" style={{ color: 'var(--text-muted)' }}>Terms of Service</a>
            </div>
         </div>
      </footer>
    </div>
  );
}
