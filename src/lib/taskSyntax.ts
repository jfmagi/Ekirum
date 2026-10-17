import { Priority } from '../types';

export type TokenType =
  | 'text'
  | 'date'
  | 'time'
  | 'duration'
  | 'recurrence'
  | 'priority'
  | 'project'
  | 'label'
  | 'multiplier';

export interface SyntaxToken {
  text: string;
  type: TokenType;
  priorityLevel?: Priority;
}

interface Span {
  start: number;
  end: number;
  type: TokenType;
  priorityLevel?: Priority;
}

import {
  FULL_DAYS_MAP,
  SHORT_DAYS_MAP,
  MONTHS_MAP,
} from './dateParser';

// Unicode word-boundary helpers for multilingual tokenization (supports accents/diacritics in PL & ES)
const WB_S = '(?<![\\p{L}\\p{N}])';
const WB_E = '(?![\\p{L}\\p{N}])';

const FULL_DAYS_P = Object.keys(FULL_DAYS_MAP).join('|');
const SHORT_DAYS_P = Object.keys(SHORT_DAYS_MAP).join('|');
const ALL_DAYS_P = `${FULL_DAYS_P}|${SHORT_DAYS_P}`;
const MONTHS_P = Object.keys(MONTHS_MAP).join('|');
const MODIFIERS_P =
  '(?:on|next|this|w|we|w\\s+ten|w\\s+tę|w\\s+te|ten|tę|te|następny|nastepny|w\\s+następny|w\\s+nastepny|przyszły|przyszly|w\\s+przyszły|w\\s+przyszly|el|este|esta|próximo|proximo|el\\s+próximo|el\\s+proximo)';

