# Ekirum

> Personal Task, Habit & Mastery System
>
> A local-first, privacy-respecting productivity web app for planning, tracking, and leveling up your focus, habits, and tasks.

Ekirum is built with React 19, TypeScript, Tailwind CSS v4, Dexie.js, and Zustand. It stores all personal data in the browser using IndexedDB, so your tasks, habits, projects, and progress stay local to your device unless you explicitly export or back up data.

## Overview

Ekirum combines productivity planning with a lightweight RPG-inspired progression loop:

- Task scheduling and natural-language task creation
- Recurring habits with streak tracking and recovery
- Project and character-based skill progression
- Calendar, timeline, and board views
- Local backups, JSON import/export, and sync-friendly backups
- Offline-first behavior with browser-installed app support

## Key Features

- Local-first storage with IndexedDB and Dexie.js
- Natural language task parsing such as:
  - `meditate daily at 18:00 @meditation #mindfulness`
  - `drink vodka @work in 3 days`
- Multiple task views:
  - Today / Now view
  - Calendar view
  - Timeline view
- Habit tracking with streaks, recurring schedules, and milestone recovery
- Mastery system with ranks, XP, and skill growth tied to projects
- Library that lets you track books and films from queue to completion, link them to skills, and archive finished titles with your reviews to advance character progression.
- Local backup and restore workflow with JSON export/import
- Browser installation support for standalone app use
- Offline-ready experience in supported browsers

## Quick Start

### Use online

Open [ekirum.tech](https://ekirum.tech) in a working browser.

Your data stays on your device in IndexedDB. You can also install Ekirum as a standalone app from the browser menu in supported Chromium, Safari, and Android browsers.

> **Note:** all data is stored locally in your browser. Clearing site data (cookies and other site data) will delete it, so keep backups.

### Run locally

#### Prerequisites

- Node.js v18+
- npm v9+

#### Installation

```bash
git clone https://github.com/jfmagi/Ekirum.git
cd Ekirum
npm install
npm run dev
```
Vite will print a local URL in the terminal (usually \`http\://localhost:5173\`). Open it in your browser.

> On macOS, you can also launch the app anytime by double-clicking `Ekirum.command` in the project folder.

## Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Vite dev server with hot module replacement. |
| `npm run build` | Type-checks the app and builds the production bundle for deployment. |
| `npm run preview` | Previews the production build locally. |
| `npm test` | Runs the project test suite for tasks, calendar logic, XP caps, character progression, and library behavior. |

## Natural Language Examples

| Syntax | Example | Result |
| :--- | :--- | :--- |
| Dates | `today`, `tomorrow`, `friday`, `in 3 days` | Sets a due date |
| Hours | `at 3pm`, `14:30`, `at 9am`, `noon` | Sets a time |
| Recurrence | `daily`, `weekdays`, `every week`, `monthly` | Creates a repeating task |
| Priority | `p1`, `p2`, `p3`, `p4` | Assigns a priority |
| Projects | `@Design`, `@Fitness` | Assigns a project |
| Labels | `#urgent`, `#deepwork` | Adds tags |
| Multipliers | `x3`, `x5` | Creates a batch of tasks |

## Privacy & Architecture

Ekirum is local-first: it stores data on your device, optionally synchronizes it across devices through the cloud, supports JSON backups, and remains fully functional without relying on a remote personal-data store.

## License

AGPLv3
