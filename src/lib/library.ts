import { LibraryDifficulty, LibraryItemType } from '../types';

/** XP granted once when a Library item is finished, indexed by difficulty (0, 1, 2). */
export const LIBRARY_XP: Record<LibraryItemType, [number, number, number]> = {
  book: [50, 100, 200],
  movie: [10, 30, 50],
};

export const LIBRARY_DIFFICULTY_LABELS: Record<LibraryDifficulty, string> = {
  0: 'Mindless',
  1: 'Standard',
  2: 'Challenging',
};

export const LIBRARY_TYPE_LABELS: Record<LibraryItemType, string> = {
  book: 'Book',
  movie: 'Movie',
};

export function getLibraryXp(type: LibraryItemType, difficulty: LibraryDifficulty): number {
  return LIBRARY_XP[type]?.[difficulty] ?? 0;
}
