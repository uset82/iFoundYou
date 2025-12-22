import React from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import App from './App';

const container = document.querySelector<HTMLDivElement>('#app');
if (!container) {
  throw new Error('Missing #app container');
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
