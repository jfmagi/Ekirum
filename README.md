# Ekirum

> **A local-first, privacy-respecting personal mastery system.**  
> Plan tasks, cultivate disciplines, defuse thought entanglements, and grow your character — completely offline and sovereign.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-stone.svg)](LICENSE)
[![React 19](https://img.shields.io/badge/React-19-black.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org/)
[![Local--First](https://img.shields.io/badge/Storage-IndexedDB-emerald.svg)]()

Ekirum pairs minimalist task planning with a quiet RPG progression loop inspired by Acceptance and Commitment Therapy (ACT). All data remains on your physical device via IndexedDB; nothing touches a remote server unless you configure peer folder synchronization.

---

## Philosophy & Core Pillars

- **Radical Privacy**: Zero accounts, zero telemetry, zero surveillance. Your thoughts and plans belong strictly to you.
- **Cognitive Defusion**: A built-in sanctuary to step back from distressing thoughts, sealed with AES-GCM 256-bit client-side encryption or burned to ash.
- **Compound Growth**: Projects map directly to character Skills. Completing tasks, honoring habits, and finishing books advance your Rank from *Novice* to *Grandmaster*.
- **Quiet Interface**: Warm stone, charcoal, and crimson typography designed to reduce cognitive friction and foster calm, sustained focus.

---

## Key Capabilities

### 1. Focused Planning & Multi-View Calendar
- **Now o'clock**: A dedicated daily execution cockpit prioritizing what matters today.
- **Calendar & Timeline**: Month and week calendars with drag-and-drop scheduling, overdue indicators, and a floating backlog tray.
- **Priority Gradation**: Explicit, low-friction priority weighting (`P1`–`P4`) granting calibrated XP bonuses upon completion.

### 2. Multilingual Natural Language Parser
Add tasks effortlessly in English, Polish, or Spanish with dates, times, recurrences, priorities, and batch multipliers:
- `Draft essay tomorrow at 3pm p1 @Writing #focus`
- `Zapłacić rachunki w piątek o 10:00 #admin`
- `Revisar informe mañana al mediodía p2 @Trabajo`
- `Drink water x5 daily` *(creates 5 batch checkpoints)*

### 3. Defusion Chamber (Encrypted Vault & Burning)
- An ACT-informed practice to decouple from overthinking and intrusive thoughts.
- Encrypted with AES-GCM (PBKDF2 with 100,000 iterations and unique salt).
- **Burn to Ash**: Watch thoughts dissolve into embers with irreversible deletion.
- **Seal in Vault**: Archive thoughts behind a zero-knowledge local passphrase.
- Contributes silent progression XP without gamifying emotional distress.

### 4. Character Mastery & PDF Export
- Character sheet tracking overall level, skill distribution, and achievement milestones.
- Vector-rendered, publication-grade **Character PDF Export** formatted for printing, resume supplements, or personal archiving.

### 5. Media Library
- Catalog books, films, and essays from backlog to completion.
- Record reading timestamps, quotes, star ratings, and personal reflections.
- Linked directly to character skills to award mastery XP upon completion.

### 6. Decentralized Multi-Device Sync
- Synchronize across desktop, laptop, and mobile devices using any shared folder (iCloud Drive, Google Drive, Syncthing, Nextcloud, or local disk).
- Deterministic Last-Write-Wins (LWW) conflict resolution and delta merging without third-party accounts.

---

## Quick Start

### Web App
Use online at **[ekirum.tech](https://ekirum.tech)**. Installable as a standalone PWA on macOS, Windows, Linux, iOS, and Android.

### Local Development

```bash
# Clone the repository
git clone https://github.com/jfmagi/Ekirum.git
cd Ekirum

# Install dependencies
npm install

# Start development server
npm run dev
```

Run test suite:
```bash
npm test
```

Build production bundle:
```bash
npm run build
```

---

## Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `Q` | Open Quick Add bar |
| `⌘K` / `Ctrl+K` | Open Command Palette |
| `1` | Navigate to Now o'clock |
| `2` | Navigate to Calendar |
| `3` | Navigate to Timeline |
| `4` | Navigate to Habits |
| `?` | Open System & Priority Guide |
| `Esc` | Close active dialogs |

---

## Tech Stack

- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS v4 + Cormorant Garamond & Albert Sans
- **Database**: Dexie.js (IndexedDB)
- **State Management**: Zustand
- **Cryptography**: Web Crypto API (SubtleCrypto AES-GCM-256 + PBKDF2)
- **Document Export**: PDF-Lib

---

## License

GNU Affero General Public License v3.0 ([AGPL-3.0](LICENSE)).