const PATTERNS: {
  type: TokenType;
  regex: RegExp;
  getPriority?: (match: string) => Priority;
}[] = [
  // 1. Recurrence commands (English, Polish, Spanish)
  {
    type: 'recurrence',
    regex: new RegExp(
      `${WB_S}(?:` +
        `(?:every|co|w\\s+każdy|w\\s+kazdy|w\\s+każdą|w\\s+kazda|każdy|kazdy|każdą|kazda|todos\\s+los|cada)\\s+(${ALL_DAYS_P})` +
        `|daily|everyday|every\\s+day|each\\s+day|every\\s+single\\s+day|day\\s+to\\s+day|codziennie|co\\s+dzień|co\\s+dzien|diariamente|a\\s+diario|todos\\s+los\\s+días|todos\\s+los\\s+dias|cada\\s+día|cada\\s+dia` +
        `|weekdays?|every\\s+weekday|each\\s+weekday|w\\s+dni\\s+robocze|dni\\s+robocze|w\\s+dni\\s+powszednie|dni\\s+powszednie|días\\s+laborales|dias\\s+laborales|días\\s+laborables|dias\\s+laborables|entre\\s+semana` +
        `|weekly|every\\s+week|each\\s+week|co\\s+tydzień|co\\s+tydzien|tygodniowo|semanalmente|todas\\s+las\\s+semanas|cada\\s+semana` +
        `|monthly|every\\s+month|each\\s+month|co\\s+miesiąc|co\\s+miesiac|miesięcznie|miesiecznie|mensualmente|todos\\s+los\\s+meses|cada\\s+mes` +
      `)${WB_E}`,
      'giu'
    ),
  },
  // 2. Project tag (@ProjectName)
  {
    type: 'project',
    regex: /@[a-zA-Z0-9_\-]+/g,
  },
  // 3. Label tag (#label)
  {
    type: 'label',
    regex: /#[a-zA-Z0-9_\-]+/g,
  },
  // 4. Priority commands (p1, p2, p3, p4 or !1, !2, !3, !4)
  {
    type: 'priority',
    regex: new RegExp(`${WB_S}(?:p[1-4]|![1-4])${WB_E}`, 'giu'),
    getPriority: (m: string) => `p${m.replace(/[p!]/i, '')}` as Priority,
  },
  // 5. Multiplier commands (x2, x3, 3x, 5x, etc.)
  {
    type: 'multiplier',
    regex: new RegExp(`${WB_S}(?:x\\d+|\\d+x)${WB_E}`, 'giu'),
  },
  // 6. Time commands (English, Polish, Spanish)
  {
    type: 'time',
    regex: new RegExp(
      `${WB_S}(?:` +
        `(?:(?:at|w|o|al|a)\\s+)?(?:noon|midnight|południe|poludnie|północy|polnocy|mediodía|mediodia|medianoche)` +
        `|(?:(?:at|o|a\\s+las?)\\s+)?(?:[01]?\\d|2[0-3]):[0-5]\\d` +
        `|(?:(?:at|o|a\\s+las?)\\s+)?\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|rano|po\\s+południu|po\\s+poludniu|popołudniu|wieczorem|de\\s+la\\s+mañana|de\\s+la\\s+manana|de\\s+la\\s+tarde|de\\s+la\\s+noche)` +
        `|(?:at\\s+([01]?\\d|2[0-3])(?::00)?\\s*(?:am|pm)?|a\\s+las?\\s+([01]?\\d|2[0-3])|o\\s+godz(?:inie|\\.)?\\s*([01]?\\d|2[0-3])|o\\s+(1[0-9]|2[0-3])(?::00)?)` +
      `)${WB_E}`,
      'giu'
    ),
  },
  // 6b. Duration commands (English, Polish, Spanish: e.g. 1h30m, 45m, 30min, 1.5h, for 2 hours, ~1h, przez 30 minut)
  {
    type: 'duration',
    regex: new RegExp(
      `${WB_S}(?:` +
        `(?:(?:for|przez|por|durante|czas)\\s+|~\\s*)?\\d+(?:\\.\\d+)?\\s*(?:h|hrs?|hours?|godz(?:in[a-yę]?)?|horas?)\\s*(?:and\\s+|i\\s+|y\\s+)?\\d+\\s*(?:m|mins?|minutes?|minut[a-yę]?|minutos?)` +
        `|` +
        `(?:(?:for|przez|por|durante|czas)\\s+|~\\s*)?\\d+(?:\\.\\d+)?\\s*(?:h|hrs?|hours?|godz(?:in[a-yę]?)?|horas?)` +
        `|` +
        `(?:(?:for|przez|por|durante|czas)\\s+|~\\s*)?\\d+\\s*(?:mins?|minutes?|minut[a-yę]?|minutos?)` +
        `|` +
        `(?:(?:for|przez|por|durante|czas)\\s+|~\\s*)?\\d{1,3}\\s*m` +
      `)${WB_E}`,
      'giu'
    ),
  },
  // 7. Relative & explicit dates (English, Polish, Spanish)
  {
    type: 'date',
    regex: new RegExp(
      `${WB_S}(?:` +
        `\\d{4}[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\\d|3[01])` +
        `|(?:(?:on|w|en)\\s+)?(${MONTHS_P})\\s+(0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?` +
        `|(?:(?:on|w|el)\\s+)?(0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?(?:\\s+(?:of|de)\\s+|\\s+|-)(?:${MONTHS_P})(?:\\s+(\\d{4}))?` +
        `|(?:(?:on|w|el)\\s+)?(0?[1-9]|[12]\\d|3[01])[./](0?[1-9]|1[0-2])(?:[./](\\d{4}))?` +
        `|next\\s+week|w\\s+przyszłym\\s+tygodniu|w\\s+przyszlym\\s+tygodniu|za\\s+tydzień|za\\s+tydzien|la\\s+próxima\\s+semana|la\\s+proxima\\s+semana|en\\s+una\\s+semana` +
        `|(?:in|za|en)\\s+\\d+\\s+(?:weeks?|tygodnie|tygodni|tygodniach|semanas?)` +
        `|next\\s+month|w\\s+przyszłym\\s+miesiącu|w\\s+przyszlym\\s+miesiacu|za\\s+miesiąc|za\\s+miesiac|el\\s+próximo\\s+mes|el\\s+proximo\\s+mes|en\\s+un\\s+mes` +
        `|(?:in|za|en)\\s+\\d+\\s+(?:months?|miesiące|miesięcy|miesiecy|miesiacach|meses?)` +
        `|day\\s+after\\s+tomorrow|pojutrze|pasado\\s+mañana|pasado\\s+manana|pasadomañana` +
        `|tomorrow|jutro|mañana|manana` +
        `|today|dzisiaj|dziś|dzis|hoy` +
        `|yesterday|wczoraj|ayer` +
        `|(?:in|za|en)\\s+\\d+\\s+(?:days?|dni|dzień|dzien|dniach|días|dias|día|dia)` +
        `|(?:(${MODIFIERS_P})\\s+)(${ALL_DAYS_P})(?:\\s+(?:que\\s+viene|następny|nastepny|przyszły|przyszly))?` +
        `|(${FULL_DAYS_P})` +
      `)${WB_E}`,
      'giu'
    ),
  },
];

