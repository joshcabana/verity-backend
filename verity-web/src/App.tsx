import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { useAuth } from './hooks/useAuth';
import { Onboarding } from './pages/Onboarding';
import { Home } from './pages/Home';
import { Waiting } from './pages/Waiting';
import { Session } from './pages/Session';
import { Decision } from './pages/Decision';
import { Matches } from './pages/Matches';
import { Chat } from './pages/Chat';

const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  if (!token) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
};

export const App: React.FC = () => {
  const { token } = useAuth();

  return (
    <Layout>
      <Routes>
        <Route
          path="/"
          element={<Navigate to={token ? '/home' : '/onboarding'} replace />}
        />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route
          path="/home"
          element={
            <RequireAuth>
              <Home />
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
    </Layout>
  );
};
