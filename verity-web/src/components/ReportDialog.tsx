import React, { useMemo, useState } from 'react';
import { apiJson } from '../api/client';

const REASONS = [
  { value: 'Harassment or hate speech', label: 'Harassment or hate speech' },
  { value: 'Nudity or sexual content', label: 'Nudity or sexual content' },
  { value: 'Threats or intimidation', label: 'Threats or intimidation' },
  { value: 'Scam or solicitation', label: 'Scam or solicitation' },
  { value: 'Other safety concern', label: 'Other safety concern' },
] as const;

type ReportDialogProps = {
  reportedUserId?: string | null;
  contextLabel?: string;
  buttonLabel?: string;
};

export const ReportDialog: React.FC<ReportDialogProps> = ({
  reportedUserId,
  contextLabel = 'This report will be reviewed by our safety team.',
  buttonLabel = 'Report user',
}) => {
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0].value);
  const [details, setDetails] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle',
  );

  const canSubmit = useMemo(
    () => Boolean(reportedUserId) && status !== 'sending',
    [reportedUserId, status],
  );

  const handleOpen = () => {
    if (!reportedUserId) {
      return;
    }
    setStatus('idle');
    setReason(REASONS[0].value);
    setDetails('');
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!reportedUserId) {
      return;
    }
    setStatus('sending');
    const trimmed = details.trim();
    try {
      const response = await apiJson('/moderation/reports', {
        method: 'POST',
        body: {
          reportedUserId,
          reason,
          details: trimmed.length > 0 ? trimmed : undefined,
        },
      });

      if (!response.ok) {
        setStatus('error');
        return;
      }
      setStatus('sent');
      setTimeout(() => {
        setOpen(false);
      }, 900);
    } catch {
      setStatus('error');
    }
  };

  return (
    <>
      <button
        className="button secondary"
        onClick={handleOpen}
        disabled={!reportedUserId}
      >
        {buttonLabel}
      </button>
      {!reportedUserId && (
        <p className="subtle" style={{ marginTop: '8px' }}>
          Reporting is available once a match is active.
        </p>
      )}
      {open && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <h3 className="section-title">Report a safety issue</h3>
              <button
                className="button ghost"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
            <p className="subtle">{contextLabel}</p>
            <label className="subtle">
              Reason
              <select
                className="input"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              >
                {REASONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="subtle">
              Details (optional)
              <textarea
                className="input textarea"
                rows={4}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="Share any helpful context"
              />
            </label>
            {status === 'error' && (
              <p className="subtle" style={{ color: '#dc2626' }}>
                {offline
                  ? 'You appear to be offline. Reconnect and try again.'
                  : 'We could not submit the report. Please try again.'}
              </p>
            )}
            {status === 'sent' && (
              <p className="subtle" style={{ color: '#16a34a' }}>
                Report submitted. Thank you for helping keep Verity safe.
              </p>
            )}
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                className="button danger"
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                {status === 'sending' ? 'Sending...' : 'Submit report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
