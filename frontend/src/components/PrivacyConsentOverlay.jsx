import React from 'react';
import { ShieldAlert, CheckCircle, XCircle } from 'lucide-react';
import './PrivacyConsentOverlay.css';

export default function PrivacyConsentOverlay({ onAccept, onDecline, submitting }) {
  return (
    <div className="consent-overlay">
      <div className="consent-card">
        <div className="consent-icon">
          <ShieldAlert size={48} />
        </div>
        <h2>Privacy Consent</h2>
        <div className="consent-message">
          <p>
            This session may be monitored by the administrator. Your camera,
            microphone, attendance time, and screen-sharing activity may be
            tracked.
          </p>
          <p className="consent-strong">
            Please continue only if you agree.
          </p>
        </div>
        <div className="consent-actions">
          <button
            className="btn btn-primary"
            onClick={onAccept}
            disabled={submitting}
          >
            <CheckCircle size={18} />
            {submitting ? 'Please wait...' : 'Agree & Proceed'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={onDecline}
            disabled={submitting}
          >
            <XCircle size={18} />
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
