import React from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const routePrefetchers: Record<string, () => Promise<unknown>> = {
  '/home': () => import('../pages/Home'),
  '/matches': () => import('../pages/Matches'),
  '/settings': () => import('../pages/Settings'),
  '/admin/moderation': () => import('../pages/AdminModeration'),
  '/waiting': () => import('../pages/Waiting'),
  '/onboarding': () => import('../pages/Onboarding'),
};

export const Layout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { token, signOut } = useAuth();
  const location = useLocation();
  const showMarketingHomeNav = Boolean(token && location.pathname === '/home');

  const prefetchRoute = (path: string) => {
    const prefetch = routePrefetchers[path];
    if (prefetch) {
      void prefetch();
    }
  };

  return (
    <main>
      <header>
        <Link className="brand" to={token ? '/home' : '/onboarding'}>
          Verity
        </Link>
        <nav className="nav">
          {token ? (
            <>
              {showMarketingHomeNav ? (
                <>
                  <a className="nav-link" href="#home-how-it-works">
                    How It Works
                  </a>
                  <a className="nav-link" href="#home-safety">
                    Safety
                  </a>
                  <a className="nav-link" href="#home-pricing">
                    Pricing
                  </a>
                  <a className="button" href="#home-primary-live">
                    Go Live
                  </a>
                </>
              ) : (
                <>
                  <NavLink
                    to="/home"
                    className={({ isActive }) =>
                      `nav-link${isActive ? ' active' : ''}`
                    }
                    onMouseEnter={() => prefetchRoute('/home')}
                    onFocus={() => prefetchRoute('/home')}
                  >
                    Home
                  </NavLink>
                  <NavLink
                    to="/matches"
                    className={({ isActive }) =>
                      `nav-link${isActive ? ' active' : ''}`
                    }
                    onMouseEnter={() => prefetchRoute('/matches')}
                    onFocus={() => prefetchRoute('/matches')}
                  >
                    Matches
                  </NavLink>
                  <NavLink
                    to="/settings"
                    className={({ isActive }) =>
                      `nav-link${isActive ? ' active' : ''}`
                    }
                    onMouseEnter={() => prefetchRoute('/settings')}
                    onFocus={() => prefetchRoute('/settings')}
                  >
                    Settings
                  </NavLink>
                  <NavLink
                    to="/admin/moderation"
                    className={({ isActive }) =>
                      `nav-link${isActive ? ' active' : ''}`
                    }
                    onMouseEnter={() => prefetchRoute('/admin/moderation')}
                    onFocus={() => prefetchRoute('/admin/moderation')}
                  >
                    Admin
                  </NavLink>
                  <button className="button secondary" onClick={signOut}>
                    Sign out
                  </button>
                </>
              )}
            </>
          ) : (
            <NavLink
              to="/onboarding"
              className={({ isActive }) =>
                `nav-link${isActive ? ' active' : ''}`
              }
              onMouseEnter={() => prefetchRoute('/onboarding')}
              onFocus={() => prefetchRoute('/onboarding')}
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
