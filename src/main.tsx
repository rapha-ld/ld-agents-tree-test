import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Report } from './report/Report';
import { Study } from './study/Study';
import './app.css';

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

function GlobalNav({ view }: { view: 'study' | 'report' }) {
  return (
    <header className="globalnav">
      <span className="brand">LD Nav Lab</span>
      <nav aria-label="Sections">
        <a href="#/study" className={view === 'study' ? 'active' : undefined} aria-current={view === 'study'}>
          Study
        </a>
        <a href="#/report" className={view === 'report' ? 'active' : undefined} aria-current={view === 'report'}>
          Report
        </a>
      </nav>
    </header>
  );
}

function App() {
  const hash = useHashRoute();
  // The report is the operator's view; anything else is what a participant sees.
  const view = hash.startsWith('#/report') ? 'report' : 'study';
  return (
    <>
      <GlobalNav view={view} />
      {view === 'report' ? <Report /> : <Study />}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
