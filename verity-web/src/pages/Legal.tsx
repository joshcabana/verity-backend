import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { legalDocs } from '../legal/generated';

export const Legal: React.FC = () => {
  const params = useParams();
  const docKey = params.doc ?? 'privacy';
  const doc = legalDocs[docKey as keyof typeof legalDocs];
  const docLinks = [
    { key: 'privacy', label: 'Privacy' },
    { key: 'terms', label: 'Terms' },
    { key: 'community', label: 'Community' },
    { key: 'cookies', label: 'Cookies' },
  ] as const;

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
      <div className="legal-nav">
        {docLinks.map((link) => (
          <Link
            key={link.key}
            to={`/legal/${link.key}`}
            className={`legal-link${docKey === link.key ? ' active' : ''}`}
          >
            {link.label}
          </Link>
        ))}
      </div>
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
