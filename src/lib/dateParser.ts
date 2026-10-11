import { Priority, Recurrence } from '../types';

export interface ParsedTaskInput {
  title: string;
  dueDate?: string; // YYYY-MM-DD
  dueTime?: string; // HH:mm
  recurrence?: Recurrence;
  priority?: Priority;
  projectQuery?: string;
  labels: string[];
  batchCount?: number;
}

export function formatLocalDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Unicode word-boundary helpers for multilingual parsing (supports accents/diacritics in PL & ES)
const WB_S = '(?<![\\p{L}\\p{N}])';
const WB_E = '(?![\\p{L}\\p{N}])';

// Full day names (can match as standalone words or with prepositions)
export const FULL_DAYS_MAP: Record<string, number> = {
  // English
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,

  // Polish
  niedziela: 0,
  niedzielę: 0,
  niedziele: 0,
  poniedziałek: 1,
  poniedzialek: 1,
  wtorek: 2,
  środa: 3,
  sroda: 3,
  środę: 3,
  srode: 3,
  czwartek: 4,
  piątek: 5,
  piatek: 5,
  sobota: 6,
  sobotę: 6,
  sobote: 6,

  // Spanish
  domingo: 0,
  domingos: 0,
  lunes: 1,
  martes: 2,
  miércoles: 3,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sábado: 6,
  sabado: 6,
  sábados: 6,
  sabados: 6,
};

// Short day abbreviations (REQUIRE a preposition/modifier to prevent false matches with common words like 'sat', 'sun', 'nie', 'mar')
export const SHORT_DAYS_MAP: Record<string, number> = {
  // English
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,

  // Polish (Note: 'nie' is excluded because it means 'no/not'; 'nd' is the standard abbreviation)
  nd: 0,
  pon: 1,
  wt: 2,
  wto: 2,
  śr: 3,
  sr: 3,
  czw: 4,
  pt: 5,
  sob: 6,

  // Spanish (Note: bare 'mar' is excluded because it means 'sea'; 'mart' or with preposition is used)
  dom: 0,
  lun: 1,
  mart: 2,
  mar: 2,
  mié: 3,
  mie: 3,
  jue: 4,
  vie: 5,
  sáb: 6,
  sab: 6,
};

export const ALL_DAYS_MAP: Record<string, number> = { ...FULL_DAYS_MAP, ...SHORT_DAYS_MAP };

export const MONTHS_MAP: Record<string, number> = {
  // English
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,

  // Polish
  styczeń: 0, styczen: 0, stycznia: 0, sty: 0,
  luty: 1, lutego: 1, lut: 1,
  marzec: 2, marca: 2,
  kwiecień: 3, kwiecien: 3, kwietnia: 3, kwi: 3,
  maj: 4, maja: 4,
  czerwiec: 5, czerwca: 5, cze: 5,
  lipiec: 6, lipca: 6, lip: 6,
  sierpień: 7, sierpien: 7, sierpnia: 7, sie: 7,
  wrzesień: 8, wrzesien: 8, września: 8, wrzesnia: 8, wrz: 8,
  październik: 9, pazdziernik: 9, października: 9, pazdziernika: 9, paź: 9, paz: 9,
  listopad: 10, listopada: 10, lis: 10,
  grudzień: 11, grudzien: 11, grudnia: 11, gru: 11,

  // Spanish
  enero: 0, ene: 0,
  febrero: 1,
  marzo: 2,
  abril: 3, abr: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7, ago: 7,
  septiembre: 8, setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11, dic: 11,
};

function addMonthsToDate(d: Date, months: number): Date {
  let targetYear = d.getFullYear();
  let targetMonth = d.getMonth() + 1 + months;
  while (targetMonth > 12) {
    targetMonth -= 12;
    targetYear += 1;
  }
  while (targetMonth < 1) {
    targetMonth += 12;
    targetYear -= 1;
  }
  const daysInTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
  const targetDay = Math.min(d.getDate(), daysInTargetMonth);
  return new Date(targetYear, targetMonth - 1, targetDay);
}

