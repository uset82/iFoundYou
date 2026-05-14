import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import App from './App';

registerSW({ immediate: true });

const container = document.querySelector<HTMLDivElement>('#app');
if (!container) {
  throw new Error('Missing #app container');
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
