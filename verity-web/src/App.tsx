import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { useAuth } from './hooks/useAuth';

const Onboarding = React.lazy(() =>
  import('./pages/Onboarding').then((module) => ({
    default: module.Onboarding,
  })),
);
const Home = React.lazy(() =>
  import('./pages/Home').then((module) => ({ default: module.Home })),
);
const Waiting = React.lazy(() =>
  import('./pages/Waiting').then((module) => ({ default: module.Waiting })),
);
const Session = React.lazy(() =>
  import('./pages/Session').then((module) => ({ default: module.Session })),
);
const Decision = React.lazy(() =>
  import('./pages/Decision').then((module) => ({ default: module.Decision })),
);
const Matches = React.lazy(() =>
  import('./pages/Matches').then((module) => ({ default: module.Matches })),
);
const Chat = React.lazy(() =>
  import('./pages/Chat').then((module) => ({ default: module.Chat })),
);
const Settings = React.lazy(() =>
  import('./pages/Settings').then((module) => ({ default: module.Settings })),
);
const Legal = React.lazy(() =>
  import('./pages/Legal').then((module) => ({ default: module.Legal })),
);
const AdminModeration = React.lazy(() =>
  import('./pages/AdminModeration').then((module) => ({
    default: module.AdminModeration,
  })),
);

const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  if (!token) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
};

const RouteFallback: React.FC = () => (
  <section className="card">
    <div className="inline">
      <div className="spinner" />
      <p className="subtle">Loading...</p>
    </div>
  </section>
);

export const App: React.FC = () => {
  const { token } = useAuth();

  return (
    <Layout>
      <React.Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route
            path="/"
            element={<Navigate to={token ? '/home' : '/onboarding'} replace />}
          />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/legal/:doc" element={<Legal />} />
          <Route path="/legal" element={<Legal />} />
          <Route
            path="/home"
            element={
              <RequireAuth>
                <Home />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <Settings />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/moderation"
            element={
              <RequireAuth>
                <AdminModeration />
              </RequireAuth>
            }
          />
          <Route
            path="/waiting"
            element={
              <RequireAuth>
                <Waiting />
              </RequireAuth>
            }
          />
          <Route
            path="/session/:sessionId"
            element={
              <RequireAuth>
                <Session />
              </RequireAuth>
            }
          />
          <Route
            path="/decision/:sessionId"
            element={
              <RequireAuth>
                <Decision />
              </RequireAuth>
            }
          />
          <Route
            path="/matches"
            element={
              <RequireAuth>
                <Matches />
              </RequireAuth>
            }
          />
          <Route
            path="/chat/:matchId"
            element={
              <RequireAuth>
                <Chat />
              </RequireAuth>
            }
          />
        </Routes>
      </React.Suspense>
    </Layout>
  );
};
