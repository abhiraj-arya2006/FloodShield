import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LanguageProvider } from './i18n/LanguageContext';
import { Navbar } from './components/Navbar';
import { DisclaimerBanner } from './components/DisclaimerBanner';
import { Footer } from './components/Footer';
import { DashboardPage } from './pages/DashboardPage';
import { GaugeForecastPage } from './pages/GaugeForecastPage';
import { AlertsFeedPage } from './pages/AlertsFeedPage';
import { ModelInfoPage } from './pages/ModelInfoPage';

export const App: React.FC = () => {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col bg-[#070d1a] text-slate-100 font-sans selection:bg-cyan-500 selection:text-black">
          {/* Main Navigation */}
          <Navbar />

          {/* Official CWC Flood Stage Notice Banner */}
          <DisclaimerBanner />

          {/* Content Area */}
          <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-8">
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/gauge/:id" element={<GaugeForecastPage />} />
              <Route path="/alerts" element={<AlertsFeedPage />} />
              <Route path="/model-info" element={<ModelInfoPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>

          {/* System Footer */}
          <Footer />
        </div>
      </BrowserRouter>
    </LanguageProvider>
  );
};

export default App;
