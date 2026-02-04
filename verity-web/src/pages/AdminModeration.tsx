import React, { useEffect, useMemo, useState } from 'react';
import { apiJson, getAdminKey, setAdminKey } from '../api/client';

type Report = {
  id: string;
  createdAt: string;
  reporterId: string;
  reportedUserId: string;
  reason: string;
  details?: string | null;
  status: string;
};

type ResolveAction = 'warn' | 'ban';

export const AdminModeration: React.FC = () => {
  const [adminKey, setAdminKeyState] = useState<string>(getAdminKey() ?? '');
  const [statusFilter, setStatusFilter] = useState<string>('OPEN');
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers = useMemo(() => {
    const key = adminKey.trim();
    return key ? { 'x-admin-key': key } : {};
  }, [adminKey]);

  const fetchReports = async () => {
    setLoading(true);
    setError(null);
    const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    const response = await apiJson<Report[]>(`/moderation/reports${query}`, {
      method: 'GET',
      headers,
    });
    if (response.ok && response.data) {
      setReports(response.data);
    } else {
      setError('Unable to load reports. Check admin key.');
    }
    setLoading(false);
  };

  const resolveReport = async (id: string, action: ResolveAction) => {
    const response = await apiJson(`/moderation/reports/${id}/resolve`, {
      method: 'POST',
      headers,
      body: { action },
    });
    if (!response.ok) {
      setError('Failed to resolve report.');
      return;
    }
    await fetchReports();
  };

  useEffect(() => {
    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleKeySave = () => {
    setAdminKey(adminKey);
  };

  return (
    <section className="card">
      <h1 className="section-title">Moderation Review</h1>
      <p className="subtle">
        Admin access requires the `MODERATION_ADMIN_KEY` header.
      </p>

      <div className="input-stack">
        <label className="subtle">
          Admin key
          <input
            type="password"
            value={adminKey}
            onChange={(event) => setAdminKeyState(event.target.value)}
            className="input"
          />
        </label>
        <button className="button secondary" onClick={handleKeySave}>
          Save key
        </button>
        <label className="subtle">
          Status
          <select
            className="input"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">All</option>
            <option value="OPEN">OPEN</option>
            <option value="WARNED">WARNED</option>
            <option value="BANNED">BANNED</option>
          </select>
        </label>
        <button className="button" onClick={fetchReports} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && <p className="subtle" style={{ color: '#dc2626' }}>{error}</p>}

      {reports.length === 0 ? (
        <p className="subtle">No reports found.</p>
      ) : (
        <div className="report-list">
          {reports.map((report) => (
            <div key={report.id} className="report-card">
              <div className="report-meta">
                <strong>{report.reason}</strong>
                <span className="subtle">{new Date(report.createdAt).toLocaleString()}</span>
              </div>
              <p className="subtle">
                Reporter: {report.reporterId} · Reported: {report.reportedUserId}
              </p>
              {report.details && <p className="subtle">Details: {report.details}</p>}
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button
                  className="button secondary"
                  onClick={() => resolveReport(report.id, 'warn')}
                >
                  Warn
                </button>
                <button
                  className="button danger"
                  onClick={() => resolveReport(report.id, 'ban')}
                >
                  Ban
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
