import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, signOut } = useAuth();

  return (
    <main>
      <header>
        <Link className="brand" to={token ? '/home' : '/onboarding'}>
          Verity
        </Link>
        <nav className="nav">
          {token ? (
            <>
              <NavLink to="/home">Home</NavLink>
              <NavLink to="/matches">Matches</NavLink>
              <NavLink to="/settings">Settings</NavLink>
              <NavLink to="/admin/moderation">Admin</NavLink>
              <button className="button secondary" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <NavLink to="/onboarding">Get started</NavLink>
          )}
        </nav>
      </header>
      {children}
    </main>
  );
};
