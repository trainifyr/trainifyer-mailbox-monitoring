import React from 'react';
import { ShieldCheck, CheckCircle, XCircle, Lock } from 'lucide-react';

export default function PrivacyConsentOverlay({ onAccept, onDecline, submitting }) {
  return (
    <div className="animate-fade-in" style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1000,
      background: 'rgba(2, 6, 23, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem'
    }}>
      <div className="card" style={{ 
        maxWidth: '480px', 
        width: '100%', 
        padding: '3rem', 
        textAlign: 'center',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ 
          width: '64px', 
          height: '64px', 
          background: 'var(--primary-glow)', 
          color: 'var(--primary)', 
          borderRadius: '50%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          margin: '0 auto 2rem' 
        }}>
          <ShieldCheck size={32} />
        </div>
        
        <h2 style={{ fontSize: '1.75rem', marginBottom: '1rem' }}>Privacy & Security Audit</h2>
        
        <div style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: '1.6', marginBottom: '2.5rem' }}>
          <p style={{ marginBottom: '1rem' }}>
            To maintain training integrity, this session is subject to <strong>administrative monitoring</strong>.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--bg-app)', padding: '1rem', borderRadius: 'var(--radius-md)', textAlign: 'left', fontSize: '0.875rem' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Lock size={14} /> Attendance & Heartbeat Tracking</div>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Lock size={14} /> Voice & Camera Status Logging</div>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Lock size={14} /> Automated Engagement Analytics</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '1rem' }}
            onClick={onAccept}
            disabled={submitting}
          >
            <CheckCircle size={18} />
            {submitting ? 'Initializing Secure Socket...' : 'Agree & Launch Session'}
          </button>
          
          <button
            className="btn btn-ghost"
            style={{ width: '100%', color: 'var(--text-muted)' }}
            onClick={onDecline}
            disabled={submitting}
          >
            <XCircle size={18} />
            I do not agree
          </button>
        </div>

        <p style={{ marginTop: '2rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Session ID: {Math.random().toString(36).substring(7).toUpperCase()} • SOC2 Compliant
        </p>
      </div>
    </div>
  );
}
