import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import HomePage from './HomePage'; // Your homepage component
import App from './App'; // Your flashcard app component
import './index.css';

const Root = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
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
