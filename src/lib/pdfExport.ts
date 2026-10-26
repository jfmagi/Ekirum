import { UserProfile, Skill, Project, Achievement, Habit } from '../types';
import { getSkillRankTitle, getXpRequiredForLevel, getXpRequiredForNextLevel } from './characterMath';

export interface CharacterExportOptions {
  user: UserProfile;
  skills: Skill[];
  projects: Project[];
  achievements?: Achievement[];
  habits?: Habit[];
  tasksCompletedCount?: number;
  dossierTitle?: string;
  customNote?: string;
  exportDate?: string;
  includeStats?: boolean;
  includeAchievements?: boolean;
  includeHabits?: boolean;
}

export function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateCharacterDossierHtml(options: CharacterExportOptions): string {
  const {
    user,
    skills,
    projects,
    achievements = [],
    habits = [],
    tasksCompletedCount = 0,
    dossierTitle = 'Character Dossier & Skill Record',
    customNote,
    exportDate = new Date().toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    includeStats = true,
    includeAchievements = true,
    includeHabits = true,
  } = options;

  const projectsById = new Map(projects.map((p) => [p.id, p]));
  const unlockedAchievements = achievements.filter((a) => Boolean(a.unlockedAt));

  // Determine longest habit streak
  let maxHabitStreak = 0;
  for (const h of habits) {
    if (h.longestStreak > maxHabitStreak) maxHabitStreak = h.longestStreak;
    if (h.streak > maxHabitStreak) maxHabitStreak = h.streak;
  }

  const initials = user.name
    ? user.name
        .trim()
        .split(/\s+/)
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'EK';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ekirum — ${escapeHtml(user.name)} — Character Dossier</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Albert+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500&display=swap');

    :root {
      --bg: #FBFBF9;
      --surface: #FFFFFF;
      --charcoal: #1C1917;
      --muted: #57534E;
      --faint: #8C867A;
      --border: #E6E3DA;
      --border-dark: #D1CCC0;
      --crimson: #8B1528;
      --crimson-light: #FBF0F2;
      --gold: #B8860B;
      --gold-light: #D4AF37;
      --gold-bg: #FAF6EB;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg);
      color: var(--charcoal);
      font-family: 'Albert Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    /* Screen-only floating toolbar */
    .screen-toolbar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(28, 25, 23, 0.94);
      color: #FFFFFF;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }

    .screen-toolbar-title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 18px;
      font-weight: 600;
      letter-spacing: 0.5px;
    }

    .screen-toolbar-hint {
      font-size: 12px;
      color: #D1CCC0;
    }

    .screen-toolbar-actions {
      display: flex;
      gap: 10px;
    }

    .btn-print {
      background: #B8860B;
      color: #FFFFFF;
      border: none;
      padding: 7px 16px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      font-family: 'Albert Sans', sans-serif;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s;
    }

    .btn-print:hover {
      background: #D4AF37;
    }

    .btn-close {
      background: rgba(255, 255, 255, 0.12);
      color: #FFFFFF;
      border: 1px solid rgba(255, 255, 255, 0.2);
      padding: 7px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-family: 'Albert Sans', sans-serif;
      cursor: pointer;
    }

    .btn-close:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    /* Sheet Document */
    .sheet-wrapper {
      max-width: 820px;
      margin: 32px auto;
      padding: 0 20px 40px;
    }

    .sheet {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 40px 48px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.04);
      position: relative;
    }

    /* Document Header */
    .doc-header {
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 28px;
    }

    .doc-pretitle {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: var(--crimson);
      margin-bottom: 6px;
    }

    .doc-title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 30px;
      font-weight: 600;
      color: var(--charcoal);
      letter-spacing: -0.5px;
      line-height: 1.15;
    }

    .doc-meta {
      font-size: 11px;
      color: var(--muted);
      margin-top: 6px;
    }

    /* Character Profile Banner */
    .profile-card {
      display: flex;
      align-items: center;
      gap: 24px;
      background: #FAF9F6;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 28px;
    }

    .avatar-wrap {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      border: 2px solid var(--border-dark);
      overflow: hidden;
      flex-shrink: 0;
      background: var(--charcoal);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .avatar-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .avatar-monogram {
      font-family: 'Cormorant Garamond', serif;
      font-size: 32px;
      font-weight: 600;
      color: #FFFFFF;
      letter-spacing: 1px;
    }

    .profile-details {
      flex: 1;
      min-width: 0;
    }

    .rank-pill {
      display: inline-block;
      font-family: 'Cormorant Garamond', serif;
      font-size: 12px;
      font-weight: 600;
      color: var(--crimson);
      background: var(--crimson-light);
      border: 1px solid rgba(139, 21, 40, 0.2);
      padding: 2px 10px;
      border-radius: 9999px;
      margin-bottom: 6px;
    }

    .character-name {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 26px;
      font-weight: 600;
      color: var(--charcoal);
      line-height: 1.2;
    }

    .level-badge {
      font-size: 12px;
      color: var(--muted);
      font-weight: 500;
      margin-top: 2px;
    }

    .custom-quote {
      font-family: 'Cormorant Garamond', serif;
      font-style: italic;
      font-size: 14px;
      color: var(--muted);
      margin-top: 8px;
      border-left: 2px solid var(--gold);
      padding-left: 10px;
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 32px;
    }

    .stat-box {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px 14px;
      text-align: left;
    }

    .stat-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--faint);
    }

    .stat-value {
      font-family: 'Cormorant Garamond', serif;
      font-size: 22px;
      font-weight: 700;
      color: var(--charcoal);
      margin-top: 2px;
    }

    /* Section Titles */
    .section-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      border-bottom: 1px solid var(--border);
      padding-bottom: 8px;
      margin-bottom: 16px;
    }

    .section-title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 18px;
      font-weight: 600;
      color: var(--charcoal);
      letter-spacing: -0.2px;
    }

    .section-badge {
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
      color: var(--muted);
    }

    /* Skills Grid */
    .skills-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
      margin-bottom: 32px;
    }

    .skill-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 14px 16px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .skill-card-top {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 4px;
    }

    .skill-name {
      font-family: 'Cormorant Garamond', serif;
      font-size: 16px;
      font-weight: 700;
      color: var(--charcoal);
    }

    .skill-rank {
      font-family: 'Cormorant Garamond', serif;
      font-size: 12px;
      font-style: italic;
      color: var(--muted);
    }

    .skill-project-tag {
      font-size: 10px;
      color: var(--muted);
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .skill-project-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--gold);
      display: inline-block;
    }

    .skill-stats-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 11px;
      margin-top: 8px;
      margin-bottom: 4px;
    }

    .skill-level-text {
      font-weight: 600;
      color: var(--charcoal);
    }

    .skill-xp-text {
      font-family: 'JetBrains Mono', monospace;
      color: var(--muted);
      font-size: 10px;
    }

    .progress-bar-bg {
      height: 6px;
      background: #F1EFEA;
      border-radius: 9999px;
      overflow: hidden;
      border: 1px solid var(--border);
    }

    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #D4AF37, #B8860B);
      border-radius: 9999px;
    }

    /* Achievements Grid */
    .achievements-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-bottom: 32px;
    }

    .ach-card {
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px 14px;
      background: #FAF9F6;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .ach-title {
      font-family: 'Cormorant Garamond', serif;
      font-size: 14px;
      font-weight: 700;
      color: var(--charcoal);
    }

    .ach-desc {
      font-size: 11px;
      color: var(--muted);
      margin-top: 3px;
      line-height: 1.35;
    }

    .ach-date {
      font-size: 10px;
      color: var(--faint);
      margin-top: 6px;
    }

    /* Habits Table */
    .habits-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 32px;
      font-size: 12px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .habits-table th {
      text-align: left;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--faint);
      padding: 8px 10px;
      border-bottom: 1px solid var(--border-dark);
    }

    .habits-table td {
      padding: 8px 10px;
      border-bottom: 1px solid var(--border);
    }

    .habit-title {
      font-weight: 600;
      color: var(--charcoal);
    }

    /* Footer */
    .doc-footer {
      border-top: 1px solid var(--border);
      padding-top: 20px;
      margin-top: 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      color: var(--faint);
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .doc-footer-brand {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    /* Print Specific Styles */
    @media print {
      @page {
        size: A4 portrait;
        margin: 12mm 15mm;
      }

      body {
        background-color: #FFFFFF !important;
        font-size: 12px;
      }

      .screen-toolbar {
        display: none !important;
      }

      .sheet-wrapper {
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      .sheet {
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
      }

      .skills-grid {
        grid-template-columns: repeat(2, 1fr) !important;
      }

      .achievements-grid {
        grid-template-columns: repeat(2, 1fr) !important;
      }

      .page-break-inside-avoid {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
    }
  </style>
</head>
<body>
  <!-- Screen-only preview toolbar -->
  <div class="screen-toolbar">
    <div>
      <div class="screen-toolbar-title">Ekirum Character Dossier</div>
      <div class="screen-toolbar-hint">Print preview mode • Destination: "Save as PDF"</div>
    </div>
    <div class="screen-toolbar-actions">
      <button class="btn-print" onclick="window.print()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 6 2 18 2 18 9"></polyline>
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
          <rect x="6" y="14" width="12" height="8"></rect>
        </svg>
        Print / Save to PDF
      </button>
      <button class="btn-close" onclick="window.close()">Close</button>
    </div>
  </div>

  <div class="sheet-wrapper">
    <div class="sheet">
      <!-- Header -->
      <div class="doc-header">
        <div class="doc-pretitle">Personal Growth & Mastery Record</div>
        <h1 class="doc-title">${escapeHtml(dossierTitle)}</h1>
        <div class="doc-meta">
          Issued on ${escapeHtml(exportDate)} • Private Offline Dossier
        </div>
      </div>

      <!-- Character Banner -->
      <div class="profile-card">
        <div class="avatar-wrap">
          ${
            user.avatar
              ? `<img src="${escapeHtml(user.avatar)}" alt="${escapeHtml(user.name)}" class="avatar-img" />`
              : `<div class="avatar-monogram">${escapeHtml(initials)}</div>`
          }
        </div>
        <div class="profile-details">
          <div class="rank-pill">${escapeHtml(user.ekirumRank || 'Novice')}</div>
          <h2 class="character-name">${escapeHtml(user.name || 'Ekirum')}</h2>
          <div class="level-badge">Level ${user.ekirumLevel || 1} • ${(user.totalXp || 0).toLocaleString()} Total XP</div>
          ${
            customNote
              ? `<blockquote class="custom-quote">“${escapeHtml(customNote)}”</blockquote>`
              : ''
          }
        </div>
      </div>

      ${
        includeStats
          ? `<!-- Aggregate Stats -->
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-label">Total Experience</div>
          <div class="stat-value">${(user.totalXp || 0).toLocaleString()} <span style="font-size:12px; font-weight:normal; color:var(--muted)">XP</span></div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Tasks Completed</div>
          <div class="stat-value">${tasksCompletedCount.toLocaleString()}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Chosen Skills</div>
          <div class="stat-value">${skills.length}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Longest Streak</div>
          <div class="stat-value">${maxHabitStreak} <span style="font-size:12px; font-weight:normal; color:var(--muted)">days</span></div>
        </div>
      </div>`
          : ''
      }

      <!-- Chosen Skills Section -->
      <div class="section-head">
        <h3 class="section-title">Chosen Skills & Masteries</h3>
        <span class="section-badge">${skills.length} active</span>
      </div>

      ${
        skills.length > 0
          ? `<div class="skills-grid">
        ${skills
          .map((skill) => {
            const rankTitle = getSkillRankTitle(skill.level || 1);
            const currentLevelMinXp = getXpRequiredForLevel(skill.level || 1);
            const nextLevelXp = getXpRequiredForNextLevel(skill.level || 1);
            const levelRange = Math.max(1, nextLevelXp - currentLevelMinXp);
            const progressInLevel = Math.max(0, (skill.xp || 0) - currentLevelMinXp);
            const progressPercent = Math.min(100, Math.round((progressInLevel / levelRange) * 100));
            const linkedProject = skill.projectId ? projectsById.get(skill.projectId) : undefined;

            return `
          <div class="skill-card">
            <div class="skill-card-top">
              <span class="skill-name">${escapeHtml(skill.name)}</span>
              <span class="skill-rank">${escapeHtml(rankTitle)}</span>
            </div>
            ${
              linkedProject
                ? `<div class="skill-project-tag">
                    <span class="skill-project-dot"></span>
                    <span>Project: ${escapeHtml(linkedProject.name)}</span>
                   </div>`
                : ''
            }
            <div class="skill-stats-row">
              <span class="skill-level-text">Level ${skill.level || 1}</span>
              <span class="skill-xp-text">${skill.xp || 0} / ${nextLevelXp} XP</span>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: ${progressPercent}%;"></div>
            </div>
          </div>
          `;
          })
          .join('')}
      </div>`
          : `<p style="color:var(--muted); font-size:12px; margin-bottom: 24px; font-style:italic;">No skills selected for this dossier.</p>`
      }

      ${
        includeAchievements && unlockedAchievements.length > 0
          ? `<!-- Achievements Section -->
      <div class="section-head">
        <h3 class="section-title">Honors & Milestone Achievements</h3>
        <span class="section-badge">${unlockedAchievements.length} unlocked</span>
      </div>

      <div class="achievements-grid">
        ${unlockedAchievements
          .map((ach) => {
            const dateStr = ach.unlockedAt
              ? new Date(ach.unlockedAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })
              : '';
            return `
          <div class="ach-card">
            <div class="ach-title">${escapeHtml(ach.title)}</div>
            <div class="ach-desc">${escapeHtml(ach.description)}</div>
            ${dateStr ? `<div class="ach-date">Achieved on ${escapeHtml(dateStr)}</div>` : ''}
          </div>
          `;
          })
          .join('')}
      </div>`
          : ''
      }

      ${
        includeHabits && habits.length > 0
          ? `<!-- Habits Cadence -->
      <div class="section-head">
        <h3 class="section-title">Rituals & Habit Cadence</h3>
        <span class="section-badge">${habits.length} rituals</span>
      </div>

      <table class="habits-table">
        <thead>
          <tr>
            <th>Habit Ritual</th>
            <th>Cadence</th>
            <th>Current Streak</th>
            <th>Best Streak</th>
          </tr>
        </thead>
        <tbody>
          ${habits
            .map(
              (h) => `
            <tr>
              <td class="habit-title">${escapeHtml(h.title)}</td>
              <td style="color:var(--muted); text-transform:capitalize">${escapeHtml(h.frequency || 'daily')}</td>
              <td style="font-family:'JetBrains Mono', monospace; font-weight:600">${h.streak || 0} days</td>
              <td style="font-family:'JetBrains Mono', monospace; color:var(--muted)">${h.longestStreak || 0} days</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>`
          : ''
      }

      <!-- Footer -->
      <div class="doc-footer">
        <div class="doc-footer-brand">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
            <path d="M2 17l10 5 10-5"></path>
            <path d="M2 12l10 5 10-5"></path>
          </svg>
          <span>Ekirum Productivity Architecture</span>
        </div>
        <div>
          Official Character Dossier • Private On-Device Record
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Triggers native Print-to-PDF via an isolated hidden iframe.
 * The user's browser print dialog defaults to "Save as PDF", producing
 * high-resolution vector PDF with embedded fonts, selectable text, and clean page breaks.
 */
export function printCharacterDossier(htmlContent: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.srcdoc = htmlContent;

  document.body.appendChild(iframe);

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error('Print iframe failed:', e);
      // Fallback: open in new tab if iframe printing was blocked by sandbox/browser
      openDossierInNewTab(htmlContent);
    } finally {
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 60000);
    }
  };
}

/**
 * Opens the dossier in a new window/tab for full screen inspection or direct printing.
 */
export function openDossierInNewTab(htmlContent: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) {
    win.focus();
  }
}

/**
 * Downloads a standalone, offline HTML archive of the character dossier.
 */
export function downloadHtmlDossier(htmlContent: string, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.html') ? filename : `${filename}.html`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
