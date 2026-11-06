import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LanguageProvider } from './i18n/LanguageContext';
import { Navbar } from './components/Navbar';
import { DisclaimerBanner } from './components/DisclaimerBanner';
import { Footer } from './components/Footer';
import { DashboardPage } from './pages/DashboardPage';
import { GaugeForecastPage } from './pages/GaugeForecastPage';
import { AlertsFeedPage } from './pages/AlertsFeedPage';
import { ModelInfoPage } from './pages/ModelInfoPage';
import { WhatIfModal } from './components/common/WhatIfModal';
import { TechDocsModal } from './components/common/TechDocsModal';
import { Landing } from './landing/Landing';

const INTRO_KEY = 'fs_intro';

export const App: React.FC = () => {
  const [isWhatIfOpen, setIsWhatIfOpen] = useState(() => {
    return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('whatif');
  });
  const [isDocsOpen, setIsDocsOpen] = useState(() => {
    return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('docs');
  });

  // The intro plays once per browser session, on the home URL only.
  const [entered, setEntered] = useState(() => {
    if (typeof window === 'undefined') return true;
    const q = new URLSearchParams(window.location.search);
    return (
      q.has('skip') ||
      q.has('whatif') ||
      q.has('docs') ||
      window.location.pathname !== '/' ||
      sessionStorage.getItem(INTRO_KEY) === '1'
    );
  });
  const [arrived, setArrived] = useState(false);

  const handleEnter = () => {
    sessionStorage.setItem(INTRO_KEY, '1');
    window.scrollTo(0, 0);
    setArrived(true);
    setEntered(true);
  };

  const replayIntro = () => {
    sessionStorage.removeItem(INTRO_KEY);
    window.scrollTo(0, 0);
    setArrived(false);
    setEntered(false);
  };

  if (!entered) return <Landing onEnter={handleEnter} />;

  return (
    <LanguageProvider>
      <BrowserRouter>
        <div
          className={`min-h-screen flex flex-col bg-midnight text-mist font-sans selection:bg-silt/30 selection:text-white relative${
            arrived ? ' fs-arrive' : ''
          }`}
        >
          {/* Main Navigation */}
          <Navbar
            onOpenWhatIf={() => setIsWhatIfOpen(true)}
            onOpenDocs={() => setIsDocsOpen(true)}
            onReplayIntro={replayIntro}
          />

          {/* Official CWC Flood Stage Notice Banner */}
          <DisclaimerBanner />

          {/* Content Area */}
          <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-8 relative z-10">
            <Routes>
              <Route
                path="/"
                element={
                  <DashboardPage
                    onOpenWhatIf={() => setIsWhatIfOpen(true)}
                    onOpenDocs={() => setIsDocsOpen(true)}
                  />
                }
              />
              <Route path="/gauge/:id" element={<GaugeForecastPage />} />
              <Route path="/alerts" element={<AlertsFeedPage />} />
              <Route path="/model-info" element={<ModelInfoPage onOpenDocs={() => setIsDocsOpen(true)} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>

          {/* System Footer */}
          <Footer onOpenDocs={() => setIsDocsOpen(true)} />

          {/* Modals */}
          <WhatIfModal isOpen={isWhatIfOpen} onClose={() => setIsWhatIfOpen(false)} />
          <TechDocsModal isOpen={isDocsOpen} onClose={() => setIsDocsOpen(false)} />
        </div>
      </BrowserRouter>
    </LanguageProvider>
  );
};

export default App;
