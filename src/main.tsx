import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Moderator } from './moderator/Moderator';
import { Report } from './report/Report';
import { reportIncluded } from './report-included';
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

function GlobalNav({ view }: { view: 'study' | 'report' | 'send' }) {
  return (
    <header className="globalnav">
      <span className="brand">LD Nav Lab</span>
      {reportIncluded ? (
        <nav aria-label="Sections">
          <a href="#/study" className={view === 'study' ? 'active' : undefined} aria-current={view === 'study'}>
            Study
          </a>
          <a href="#/send" className={view === 'send' ? 'active' : undefined} aria-current={view === 'send'}>
            Send
          </a>
          <a href="#/report" className={view === 'report' ? 'active' : undefined} aria-current={view === 'report'}>
            Report
          </a>
        </nav>
      ) : null}
    </header>
  );
}

function App() {
  const hash = useHashRoute();
  // The report is the operator's view; anything else is what a participant sees.
  // A production build has no report, so #/report falls through to the study
  // rather than rendering a broken or empty page.
  // The report and the send screen are both operator views: they name the menus,
  // which is exactly what a participant must not see. Gated the same way, so a
  // published build has neither.
  const view: 'study' | 'report' | 'send' = !reportIncluded
    ? 'study'
    : hash.startsWith('#/report')
      ? 'report'
      : hash.startsWith('#/send')
        ? 'send'
        : 'study';
  return (
    <>
      <GlobalNav view={view} />
      {view === 'report' ? <Report /> : view === 'send' ? <Moderator /> : <Study />}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
