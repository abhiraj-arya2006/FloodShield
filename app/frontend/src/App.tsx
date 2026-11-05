import React, { useEffect } from 'react';
import { createBrowserRouter, Navigate, Route, RouterProvider, Routes, useLocation } from 'react-router-dom';
import { LanguageProvider } from './i18n/LanguageContext';
import { DashboardPage } from './pages/DashboardPage';
import { LandingPage } from './pages/LandingPage';
import { LivingRiverPage } from './pages/LivingRiverPage';
import { GaugeForecastPage } from './pages/GaugeForecastPage';
import { AlertsFeedPage } from './pages/AlertsFeedPage';
import { ModelInfoPage } from './pages/ModelInfoPage';
import { PlatformNav } from './platform/PlatformNav';
import { useForecastStore } from './platform/store';
import './platform/platform.css';

const AppShell: React.FC = () => {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  useEffect(() => { void useForecastStore.getState().loadLive(); }, []);

  if (pathname === '/') return <div className="pf-landing"><LandingPage /></div>;
  if (pathname === '/river') return <LivingRiverPage />;

  return (
    <div className="pf">
      <PlatformNav />
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/gauge/:id" element={<GaugeForecastPage />} />
        <Route path="/alerts" element={<AlertsFeedPage />} />
        <Route path="/model-info" element={<ModelInfoPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
};

/* A data router is what makes the page-change transitions on links work. */
const router = createBrowserRouter([{ path: '*', element: <AppShell /> }]);

export const App: React.FC = () => (
  <LanguageProvider>
    <RouterProvider router={router} />
  </LanguageProvider>
);

export default App;
