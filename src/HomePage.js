import React from 'react';
import './App.css';

const HomePage = () => {
  return (
    <div className="home-page">
      <h1>Welcome</h1>
      <p>Select a language to start practicing:</p>
      <div className="language-links">
        <a href="/russian" className="language-link button">Russian</a>
        <a href="/spanish" className="language-link button">Spanish</a>
        <a href="/chinese" className="language-link button">Chinese</a>
      </div>
      <footer className="footer">
        <img src="hotpink.svg" alt="Logo" className="footer-logo" />
      </footer>
    </div>
  );
};

export default HomePage;
