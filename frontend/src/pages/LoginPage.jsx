import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, Loader, Eye, EyeOff } from 'lucide-react';
import './LoginPage.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated } = useAuth();

  const from = location.state?.from || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // If already authenticated, redirect
  React.useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }

    try {
      setSubmitting(true);
      await login(email.trim(), password);
      // Navigation happens via the useEffect above
    } catch (err) {
      if (err.message === 'Invalid login credentials') {
        setError('Invalid email or password. Please try again.');
      } else {
        setError(err.message || 'Login failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>Trainifyer</h1>
          <p className="login-subtitle">Mailbox Monitoring Platform</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={submitting}
              autoFocus
            />
          </div>

          <div className="form-row">
            <label htmlFor="password">Password</label>
            <div className="password-input-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={submitting}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((s) => !s)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary login-submit"
            disabled={submitting}
          >
            {submitting ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Loader size={18} className="spin" /> Signing in...
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LogIn size={18} /> Sign In
              </span>
            )}
          </button>
        </form>

        <div className="login-footer">
          <p className="login-hint">
            Use your email and password to sign in.
          </p>
          <p className="login-hint" style={{ fontSize: '12px', marginTop: '0.5rem', color: '#9ca3af' }}>
            Need an account? Contact your administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
