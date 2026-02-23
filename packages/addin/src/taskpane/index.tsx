import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Office.js must be fully initialized before mounting React.
// Office.onReady() resolves when the Office host (Outlook) is ready.
Office.onReady(() => {
  const root = document.getElementById('root');
  if (!root) return;

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
