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
              <NavLink
                to="/home"
                className={({ isActive }) =>
                  `nav-link${isActive ? ' active' : ''}`
                }
              >
                Home
              </NavLink>
              <NavLink
                to="/matches"
                className={({ isActive }) =>
                  `nav-link${isActive ? ' active' : ''}`
                }
              >
                Matches
              </NavLink>
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  `nav-link${isActive ? ' active' : ''}`
                }
              >
                Settings
              </NavLink>
              <NavLink
                to="/admin/moderation"
                className={({ isActive }) =>
                  `nav-link${isActive ? ' active' : ''}`
                }
              >
                Admin
              </NavLink>
              <button className="button secondary" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <NavLink
              to="/onboarding"
              className={({ isActive }) =>
                `nav-link${isActive ? ' active' : ''}`
              }
            >
              Get started
            </NavLink>
          )}
        </nav>
      </header>
      {children}
    </main>
  );
};
