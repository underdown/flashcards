import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Route, Routes, useNavigate } from 'react-router-dom';
import HomePage from './HomePage'; // Your homepage component
import App from './App'; // Your flashcard app component
import './index.css';

/** Client redirect so `/` lands on Japanese without tripping no-unused-vars on `<Navigate />`. */
function RedirectToJapanese() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/japanese', { replace: true });
  }, [navigate]);
  return null;
}

const Root = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<RedirectToJapanese />} />
        <Route path="/languages" element={<HomePage />} />
        <Route path="/russian" element={<App />} />
        <Route path="/spanish" element={<App />} />
        <Route path="/chinese" element={<App />} />
        <Route path="/japanese" element={<App />} />
      </Routes>
    </Router>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
