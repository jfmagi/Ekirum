import 'fake-indexeddb/auto';
import assert from 'node:assert';
import { useEkirumStore } from '../src/store/useEkirumStore';
import { evaluateAchievements, getVisibleAchievements, isAchievementVisible } from '../src/lib/achievements';
import { INITIAL_ACHIEVEMENTS } from '../src/lib/seedData';
import { getLibraryXp } from '../src/lib/library';
import { importAndMerge, exportAll, mergeLibraryItems } from '../src/lib/syncEngine';
import { db, initializeDatabase } from '../src/lib/db';
import { LibraryItem } from '../src/types';

async function main() {
  console.log('🧪 Starting Library (reading list / watchlist) verification tests...\n');

  // 1. XP table
  assert.strictEqual(getLibraryXp('book', 0), 50);
  assert.strictEqual(getLibraryXp('book', 1), 100);
  assert.strictEqual(getLibraryXp('book', 2), 200);
  assert.strictEqual(getLibraryXp('movie', 0), 10);
  assert.strictEqual(getLibraryXp('movie', 1), 30);
  assert.strictEqual(getLibraryXp('movie', 2), 50);
  console.log('Test 1: Library XP table (books 50/100/200, movies 10/30/50): PASSED');

  // 2. Achievements exist with the agreed tiers and rewards
  const bookXp = [25, 50, 100, 150, 250, 500];
  const movieXp = [10, 25, 50, 75, 125, 250];
  [1, 5, 10, 25, 50, 100].forEach((n, i) => {
    const b = INITIAL_ACHIEVEMENTS.find((a) => a.id === `ach-book-${n}`);
    const m = INITIAL_ACHIEVEMENTS.find((a) => a.id === `ach-movie-${n}`);
    assert.ok(b && m, `tier ${n} must exist`);
    assert.strictEqual(b!.maxProgress, n);
    assert.strictEqual(b!.xpReward, bookXp[i]);
    assert.strictEqual(m!.xpReward, movieXp[i]);
  });
  console.log('Test 2: Library achievement tiers and XP rewards: PASSED');

  // 3. Rolling visibility: only the next tier per ladder is shown in progress
  const visible0 = getVisibleAchievements(INITIAL_ACHIEVEMENTS);
  assert.deepStrictEqual(
    visible0.filter((a) => a.id.startsWith('ach-book-')).map((a) => a.id),
    ['ach-book-1']
  );
  assert.deepStrictEqual(
    visible0.filter((a) => a.id.startsWith('ach-movie-')).map((a) => a.id),
    ['ach-movie-1']
  );
  assert.deepStrictEqual(
    visible0.map((a) => a.id).sort(),
    INITIAL_ACHIEVEMENTS.filter((a) => isAchievementVisible(a, INITIAL_ACHIEVEMENTS)).map((a) => a.id).sort()
  );
  console.log('Test 3: Library rolling visibility: PASSED');

  // 4. Evaluation counts books and movies separately
  const now = new Date().toISOString();
  const mk = (i: number, type: 'book' | 'movie', status: 'todo' | 'done' = 'done'): LibraryItem => ({
    id: `lib-t-${type}-${i}`,
    title: `${type} ${i}`,
    type,
    difficulty: 1,
    status,
    createdAt: now,
    updatedAt: now,
  });
  const items = [
    ...Array.from({ length: 5 }, (_, i) => mk(i, 'book')),
    mk(99, 'book', 'todo'),
    mk(0, 'movie'),
    { ...mk(1, 'movie'), isDeleted: true },
  ];
  const res = evaluateAchievements([], [], [], INITIAL_ACHIEVEMENTS, undefined, [], items);
  const get = (id: string) => res.updatedAchievements.find((a) => a.id === id)!;
  assert.ok(get('ach-book-1').unlockedAt);
  assert.ok(get('ach-book-5').unlockedAt);
  assert.strictEqual(get('ach-book-10').unlockedAt, undefined);
  assert.strictEqual(get('ach-book-10').progress, 5);
  assert.ok(get('ach-movie-1').unlockedAt);
  assert.strictEqual(get('ach-movie-5').unlockedAt, undefined);
  assert.strictEqual(get('ach-movie-5').progress, 1, 'deleted and todo items must not count');
  console.log('Test 4: Book and movie completion counts drive achievements: PASSED');

  // 5. Store: finishing awards XP once, to character and linked skill
  await initializeDatabase();
  await useEkirumStore.getState().clearAllData();
  const store = () => useEkirumStore.getState();
  const project = store().createProject('Reading', '#8B1528');
  store().dismissCelebration();
  const xpBefore = store().user.totalXp;
  const skillBefore = store().skills.find((s) => s.id === project.skillId)!;

  const book = store().addLibraryItem({
    title: 'Hard Book',
    type: 'book',
    difficulty: 2,
    projectId: project.id,
    creator: 'Someone',
  });
  assert.strictEqual(store().libraryItems.length, 1);
  assert.strictEqual(store().libraryItems[0].status, 'todo');

  await store().completeLibraryItem(book.id, { review: 'Dense but rewarding', finishedDate: '2026-10-01' });
  const done = store().libraryItems.find((i) => i.id === book.id)!;
  assert.strictEqual(done.status, 'done');
  assert.strictEqual(done.review, 'Dense but rewarding');
  assert.strictEqual(done.finishedDate, '2026-10-01');
  assert.strictEqual(done.xpEarned, 200);
  const skillAfter = store().skills.find((s) => s.id === project.skillId)!;
  assert.strictEqual(skillAfter.xp - skillBefore.xp, 200, 'linked skill receives the XP');
  const xpAfterFirst = store().user.totalXp;
  assert.ok(xpAfterFirst - xpBefore >= 200, 'character receives at least the item XP (+ achievement bonus)');
  assert.ok(store().achievements.find((a) => a.id === 'ach-book-1')?.unlockedAt, 'first book achievement unlocked');
  assert.ok(store().celebration, 'celebration shown');
  console.log('Test 5: Finishing a book awards XP to character and linked skill: PASSED');

  // 6. Reopen keeps XP, re-finishing never pays twice
  store().reopenLibraryItem(book.id);
  assert.strictEqual(store().libraryItems.find((i) => i.id === book.id)!.status, 'todo');
  assert.strictEqual(store().user.totalXp, xpAfterFirst, 'no clawback on reopen');
  await store().completeLibraryItem(book.id, {});
  assert.strictEqual(store().user.totalXp, xpAfterFirst, 'no second payout');
  assert.strictEqual(store().skills.find((i) => i.id === project.skillId)!.xp, skillAfter.xp);
  console.log('Test 6: Reopen keeps XP and re-finishing never awards twice: PASSED');

  // 7. Persistence, export, import and merge
  const dbItems = await db.libraryItems.toArray();
  assert.strictEqual(dbItems.length, 1);
  assert.strictEqual(dbItems[0].xpAwarded, true);
  const backup = await exportAll();
  assert.ok(Array.isArray(backup.tables.libraryItems) && backup.tables.libraryItems!.length === 1);

  // Older incoming copy without xpAwarded must not erase the payout flag
  const merged = mergeLibraryItems(
    { ...dbItems[0], updatedAt: '2026-10-02T00:00:00.000Z' },
    { ...dbItems[0], xpAwarded: false, xpEarned: undefined, status: 'todo', updatedAt: '2026-10-03T00:00:00.000Z' },
    true
  );
  assert.strictEqual(merged.xpAwarded, true);
  assert.strictEqual(merged.xpEarned, 200);

  const importRes = await importAndMerge({
    tables: {
      libraryItems: [
        { id: 'lib-remote-1', title: 'Remote Film', type: 'movie', difficulty: 2, status: 'todo', updatedAt: now },
        { id: '', title: 'bad' },
        null,
      ],
    },
  });
  assert.ok(importRes.success);
  assert.strictEqual(importRes.stats.libraryItems.inserted, 1);
  const remote = await db.libraryItems.get('lib-remote-1');
  assert.strictEqual(remote?.type, 'movie');
  assert.strictEqual(remote?.difficulty, 2);
  console.log('Test 7: Library persistence, export, import and merge: PASSED');

  // 8. Delete is a soft delete
  store().deleteLibraryItem(book.id);
  assert.ok(!store().libraryItems.some((i) => i.id === book.id));
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual((await db.libraryItems.get(book.id))?.isDeleted, true);
  console.log('Test 8: Library soft delete: PASSED');

  console.log('\n🎉 ALL LIBRARY TESTS PASSED!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
