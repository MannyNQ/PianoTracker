import { useEffect, useState } from 'react';
import Landing from './components/Landing';
import Studio from './Studio';

// Two views: the landing page and the studio. "#studio" (or a "#job=<id>"
// session link) opens the studio, so links and the back button work.
const viewFromHash = () => (/^#(studio|job=)/.test(window.location.hash) ? 'studio' : 'landing');

export default function App() {
  const [view, setView] = useState(viewFromHash);

  useEffect(() => {
    const sync = () => setView(viewFromHash());
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  if (view === 'landing') {
    return (
      <Landing
        onEnter={() => {
          window.history.pushState(null, '', '#studio');
          setView('studio');
        }}
      />
    );
  }
  return (
    <Studio
      onHome={() => {
        window.history.pushState(null, '', window.location.pathname);
        setView('landing');
      }}
    />
  );
}
