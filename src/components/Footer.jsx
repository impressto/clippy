import React from 'react';
import { Link, useParams } from 'react-router-dom';

export default function Footer() {
  const { id } = useParams();
  const isInSession = Boolean(id);

  return (
    <footer className="app-footer">
      {isInSession && (
        <div>
          <Link to="/" className="footer-home-link">
            Return to Home
          </Link>
        </div>
      )}
      <span>
        You can host this on your own web server.{' '}
        <a
          href="https://github.com/impressto/clippy"
          target="_blank"
          rel="noopener noreferrer"
        >
          View on GitHub
        </a>
        .
      </span>
    </footer>
  );
}
