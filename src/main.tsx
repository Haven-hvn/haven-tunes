import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/win2k-tunes.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
