import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { User, Lock, Mail, Shield, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import './ProfilePage.css';

export default function ProfilePage() {
  const { user } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setStatus({ type: 'error', message: 'Passwords do not match.' });
      return;
    }
    if (newPassword.length < 6) {
      setStatus({ type: 'error', message: 'Password must be at least 6 characters.' });
      return;
    }

    try {
      setSubmitting(true);
      setStatus({ type: '', message: '' });
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });
      if (error) throw error;
      setStatus({ type: 'success', message: 'Password updated successfully!' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      setStatus({ type: 'error', message: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return <div className="profile-loading">Loading profile...</div>;

  return (
    <div className="profile-page">
      <div className="profile-header">
        <h1>User Profile</h1>
        <p>Manage your account settings and security</p>
      </div>

      <div className="profile-grid">
        {/* Info Card */}
        <div className="profile-card info-card">
          <div className="card-header">
            <User size={20} />
            <h3>Personal Information</h3>
          </div>
          <div className="card-body">
            <div className="info-row">
              <span className="label">Full Name</span>
              <span className="value">{user.full_name}</span>
            </div>
            <div className="info-row">
              <Mail size={16} className="icon" />
              <span className="label">Email Address</span>
              <span className="value">{user.email}</span>
            </div>
            <div className="info-row">
              <Shield size={16} className="icon" />
              <span className="label">Role</span>
              <span className="value badge">{user.role}</span>
            </div>
          </div>
        </div>

        {/* Security Card */}
        <div className="profile-card security-card">
          <div className="card-header">
            <Lock size={20} />
            <h3>Security</h3>
          </div>
          <div className="card-body">
            <p className="card-desc">Change your password to secure your account.</p>
            <form onSubmit={handleUpdatePassword}>
              <div className="form-group">
                <label>New Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    required
                    style={{ paddingRight: '2.5rem', width: '100%' }}
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>Confirm New Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    required
                    style={{ paddingRight: '2.5rem', width: '100%' }}
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {status.message && (
                <div className={`status-box ${status.type}`}>
                  {status.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                  <span>{status.message}</span>
                </div>
              )}

              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
