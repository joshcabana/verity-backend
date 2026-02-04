import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const Settings: React.FC = () => {
  const { deleteAccount, signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);

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

  return (
    <section className="grid two">
      <div className="card">
        <h1 className="section-title">Account</h1>
        <p className="subtle">
          You can delete your account at any time. This removes your profile,
          sessions, matches, and messages.
        </p>
        <button className="button danger" onClick={handleDelete} disabled={deleting}>
          {deleting ? 'Deleting...' : 'Delete account'}
        </button>
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
      </div>
    </section>
  );
};