export function parseNaturalLanguageTask(input: string): ParsedTaskInput {
  let text = input.trim();
  let priority: Priority | undefined = undefined;
  let recurrence: Recurrence | undefined = undefined;
  let dueDate: string | undefined = undefined;
  let dueTime: string | undefined = undefined;
  let projectQuery: string | undefined = undefined;
  let batchCount: number | undefined = undefined;
  const labels: string[] = [];

  // 0. Extract Multiplier (e.g. x3, 3x, x5)
  const batchMatch = text.match(/\b(?:x(\d+)|(\d+)x)\b/i);
  if (batchMatch) {
    const parsedNum = parseInt(batchMatch[1] || batchMatch[2], 10);
    if (parsedNum >= 2 && parsedNum <= 50) {
      batchCount = parsedNum;
      text = text.replace(batchMatch[0], '');
    }
  }

  // 1. Extract Priority (p1, p2, p3, p4 or !1, !2, !3, !4)
  const priorityMatch = text.match(/\b(p[1-4]|![1-4])\b/i);
  if (priorityMatch) {
    const digit = priorityMatch[1].replace(/[p!]/i, '');
    priority = `p${digit}` as Priority;
    text = text.replace(priorityMatch[0], '');
  }

  // 2. Extract Project (@ProjectName)
  const projectMatch = text.match(/@([a-zA-Z0-9_\-]+)/i);
  if (projectMatch) {
    projectQuery = projectMatch[1];
    text = text.replace(projectMatch[0], '');
  }

  // 3. Extract Labels (#label)
  const labelMatches = text.matchAll(/#([a-zA-Z0-9_\-]+)/g);
  for (const match of labelMatches) {
    labels.push(match[1]);
    text = text.replace(match[0], '');
  }

  const FULL_DAYS_P = Object.keys(FULL_DAYS_MAP).join('|');
  const SHORT_DAYS_P = Object.keys(SHORT_DAYS_MAP).join('|');
  const ALL_DAYS_P = `${FULL_DAYS_P}|${SHORT_DAYS_P}`;
  const MODIFIERS_P =
    '(?:on|next|this|w|we|w\\s+ten|w\\s+tę|w\\s+te|ten|tę|te|następny|nastepny|w\\s+następny|w\\s+nastepny|przyszły|przyszly|w\\s+przyszły|w\\s+przyszly|el|este|esta|próximo|proximo|el\\s+próximo|el\\s+proximo)';

  // 4. Extract Recurrence (English, Polish, Spanish)
  const everyDayOfWeekRegex = new RegExp(
    `${WB_S}(?:every|co|w\\s+każdy|w\\s+kazdy|w\\s+każdą|w\\s+kazda|każdy|kazdy|każdą|kazda|todos\\s+los|cada)\\s+(${ALL_DAYS_P})${WB_E}`,
    'iu'
  );
  const dailyRegex = new RegExp(
    `${WB_S}(?:daily|everyday|every\\s+day|each\\s+day|every\\s+single\\s+day|day\\s+to\\s+day|codziennie|co\\s+dzień|co\\s+dzien|diariamente|a\\s+diario|todos\\s+los\\s+días|todos\\s+los\\s+dias|cada\\s+día|cada\\s+dia)${WB_E}`,
    'iu'
  );
  const weekdaysRegex = new RegExp(
    `${WB_S}(?:weekdays?|every\\s+weekday|each\\s+weekday|w\\s+dni\\s+robocze|dni\\s+robocze|w\\s+dni\\s+powszednie|dni\\s+powszednie|días\\s+laborales|dias\\s+laborales|días\\s+laborables|dias\\s+laborables|entre\\s+semana)${WB_E}`,
    'iu'
  );
  const weeklyRegex = new RegExp(
    `${WB_S}(?:weekly|every\\s+week|each\\s+week|co\\s+tydzień|co\\s+tydzien|tygodniowo|semanalmente|todas\\s+las\\s+semanas|cada\\s+semana)${WB_E}`,
    'iu'
  );
  const monthlyRegex = new RegExp(
    `${WB_S}(?:monthly|every\\s+month|each\\s+month|co\\s+miesiąc|co\\s+miesiac|miesięcznie|miesiecznie|mensualmente|todos\\s+los\\s+meses|cada\\s+mes)${WB_E}`,
    'iu'
  );

  let recurringDayOfWeek: string | undefined = undefined;

  const everyDayOfWeekMatch = text.match(everyDayOfWeekRegex);
  if (everyDayOfWeekMatch) {
    recurrence = 'weekly';
    recurringDayOfWeek = everyDayOfWeekMatch[1];
    text = text.replace(everyDayOfWeekMatch[0], '');
  } else if (dailyRegex.test(text)) {
    recurrence = 'daily';
    text = text.replace(dailyRegex, '');
  } else if (weekdaysRegex.test(text)) {
    recurrence = 'weekdays';
    text = text.replace(weekdaysRegex, '');
  } else if (weeklyRegex.test(text)) {
    recurrence = 'weekly';
    text = text.replace(weeklyRegex, '');
  } else if (monthlyRegex.test(text)) {
    recurrence = 'monthly';
    text = text.replace(monthlyRegex, '');
  }

  // 5. Extract Time (English, Polish, Spanish)
  const namedTimeMatch = text.match(
    new RegExp(
      `${WB_S}(?:(?:at|w|o|al|a)\\s+)?(noon|midnight|południe|poludnie|północy|polnocy|mediodía|mediodia|medianoche)${WB_E}`,
      'iu'
    )
  );
  const colonTimeMatch = text.match(
    new RegExp(
      `${WB_S}(?:(?:at|o|a\\s+las?)\\s+)?([01]?\\d|2[0-3]):([0-5]\\d)${WB_E}`,
      'iu'
    )
  );
  const periodTimeMatch = text.match(
    new RegExp(
      `${WB_S}(?:(?:at|o|a\\s+las?)\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|rano|po\\s+południu|po\\s+poludniu|popołudniu|wieczorem|de\\s+la\\s+mañana|de\\s+la\\s+manana|de\\s+la\\s+tarde|de\\s+la\\s+noche)${WB_E}`,
      'iu'
    )
  );
  const prepHourMatch = text.match(
    new RegExp(
      `${WB_S}(?:at\\s+([01]?\\d|2[0-3])(?::00)?\\s*(?:am|pm)?|a\\s+las?\\s+([01]?\\d|2[0-3])|o\\s+godz(?:inie|\\.)?\\s*([01]?\\d|2[0-3])|o\\s+(1[0-9]|2[0-3])(?::00)?)${WB_E}`,
      'iu'
    )
  );

  if (namedTimeMatch) {
    const word = namedTimeMatch[1].toLowerCase();
    if (word === 'noon' || word === 'południe' || word === 'poludnie' || word === 'mediodía' || word === 'mediodia') {
      dueTime = '12:00';
    } else {
      dueTime = '00:00';
    }
    text = text.replace(namedTimeMatch[0], '');
  } else if (colonTimeMatch) {
    const hours = parseInt(colonTimeMatch[1], 10).toString().padStart(2, '0');
    const minutes = colonTimeMatch[2];
    dueTime = `${hours}:${minutes}`;
    text = text.replace(colonTimeMatch[0], '');
  } else if (periodTimeMatch) {
    let hours = parseInt(periodTimeMatch[1], 10);
    const minutes = periodTimeMatch[2] || '00';
    const period = periodTimeMatch[3].toLowerCase();
    const isPm =
      period === 'pm' ||
      period.includes('południu') ||
      period.includes('poludniu') ||
      period === 'popołudniu' ||
      period === 'wieczorem' ||
      period.includes('tarde') ||
      period.includes('noche');
    if (isPm && hours < 12) hours += 12;
    if (!isPm && hours === 12) hours = 0;
    dueTime = `${hours.toString().padStart(2, '0')}:${minutes}`;
    text = text.replace(periodTimeMatch[0], '');
  } else if (prepHourMatch) {
    const matchedHour = prepHourMatch[1] || prepHourMatch[2] || prepHourMatch[3] || prepHourMatch[4];
    const hours = parseInt(matchedHour, 10);
    dueTime = `${hours.toString().padStart(2, '0')}:00`;
    text = text.replace(prepHourMatch[0], '');
  }

  // 6. Extract Relative & Explicit Dates (English, Polish, Spanish)
  const now = new Date();
  const formatDate = (d: Date) => formatLocalDate(d);
  const todayStr = formatLocalDate(now);

  if (recurringDayOfWeek) {
    const targetDay = ALL_DAYS_MAP[recurringDayOfWeek.toLowerCase()];
    if (targetDay !== undefined) {
      const currentDay = now.getDay();
      let diff = targetDay - currentDay;
      if (diff <= 0) diff += 7;
      const d = new Date(now);
      d.setDate(d.getDate() + diff);
      dueDate = formatDate(d);
    }
  } else {
    // 6a: Explicit ISO Date (e.g. 2026-10-15 or 2026/10/15)
    const isoMatch = text.match(new RegExp(`${WB_S}(\\d{4})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\\d|3[01])${WB_E}`, 'iu'));

    // 6b: Explicit Named Month / Day formats
    const MONTHS_P = Object.keys(MONTHS_MAP).join('|');
    const monthDayMatch = text.match(
      new RegExp(`${WB_S}(?:(?:on|w|en)\\s+)?(${MONTHS_P})\\s+(0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?${WB_E}`, 'iu')
    );
    const dayMonthMatch = text.match(
      new RegExp(`${WB_S}(?:(?:on|w|el)\\s+)?(0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?(?:\\s+(?:of|de)\\s+|\\s+|-)(?:(${MONTHS_P}))(?:\\s+(\\d{4}))?${WB_E}`, 'iu')
    );
    const numericDayMonthMatch = text.match(
      new RegExp(`${WB_S}(?:(?:on|w|el)\\s+)?(0?[1-9]|[12]\\d|3[01])[./](0?[1-9]|1[0-2])(?:[./](\\d{4}))?${WB_E}`, 'iu')
    );

    // 6c: Relative weeks & relative months
    const relWeekMatch = text.match(
      new RegExp(`${WB_S}(?:next\\s+week|w\\s+przyszłym\\s+tygodniu|w\\s+przyszlym\\s+tygodniu|za\\s+tydzień|za\\s+tydzien|la\\s+próxima\\s+semana|la\\s+proxima\\s+semana|en\\s+una\\s+semana)${WB_E}`, 'iu')
    );
    const inWeeksMatch = text.match(
      new RegExp(`${WB_S}(?:in|za|en)\\s+(\\d+)\\s+(?:weeks?|tygodnie|tygodni|tygodniach|semanas?)${WB_E}`, 'iu')
    );
    const relMonthMatch = text.match(
      new RegExp(`${WB_S}(?:next\\s+month|w\\s+przyszłym\\s+miesiącu|w\\s+przyszlym\\s+miesiacu|za\\s+miesiąc|za\\s+miesiac|el\\s+próximo\\s+mes|el\\s+proximo\\s+mes|en\\s+un\\s+mes)${WB_E}`, 'iu')
    );
    const inMonthsMatch = text.match(
      new RegExp(`${WB_S}(?:in|za|en)\\s+(\\d+)\\s+(?:months?|miesiące|miesięcy|miesiecy|miesiacach|meses?)${WB_E}`, 'iu')
    );

    // 6d: Relative days
    const dayAfterMatch = text.match(
      new RegExp(`${WB_S}(?:day\\s+after\\s+tomorrow|pojutrze|pasado\\s+mañana|pasado\\s+manana|pasadomañana)${WB_E}`, 'iu')
    );
    const tomMatch = text.match(
      new RegExp(`${WB_S}(?:tomorrow|jutro|mañana|manana)${WB_E}`, 'iu')
    );
    const todayMatch = text.match(
      new RegExp(`${WB_S}(?:today|dzisiaj|dziś|dzis|hoy)${WB_E}`, 'iu')
    );
    const yestMatch = text.match(
      new RegExp(`${WB_S}(?:yesterday|wczoraj|ayer)${WB_E}`, 'iu')
    );
    const inDaysMatch = text.match(
      new RegExp(`${WB_S}(?:in|za|en)\\s+(\\d+)\\s+(?:days?|dni|dzień|dzien|dniach|días|dias|día|dia)${WB_E}`, 'iu')
    );

    // 6e: Days of week (Modified with preposition/adjective OR bare full day name only)
    const dayOfWeekMatch = text.match(
      new RegExp(
        `${WB_S}(?:(?:(${MODIFIERS_P})\\s+)(${ALL_DAYS_P})|(${FULL_DAYS_P}))(?:\\s+(?:que\\s+viene|następny|nastepny|przyszły|przyszly))?${WB_E}`,
        'iu'
      )
    );

    if (isoMatch) {
      const year = isoMatch[1];
      const month = isoMatch[2].padStart(2, '0');
      const day = isoMatch[3].padStart(2, '0');
      dueDate = `${year}-${month}-${day}`;
      text = text.replace(isoMatch[0], '');
    } else if (monthDayMatch) {
      const monthName = monthDayMatch[1].toLowerCase();
      const day = parseInt(monthDayMatch[2], 10);
      const targetMonth = MONTHS_MAP[monthName];
      if (targetMonth !== undefined) {
        let year = monthDayMatch[3] ? parseInt(monthDayMatch[3], 10) : now.getFullYear();
        if (!monthDayMatch[3]) {
          const candidate = new Date(year, targetMonth, day);
          candidate.setHours(0, 0, 0, 0);
          const nowZero = new Date(now);
          nowZero.setHours(0, 0, 0, 0);
          if (candidate.getTime() < nowZero.getTime()) year += 1;
        }
        dueDate = `${year}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        text = text.replace(monthDayMatch[0], '');
      }
    } else if (dayMonthMatch) {
      const day = parseInt(dayMonthMatch[1], 10);
      const monthName = dayMonthMatch[2].toLowerCase();
      const targetMonth = MONTHS_MAP[monthName];
      if (targetMonth !== undefined) {
        let year = dayMonthMatch[3] ? parseInt(dayMonthMatch[3], 10) : now.getFullYear();
        if (!dayMonthMatch[3]) {
          const candidate = new Date(year, targetMonth, day);
          candidate.setHours(0, 0, 0, 0);
          const nowZero = new Date(now);
          nowZero.setHours(0, 0, 0, 0);
          if (candidate.getTime() < nowZero.getTime()) year += 1;
        }
        dueDate = `${year}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        text = text.replace(dayMonthMatch[0], '');
      }
    } else if (numericDayMonthMatch) {
      const day = parseInt(numericDayMonthMatch[1], 10);
      const month = parseInt(numericDayMonthMatch[2], 10) - 1;
      let year = numericDayMonthMatch[3] ? parseInt(numericDayMonthMatch[3], 10) : now.getFullYear();
      if (!numericDayMonthMatch[3]) {
        const candidate = new Date(year, month, day);
        candidate.setHours(0, 0, 0, 0);
        const nowZero = new Date(now);
        nowZero.setHours(0, 0, 0, 0);
        if (candidate.getTime() < nowZero.getTime()) year += 1;
      }
      dueDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      text = text.replace(numericDayMonthMatch[0], '');
    } else if (relWeekMatch) {
      const d = new Date(now);
      d.setDate(d.getDate() + 7);
      dueDate = formatDate(d);
      text = text.replace(relWeekMatch[0], '');
    } else if (inWeeksMatch) {
      const weeks = parseInt(inWeeksMatch[1], 10);
      const d = new Date(now);
      d.setDate(d.getDate() + weeks * 7);
      dueDate = formatDate(d);
      text = text.replace(inWeeksMatch[0], '');
    } else if (relMonthMatch) {
      dueDate = formatDate(addMonthsToDate(now, 1));
      text = text.replace(relMonthMatch[0], '');
    } else if (inMonthsMatch) {
      const months = parseInt(inMonthsMatch[1], 10);
      dueDate = formatDate(addMonthsToDate(now, months));
      text = text.replace(inMonthsMatch[0], '');
    } else if (dayAfterMatch) {
      const d = new Date(now);
      d.setDate(d.getDate() + 2);
      dueDate = formatDate(d);
      text = text.replace(dayAfterMatch[0], '');
    } else if (tomMatch) {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      dueDate = formatDate(d);
      text = text.replace(tomMatch[0], '');
    } else if (todayMatch) {
      dueDate = todayStr;
      text = text.replace(todayMatch[0], '');
    } else if (yestMatch) {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      dueDate = formatDate(d);
      text = text.replace(yestMatch[0], '');
    } else if (inDaysMatch) {
      const days = parseInt(inDaysMatch[1], 10);
      const d = new Date(now);
      d.setDate(d.getDate() + days);
      dueDate = formatDate(d);
      text = text.replace(inDaysMatch[0], '');
    } else if (dayOfWeekMatch) {
      const dayName = (dayOfWeekMatch[2] || dayOfWeekMatch[3])?.toLowerCase();
      const fullMatch = dayOfWeekMatch[0].toLowerCase();
      const isNext = /next|następny|nastepny|przyszły|przyszly|próximo|proximo|que viene/i.test(fullMatch);
      const targetDay = ALL_DAYS_MAP[dayName];
      if (targetDay !== undefined) {
        const currentDay = now.getDay();
        let diff = targetDay - currentDay;
        if (diff <= 0 || isNext) {
          diff += 7;
        }
        const d = new Date(now);
        d.setDate(d.getDate() + diff);
        dueDate = formatDate(d);
        text = text.replace(dayOfWeekMatch[0], '');
      }
    }
  }

  // If recurrence was set without an explicit date, initialize schedule starting today/next applicable day
  if (!dueDate && recurrence) {
    if (recurrence === 'daily') {
      dueDate = todayStr;
    } else if (recurrence === 'weekdays') {
      const currentDay = now.getDay();
      if (currentDay === 0) {
        // Sunday -> tomorrow Monday
        const d = new Date(now);
        d.setDate(d.getDate() + 1);
        dueDate = formatDate(d);
      } else if (currentDay === 6) {
        // Saturday -> Monday (+2 days)
        const d = new Date(now);
        d.setDate(d.getDate() + 2);
        dueDate = formatDate(d);
      } else {
        dueDate = todayStr;
      }
    } else if (recurrence === 'weekly' || recurrence === 'monthly') {
      dueDate = todayStr;
    }
  }

  // Clean extra whitespace and trailing prepositions attached to stripped date/time
  const cleanTitle = text
    .replace(/\s+/g, ' ')
    .replace(new RegExp(`${WB_S}(?:on|at|by|for|starting|start|w|we|o|na|za|od|do|el|la|los|las|en|de|para|por)$`, 'iu'), '')
    .replace(/^(?:starting|start)\s+/iu, '')
    .trim();

  return {
    title: cleanTitle || input.trim(),
    dueDate,
    dueTime,
    recurrence,
    priority,
    projectQuery,
    labels,
    batchCount,
  };
}

export function formatDueDateDisplay(dateStr?: string, timeStr?: string): string {
  if (!dateStr) return '';
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const [y, m, d] = dateStr.split('-').map(Number);
  const targetDate = new Date(y, m - 1, d);
  targetDate.setHours(0, 0, 0, 0);

  const diffTime = targetDate.getTime() - now.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  let label = '';
  if (diffDays === 0) {
    label = 'Today';
  } else if (diffDays === 1) {
    label = 'Tomorrow';
  } else if (diffDays === -1) {
    label = 'Yesterday (Overdue)';
  } else if (diffDays < -1) {
    label = `${Math.abs(diffDays)}d overdue`;
  } else if (diffDays < 7) {
    label = targetDate.toLocaleDateString('en-US', { weekday: 'short' });
  } else {
    label = targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  if (timeStr) {
    return `${label}, ${timeStr}`;
  }
  return label;
}
