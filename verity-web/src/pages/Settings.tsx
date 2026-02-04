import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiJson } from '../api/client';
import { useAuth } from '../hooks/useAuth';

export const Settings: React.FC = () => {
  const { deleteAccount, signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    const confirmed = window.confirm(
      'This will permanently delete your account and data. Continue?',
    );
    if (!confirmed) {
      return;
    }
    setDeleting(true);
    await deleteAccount();
    signOut();
  };

  const handleExport = async () => {
    if (exporting) {
      return;
    }
    setExporting(true);
    setError(null);
    const response = await apiJson('/users/me/export');
    setExporting(false);
    if (!response.ok || !response.data) {
      setError('Unable to export your data. Try again.');
      return;
    }
    const blob = new Blob([JSON.stringify(response.data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `verity-data-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="grid two">
      <div className="card">
        <h1 className="section-title">Account</h1>
        <p className="subtle">
          Download a copy of your data or permanently delete your account.
        </p>
        <div className="stack tight" style={{ marginTop: '16px' }}>
          <button className="button secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Preparing download...' : 'Download my data'}
          </button>
          <button className="button danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete account'}
          </button>
        </div>
        {error && <p className="subtle" style={{ color: '#dc2626' }}>{error}</p>}
      </div>
      <div className="card">
        <h2 className="section-title">Legal</h2>
        <ul className="subtle list">
          <li>
            <Link to="/legal/privacy">Privacy Policy</Link>
          </li>
          <li>
            <Link to="/legal/terms">Terms of Service</Link>
          </li>
          <li>
            <Link to="/legal/community">Community Guidelines</Link>
          </li>
          <li>
            <Link to="/legal/cookies">Cookie Notice</Link>
          </li>
        </ul>
        <div className="callout safety" style={{ marginTop: '16px' }}>
          <strong>Support</strong>
          <p className="subtle">Email support@verity.app for account help.</p>
        </div>
      </div>
    </section>
  );
};
