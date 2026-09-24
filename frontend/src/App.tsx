import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SimulationBanner } from './components/SimulationBanner';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { MapPage } from './pages/MapPage';
import { ForecastPage } from './pages/ForecastPage';
import { HistoricalPage } from './pages/HistoricalPage';
import { SatellitePage } from './pages/SatellitePage';
import { ModelsPage } from './pages/ModelsPage';
import { ResearchPage } from './pages/ResearchPage';
import { AlertsPage } from './pages/AlertsPage';
import { SettingsPage } from './pages/SettingsPage';
import { liveWsClient } from './services/websocket';

export const App: React.FC = () => {
  useEffect(() => {
    // Connect WebSocket on mount
    liveWsClient.connect();
    return () => {
      liveWsClient.disconnect();
    };
  }, []);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-cyan-500 selection:text-slate-950">
        {/* Persistent Simulation Warning Banner on every page */}
        <SimulationBanner />

        {/* Global Operations Header with Simulation Clock */}
        <Header />

        {/* Main Application Shell with Sidebar and Viewport */}
        <div className="flex-1 flex overflow-hidden">
          <Sidebar />

          <main className="flex-1 overflow-y-auto bg-linear-to-br from-slate-950 via-slate-900/40 to-slate-950">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/forecast" element={<ForecastPage />} />
              <Route path="/historical" element={<HistoricalPage />} />
              <Route path="/satellite" element={<SatellitePage />} />
              <Route path="/models" element={<ModelsPage />} />
              <Route path="/research" element={<ResearchPage />} />
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
};

export default App;
