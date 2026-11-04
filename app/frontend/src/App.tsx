import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { LanguageProvider } from './i18n/LanguageContext';
import { DashboardPage } from './pages/DashboardPage';
import { LandingPage } from './pages/LandingPage';
import { LivingRiverPage } from './pages/LivingRiverPage';
import { GaugeForecastPage } from './pages/GaugeForecastPage';
import { AlertsFeedPage } from './pages/AlertsFeedPage';
import { ModelInfoPage } from './pages/ModelInfoPage';
import { PlatformNav } from './platform/PlatformNav';
import './platform/platform.css';

const AppShell: React.FC = () => {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

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

export const App: React.FC = () => (
  <LanguageProvider>
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  </LanguageProvider>
);

export default App;