/**
 * Tokenizes raw task input text into syntax-highlighted tokens.
 * Invariant: tokens.map(t => t.text).join('') === input exactly.
 */
export function tokenizeTaskInput(input: string): SyntaxToken[] {
  if (!input) return [];

  const spans: Span[] = [];

  for (const { type, regex, getPriority } of PATTERNS) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(input)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      spans.push({
        start,
        end,
        type,
        priorityLevel: getPriority ? getPriority(match[0]) : undefined,
      });
    }
  }

  // Sort spans by start asc, then longest match wins
  spans.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

  // Remove overlapping spans (first matched span takes precedence)
  const nonOverlapping: Span[] = [];
  let lastEnd = 0;
  for (const span of spans) {
    if (span.start >= lastEnd) {
      nonOverlapping.push(span);
      lastEnd = span.end;
    }
  }

  // Assemble contiguous tokens
  const tokens: SyntaxToken[] = [];
  let cursor = 0;

  for (const span of nonOverlapping) {
    if (span.start > cursor) {
      tokens.push({
        text: input.substring(cursor, span.start),
        type: 'text',
      });
    }
    tokens.push({
      text: input.substring(span.start, span.end),
      type: span.type,
      priorityLevel: span.priorityLevel,
    });
    cursor = span.end;
  }

  if (cursor < input.length) {
    tokens.push({
      text: input.substring(cursor),
      type: 'text',
    });
  }

  return tokens;
}

/**
 * Returns Tailwind CSS classes for styling a syntax token.
 * Note: Keeps horizontal padding and borders at 0 and font-weight at normal
 * to ensure 100% exact sub-pixel caret and text alignment with the foreground input.
 */
export function getTokenClasses(token: SyntaxToken): string {
  switch (token.type) {
    case 'recurrence':
      return 'text-emerald-700 bg-emerald-500/15 rounded-xs font-normal';
    case 'date':
      return 'text-amber-800 bg-amber-500/15 rounded-xs font-normal';
    case 'time':
      return 'text-sky-800 bg-sky-500/15 rounded-xs font-normal';
    case 'duration':
      return 'text-blue-800 bg-blue-500/15 rounded-xs font-normal';
    case 'project':
      return 'text-indigo-700 bg-indigo-500/15 rounded-xs font-normal';
    case 'label':
      return 'text-teal-700 bg-teal-500/15 rounded-xs font-normal';
    case 'priority':
      if (token.priorityLevel === 'p1') return 'text-crimson bg-red-500/15 rounded-xs font-normal';
      if (token.priorityLevel === 'p2') return 'text-orange-700 bg-orange-500/15 rounded-xs font-normal';
      if (token.priorityLevel === 'p3') return 'text-stone-700 bg-stone-500/15 rounded-xs font-normal';
      return 'text-stone-500 bg-stone-500/10 rounded-xs font-normal';
    case 'multiplier':
      return 'text-purple-700 bg-purple-500/15 rounded-xs font-normal';
    case 'text':
    default:
      return 'text-stone-900 font-normal';
  }
}

export type NumberingStyle = 'suffix' | 'hash' | 'fraction' | 'bracket';

/**
 * Formats a numbered task title according to the selected numbering pattern.
 * E.g., "Read Chapter" -> "Read Chapter 1", "Read Chapter #1", "Read Chapter (1/3)", etc.
 */
export function formatNumberedTaskTitle(
  baseTitle: string,
  index: number,
  total: number,
  style: NumberingStyle = 'suffix'
): string {
  const trimmed = baseTitle.trim();
  switch (style) {
    case 'hash':
      return `${trimmed} #${index}`;
    case 'fraction':
      return `${trimmed} (${index}/${total})`;
    case 'bracket':
      return `${trimmed} [${index}]`;
    case 'suffix':
    default:
      return `${trimmed} ${index}`;
  }
}
