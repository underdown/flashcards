# Kartochki

**Learn languages with simple, private flashcards.**

A lightweight, privacy-focused flashcard app for practicing vocabulary and pronunciation in **Russian, Japanese, Spanish, and Chinese**.

All your progress is saved locally in the browser — no accounts, no servers, no tracking. Just open the app and start learning.

Live demo: [https://kartochki.app](https://kartochki.app)

## Features

- Flashcards for **Russian • Japanese • Spanish • Chinese**
- Clean, minimal interface optimized for quick practice sessions
- Swipe or tap to review cards (front → back, easy/hard feedback)
- Local progress tracking using **localStorage** (your data never leaves your device)
- Pronunciation support (especially strong for Japanese)
- Fully offline-capable once loaded
- No login, no ads, no analytics — complete privacy

## Tech Stack

- **Framework**: Next.js (React)
- **Styling**: [Tailwind CSS or your choice]
- **State & Storage**: React hooks + localStorage (no external database)
- **Deployment**: Static / Vercel / any hosting that supports Next.js

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm, yarn, or npm

### Installation

```bash
git clone https://github.com/underdown/flashcards.git
cd flashcards
yarn start
