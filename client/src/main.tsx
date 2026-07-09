import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useAppStore } from './store/appStore';
import './styles/global.css';

try {
  const savedTitle = window.localStorage.getItem('tk_browser_title')?.trim();
  if (savedTitle) document.title = savedTitle.slice(0, 40);
} catch {
  // localStorage may be unavailable in strict browser privacy modes.
}

useAppStore.getState().connect();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
