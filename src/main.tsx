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

function App() {
  const hash = useHashRoute();
  // The report is the operator's view; anything else is what a participant sees.
  return hash.startsWith('#/report') ? <Report /> : <Study />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
