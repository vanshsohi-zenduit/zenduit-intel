import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import LeadDetail from './pages/LeadDetail.jsx'
import Login from './pages/Login.jsx'
import { getAuthToken } from './lib/auth.js'

function ProtectedRoute({ children }) {
  const [state, setState] = useState('loading');

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.ok ? r.json() : null)
      .then(h => {
        if (!h?.auth_required) {
          setState('ok');
        } else if (getAuthToken()) {
          setState('ok');
        } else {
          setState('login');
        }
      })
      .catch(() => setState('ok'));
  }, []);

  if (state === 'loading') return null;
  if (state === 'login') return <Navigate to="/login" replace />;
  return children;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/lead/:id" element={<LeadDetail />} />
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<ProtectedRoute><App /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
