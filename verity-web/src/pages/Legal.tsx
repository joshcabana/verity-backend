import React from 'react';
import { Link, useParams } from 'react-router-dom';

type Doc = {
  title: string;
  updated: string;
  sections: Array<{ heading: string; body: string[] }>;
};

const docs: Record<string, Doc> = {
  privacy: {
    title: 'Privacy Policy (Draft)',
    updated: 'February 4, 2026',
    sections: [
      {
        heading: 'What we collect',
        body: [
          'Anonymous account ID, post-match profile details, messages, and token transactions.',
          'No pre-match personal identifiers are collected or revealed.',
        ],
      },
      {
        heading: 'How we use data',
        body: [
          'To provide matching, video sessions, and mutual reveal.',
          'To prevent abuse and respond to safety reports.',
        ],
      },
      {
        heading: 'Retention',
        body: [
          'Non-match sessions are removed after 24 hours.',
          'Matches are deleted on request via account deletion.',
        ],
      },
      {
        heading: 'Third parties',
        body: ['We rely on Agora, Hive, and Stripe for video, moderation, and payments.'],
      },
    ],
  },
  terms: {
    title: 'Terms of Service (Draft)',
    updated: 'February 4, 2026',
    sections: [
      {
        heading: 'Eligibility',
        body: ['You must be 18+ to use Verity.'],
      },
      {
        heading: 'Conduct',
        body: [
          'No harassment, nudity, or illegal activity.',
          'No recording of video sessions.',
        ],
      },
      {
        heading: 'Tokens',
        body: [
          'Tokens are non-refundable except where required by law.',
          'Tokens grant access to the queue and live sessions.',
        ],
      },
      {
        heading: 'Disputes',
        body: ['Governing law is Australia. Disputes handled per local law.'],
      },
    ],
  },
  community: {
    title: 'Community Guidelines (Draft)',
    updated: 'February 4, 2026',
    sections: [
      {
        heading: 'Respect & Safety',
        body: [
          'Treat others with respect.',
          'Harassment, hate speech, and threats result in bans.',
        ],
      },
      {
        heading: 'Moderation',
        body: [
          'Reports are reviewed and can lead to warnings or bans.',
          'Appeals can be requested via support@verity.app.',
        ],
      },
    ],
  },
  cookies: {
    title: 'Cookie & Tracking Notice (Draft)',
    updated: 'February 4, 2026',
    sections: [
      {
        heading: 'Essential cookies',
        body: ['We use cookies for authentication and session security.'],
      },
      {
        heading: 'Analytics',
        body: ['No advertising cookies are used in the beta.'],
      },
    ],
  },
};

export const Legal: React.FC = () => {
  const params = useParams();
  const docKey = params.doc ?? 'privacy';
  const doc = docs[docKey];

  if (!doc) {
    return (
      <section className="card">
        <h1 className="section-title">Document not found</h1>
        <p className="subtle">
          Go back to the <Link to="/settings">settings</Link> page.
        </p>
      </section>
    );
  }

  return (
    <section className="card">
      <p className="badge">Draft policy</p>
      <h1 className="section-title">{doc.title}</h1>
      <p className="subtle">Last updated {doc.updated}</p>
      {doc.sections.map((section) => (
        <div key={section.heading} className="legal-section">
          <h2 className="section-title">{section.heading}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph} className="subtle">
              {paragraph}
            </p>
          ))}
        </div>
      ))}
    </section>
  );
};
