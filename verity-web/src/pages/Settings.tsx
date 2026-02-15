import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../api/client';
import { useAuth } from '../hooks/useAuth';

type BlockEntry = {
  id: string;
  createdAt: string;
  blockedUserId: string;
};

export const Settings: React.FC = () => {
  const { deleteAccount, signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);

  const blocksQuery = useQuery({
    queryKey: ['blocked-users'],
    queryFn: async () => {
      const response = await apiJson<BlockEntry[]>('/moderation/blocks');
      if (!response.ok || !response.data) {
        throw new Error('Failed to load blocks');
      }
      return response.data;
    },
  });

  const handleDelete = async () => {
    const confirmed = window.confirm(
      'This will permanently delete your account and data. Continue?',
    );
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      await deleteAccount();
      signOut();
    } catch {
      setError('Unable to delete your account right now. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = async () => {
    if (exporting) {
      return;
    }

    setExporting(true);
    setError(null);

    try {
      const response = await apiJson('/users/me/export');
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
    } catch {
      setError('Unable to export your data. Check your connection and try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleUnblock = async (blockedUserId: string) => {
    if (unblockingId) {
      return;
    }

    setUnblockingId(blockedUserId);
    setBlockError(null);

    try {
      const response = await apiJson(`/moderation/blocks/${blockedUserId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        setBlockError('Unable to unblock right now. Try again.');
        return;
      }

      await blocksQuery.refetch();
    } catch {
      setBlockError('Unable to unblock right now. Check your connection and try again.');
    } finally {
      setUnblockingId(null);
    }
  };

  const blockedUsers = blocksQuery.data ?? [];

  return (
    <section className="grid two">
      <div className="card">
        <h1 className="section-title">Account</h1>
        <p className="subtle">
          Download a copy of your data or permanently delete your account.
        </p>
        <div className="stack tight mt-md">
          <button className="button secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Preparing download...' : 'Download my data'}
          </button>
          <button className="button danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete account'}
          </button>
        </div>
        {error && <p className="subtle text-danger">{error}</p>}
      </div>
      <div className="card">
        <h2 className="section-title">Safety</h2>
        {blocksQuery.isLoading ? (
          <p className="subtle">Loading blocked users…</p>
        ) : blocksQuery.isError ? (
          <p className="subtle text-danger">
            Unable to load blocked users right now.
          </p>
        ) : blockedUsers.length === 0 ? (
          <p className="subtle">You have not blocked anyone.</p>
        ) : (
          <div className="block-list">
            {blockedUsers.map((entry) => (
              <div key={entry.id} className="block-item">
                <div className="subtle">
                  <strong>{entry.blockedUserId}</strong>
                  <div>Blocked on {new Date(entry.createdAt).toLocaleDateString()}</div>
                </div>
                <button
                  className="button secondary"
                  onClick={() => handleUnblock(entry.blockedUserId)}
                  disabled={unblockingId === entry.blockedUserId}
                >
                  {unblockingId === entry.blockedUserId ? 'Unblocking…' : 'Unblock'}
                </button>
              </div>
            ))}
          </div>
        )}
        {blockError && (
          <p className="subtle text-danger mt-xs">
            {blockError}
          </p>
        )}
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
        <div className="callout safety mt-md">
          <strong>Support</strong>
          <p className="subtle">Email support@verity.app for account help.</p>
        </div>
      </div>
    </section>
  );
};
