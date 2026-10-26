export const EKIRUM_RANKS = [
  'Novice',
  'Recruit',
  'Apprentice',
  'Pathfinder',
  'Wayfarer',
  'Captain',
  'Commander',
  'High Commander',
  'Master',
  'Grandmaster',
] as const;

export type EkirumRank = (typeof EKIRUM_RANKS)[number];

export function getEkirumRankTitle(level: number): EkirumRank {
  if (level <= 2) return 'Novice';
  if (level <= 4) return 'Recruit';
  if (level <= 7) return 'Apprentice';
  if (level <= 11) return 'Pathfinder';
  if (level <= 16) return 'Wayfarer';
  if (level <= 22) return 'Captain';
  if (level <= 29) return 'Commander';
  if (level <= 37) return 'High Commander';
  if (level <= 49) return 'Master';
  return 'Grandmaster';
}

export const getSkillRankTitle = getEkirumRankTitle;

export function calculateSkillLevel(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(xp / 20)) + 1);
}

export function computeUserLevelAndRank(totalXp: number): { level: number; rank: EkirumRank } {
  const level = Math.max(1, Math.floor(Math.sqrt(totalXp / 30)) + 1);
  const rank = getEkirumRankTitle(level);
  return { level, rank };
}

export function getXpRequiredForLevel(level: number): number {
  return (level - 1) * (level - 1) * 20;
}

export function getXpRequiredForNextLevel(level: number): number {
  return level * level * 20;
}


