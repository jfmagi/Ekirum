import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {
  GRATITUDE_DAILY_BONUS_XP,
  GRATITUDE_DAILY_TARGET,
  GRATITUDE_XP,
  configureVaultPassphrase,
  decryptGratitudeEntry,
  encryptGratitudePayload,
  initializeDefusionVault,
  unlockDefusionVault,
} from '../src/lib/defusionCrypto';
import { formatLocalDate } from '../src/lib/dateParser';
import { db } from '../src/lib/db';
import { sanitizeGratitudeEntry } from '../src/lib/schemaSanitizers';
import { exportAll, importAndMerge } from '../src/lib/syncEngine';
import { calculateHabitStreak, useEkirumStore } from '../src/store/useEkirumStore';

async function runTests() {
  console.log('Running Gratitude journal encryption, one-item flow, 3/day bonus & streak, and sync tests...');

  // 1. Test zero-friction sealing before passphrase is set & >3 items supported cleanly
  const vault = await initializeDefusionVault();
  const payload = {
    items: ['Quiet morning tea', 'Warm sunlight on the desk', 'Finished an architecture doc', 'Evening walk'],
    note: 'Felt calm despite a busy sprint.',
  };

  const sealed = await encryptGratitudePayload(vault.publicKeyJwk, payload);
  assert.ok(sealed.ciphertext && sealed.iv && sealed.wrappedKey, 'Encrypted fields must be populated');
  assert.ok(!sealed.ciphertext.includes('Quiet morning tea'), 'Ciphertext must never expose plaintext items');
  assert.ok(!sealed.ciphertext.includes('Felt calm'), 'Ciphertext must never expose plaintext notes');

  const { updatedVault } = await configureVaultPassphrase(vault, 'gratitude-pass-2026');
  const unlockedKey = await unlockDefusionVault(updatedVault, 'gratitude-pass-2026');

  const decrypted = await decryptGratitudeEntry(unlockedKey, { ...sealed });
  assert.deepEqual(decrypted, payload, 'Decrypted gratitude payload should preserve all items and note');

  // Verify schemaSanitizers preserves single-item & daily-bonus metadata
  const sanitized = sanitizeGratitudeEntry({
    id: 'grat-2026-04-10-abc',
    date: '2026-04-10',
    projectId: 'proj-1',
    itemCount: 1,
    dailyBonusAwarded: true,
    dailyBonusXp: 5,
    xpAwarded: true,
    xpEarned: 10,
    ciphertext: sealed.ciphertext,
    iv: sealed.iv,
    wrappedKey: sealed.wrappedKey,
    createdAt: '2026-04-10T09:00:00.000Z',
    updatedAt: '2026-04-10T09:00:00.000Z',
    isDeleted: false,
  });
  assert.ok(sanitized);
  assert.equal(sanitized.itemCount, 1);
  assert.equal(sanitized.dailyBonusAwarded, true);
  assert.equal(sanitized.dailyBonusXp, 5);
  assert.equal(sanitized.xpEarned, 10);

  // 2. Test Store saveGratitudeEntry: one item at a time, 10 XP each, +5 bonus & streak at 3/day, unlimited items
  await useEkirumStore.getState().clearAllData();
  const project = useEkirumStore.getState().createProject('Mindfulness', '#8B1528', 'Heart');
  useEkirumStore.getState().dismissCelebration();

  const initialSkill = useEkirumStore.getState().skills.find((s) => s.id === project.skillId)!;
  assert.equal(initialSkill.xp, 0);

  const today = new Date();
  const todayStr = formatLocalDate(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatLocalDate(yesterday);

  // Add item #1 (while vault is locked / auto-initialized)
  const xpBeforeItem1 = useEkirumStore.getState().user.totalXp;
  const res1 = await useEkirumStore.getState().saveGratitudeEntry({
    date: todayStr,
    items: ['Fresh brewed coffee'],
    projectId: project.id,
  });
  assert.ok(res1.entry, 'Item 1 should be saved');
  assert.ok(res1.entry.id.startsWith(`grat-${todayStr}-`), 'New single-item entry must use unique per-item ID');
  assert.equal(res1.entry.itemCount, 1);
  assert.equal(res1.xpEarned, GRATITUDE_XP, 'Item 1 should earn 10 XP');
  assert.equal(res1.entry.dailyBonusAwarded, undefined, 'Item 1 must not award the 3/day bonus');

  let state = useEkirumStore.getState();
  if (state.celebration) {
    assert.equal(
      state.celebration.type,
      'achievement',
      'Saving gratitude must not trigger an XP-only celebration popup'
    );
    useEkirumStore.getState().dismissCelebration();
  }
  assert.equal(state.skills.find((s) => s.id === project.skillId)!.xp, GRATITUDE_XP);
  assert.equal(state.skills.find((s) => s.id === project.skillId)!.totalCompleted, 1);
  // First XP action may unlock ach-1 ("First Mark", +25), but MUST NOT unlock ach-gratitude-1 yet
  const ach1AfterItem1 = state.achievements.find((a) => a.id === 'ach-1');
  const achGrat1AfterItem1 = state.achievements.find((a) => a.id === 'ach-gratitude-1');
  const achGrat7AfterItem1 = state.achievements.find((a) => a.id === 'ach-gratitude-7');
  assert.ok(!achGrat1AfterItem1?.unlockedAt, 'ach-gratitude-1 must NOT unlock after only 1 item');
  assert.equal(achGrat7AfterItem1?.progress, 0, 'ach-gratitude-7 progress must remain 0 until 3 items are logged');
  const expectedBonusAfterItem1 = ach1AfterItem1?.unlockedAt ? ach1AfterItem1.xpReward : 0;
  assert.equal(state.user.totalXp, xpBeforeItem1 + GRATITUDE_XP + expectedBonusAfterItem1);

  // Add item #2
  const xpBeforeItem2 = state.user.totalXp;
  const res2 = await useEkirumStore.getState().saveGratitudeEntry({
    date: todayStr,
    items: ['Clean desk'],
    projectId: project.id,
  });
  assert.ok(res2.entry && res2.entry.id !== res1.entry.id, 'Item 2 must get its own distinct entry ID');
  assert.equal(res2.xpEarned, GRATITUDE_XP, 'Item 2 should earn 10 XP');
  assert.equal(res2.entry.dailyBonusAwarded, undefined);

  state = useEkirumStore.getState();
  if (state.celebration) {
    assert.ok(
      state.celebration.type === 'achievement' || state.celebration.type === 'levelUp',
      'Saving gratitude must only trigger achievement/levelUp modals, never plain XP popups'
    );
    useEkirumStore.getState().dismissCelebration();
  }
  assert.equal(state.user.totalXp, xpBeforeItem2 + GRATITUDE_XP);
  assert.equal(state.skills.find((s) => s.id === project.skillId)!.xp, GRATITUDE_XP * 2);
  assert.ok(!state.achievements.find((a) => a.id === 'ach-gratitude-1')?.unlockedAt, 'ach-gratitude-1 must NOT unlock at 2 items');
  assert.equal(state.achievements.find((a) => a.id === 'ach-gratitude-7')?.progress, 0);

  // Add item #3 -> hits GRATITUDE_DAILY_TARGET (3), earns 10 + 5 = 15 XP & counts day toward streak/achievements
  const xpBeforeItem3 = state.user.totalXp;
  const res3 = await useEkirumStore.getState().saveGratitudeEntry({
    date: todayStr,
    items: ['Supportive call with a friend'],
    projectId: project.id,
  });
  assert.ok(res3.entry);
  assert.equal(res3.xpEarned, GRATITUDE_XP + GRATITUDE_DAILY_BONUS_XP, 'Item 3 should earn 10 + 5 bonus XP');
  assert.equal(res3.entry.dailyBonusAwarded, true);
  assert.equal(res3.entry.dailyBonusXp, GRATITUDE_DAILY_BONUS_XP);

  state = useEkirumStore.getState();
  if (state.celebration) {
    useEkirumStore.getState().dismissCelebration();
  }
  const achGrat1AfterItem3 = state.achievements.find((a) => a.id === 'ach-gratitude-1');
  assert.ok(achGrat1AfterItem3?.unlockedAt, 'ach-gratitude-1 must unlock once 3 items are logged in a day');
  assert.equal(state.achievements.find((a) => a.id === 'ach-gratitude-7')?.progress, 1);
  assert.equal(
    state.user.totalXp,
    xpBeforeItem3 + GRATITUDE_XP + GRATITUDE_DAILY_BONUS_XP + (achGrat1AfterItem3?.xpReward || 0),
    'Total XP should reflect 10 XP item + 5 XP daily bonus + ach-gratitude-1 reward'
  );
  assert.equal(state.skills.find((s) => s.id === project.skillId)!.xp, GRATITUDE_XP * 3 + GRATITUDE_DAILY_BONUS_XP);

  // Add item #4 -> still allowed, earns 10 XP, NO second +5 bonus
  const unlockedBeforeItem4 = new Set(state.user.achievements || []);
  const xpBeforeItem4 = state.user.totalXp;
  const skillXpBeforeItem4 = state.skills.find((s) => s.id === project.skillId)!.xp;
  const res4 = await useEkirumStore.getState().saveGratitudeEntry({
    date: todayStr,
    items: ['Crisp evening air'],
    projectId: project.id,
  });
  assert.ok(res4.entry);
  assert.equal(res4.xpEarned, GRATITUDE_XP, 'Item 4 beyond 3/day should earn base 10 XP without extra daily bonus');
  assert.equal(res4.entry.dailyBonusAwarded, undefined);
  state = useEkirumStore.getState();
  if (state.celebration) {
    useEkirumStore.getState().dismissCelebration();
  }
  const achBonusItem4 = state.achievements
    .filter((a) => a.unlockedAt && !unlockedBeforeItem4.has(a.id))
    .reduce((sum, a) => sum + (a.xpReward || 0), 0);
  assert.equal(state.user.totalXp, xpBeforeItem4 + GRATITUDE_XP + achBonusItem4);
  assert.equal(state.skills.find((s) => s.id === project.skillId)!.xp, skillXpBeforeItem4 + GRATITUDE_XP);

  // Edit item #2 -> earns 0 extra XP
  const xpBeforeEdit = useEkirumStore.getState().user.totalXp;
  const skillXpBeforeEdit = useEkirumStore.getState().skills.find((s) => s.id === project.skillId)!.xp;
  const editRes = await useEkirumStore.getState().saveGratitudeEntry({
    id: res2.entry.id,
    date: todayStr,
    items: ['Clean desk and fresh notebook'],
    projectId: project.id,
  });
  assert.ok(editRes.entry);
  assert.equal(editRes.entry.id, res2.entry.id);
  assert.equal(editRes.xpEarned, 0, 'Editing an existing item must not award duplicate XP');
  assert.equal(useEkirumStore.getState().user.totalXp, xpBeforeEdit);
  assert.equal(useEkirumStore.getState().skills.find((s) => s.id === project.skillId)!.xp, skillXpBeforeEdit);

  // Anti-farming check: delete items #3 and #4, then add a replacement 3rd item -> +5 daily bonus MUST NOT fire twice on the same date
  useEkirumStore.getState().deleteGratitudeEntry(res3.entry.id);
  useEkirumStore.getState().deleteGratitudeEntry(res4.entry.id);
  const unlockedBeforeReplacement = new Set(useEkirumStore.getState().user.achievements || []);
  const xpBeforeReplacement = useEkirumStore.getState().user.totalXp;
  const skillXpBeforeReplacement = useEkirumStore.getState().skills.find((s) => s.id === project.skillId)!.xp;
  const replaceRes = await useEkirumStore.getState().saveGratitudeEntry({
    date: todayStr,
    items: ['Replacing deleted item'],
    projectId: project.id,
  });
  assert.ok(replaceRes.entry);
  assert.equal(replaceRes.xpEarned, GRATITUDE_XP, 'Replacement 3rd item must earn base 10 XP but NEVER double-award the +5 daily bonus');
  assert.equal(replaceRes.entry.dailyBonusAwarded, undefined);
  const afterReplaceState = useEkirumStore.getState();
  const achBonusReplace = afterReplaceState.achievements
    .filter((a) => a.unlockedAt && !unlockedBeforeReplacement.has(a.id))
    .reduce((sum, a) => sum + (a.xpReward || 0), 0);
  assert.equal(afterReplaceState.user.totalXp, xpBeforeReplacement + GRATITUDE_XP + achBonusReplace);
  assert.equal(afterReplaceState.skills.find((s) => s.id === project.skillId)!.xp, skillXpBeforeReplacement + GRATITUDE_XP);

  // Verify passphrase setup can decrypt auto-sealed single-item entries created while locked
  const currentVault = useEkirumStore.getState().defusionVault!;
  assert.ok(currentVault, 'Auto-initialized vault must exist in store');
  assert.ok(await db.defusionVault.get(currentVault.id), 'Auto-initialized vault must be persisted in IndexedDB');
  assert.equal(currentVault.passphraseConfigured, false);
  const { updatedVault: configuredVault } = await configureVaultPassphrase(currentVault, 'my-secret-gratitude');
  await useEkirumStore.getState().saveDefusionVaultConfig(configuredVault);
  const storeKey = await unlockDefusionVault(configuredVault, 'my-secret-gratitude');
  const decEdited = await decryptGratitudeEntry(storeKey, useEkirumStore.getState().gratitudeEntries.find((e) => e.id === res2.entry!.id)!);
  assert.deepEqual(decEdited, { items: ['Clean desk and fresh notebook'] });

  // Verify backup export never contains plaintext
  const exported = await exportAll('test-device');
  const exportedJson = JSON.stringify(exported);
  assert.ok(!exportedJson.includes('Clean desk and fresh notebook'), 'Backup JSON must never contain plaintext');
  assert.ok(!exportedJson.includes('Fresh brewed coffee'), 'Backup JSON must never contain plaintext');

  // 3. Test multi-device sync delta (+10 XP item + +5 XP bonus) & qualifying-day streak progression
  const remotePayload = await encryptGratitudePayload(configuredVault.publicKeyJwk, {
    items: ['Long run in the park', 'Good conversation', 'Evening stillness'],
  });
  const remoteBackup = await exportAll('remote-device');
  remoteBackup.tables.gratitudeEntries = [
    ...(remoteBackup.tables.gratitudeEntries || []),
    {
      id: `grat-${yesterdayStr}-remote`,
      date: yesterdayStr,
      itemCount: GRATITUDE_DAILY_TARGET,
      dailyBonusAwarded: true,
      dailyBonusXp: GRATITUDE_DAILY_BONUS_XP,
      xpAwarded: true,
      xpEarned: GRATITUDE_XP,
      ciphertext: remotePayload.ciphertext,
      iv: remotePayload.iv,
      wrappedKey: remotePayload.wrappedKey,
      createdAt: new Date(yesterday).toISOString(),
      updatedAt: new Date(yesterday).toISOString(),
      isDeleted: false,
    },
  ];

  const xpBeforeMerge = useEkirumStore.getState().user.totalXp;
  const mergeRes = await importAndMerge(remoteBackup);
  assert.equal(mergeRes.success, true);
  await useEkirumStore.getState().syncWithDatabase();

  const afterMerge = useEkirumStore.getState();
  assert.equal(
    afterMerge.user.totalXp,
    xpBeforeMerge + GRATITUDE_XP + GRATITUDE_DAILY_BONUS_XP,
    'Importing a remote gratitude entry with dailyBonusXp should credit item XP + bonus XP cleanly'
  );
  assert.equal(
    afterMerge.achievements.find((a) => a.id === 'ach-gratitude-7')?.progress,
    2,
    'Gratitude achievement progress should count both yesterday (3 items) and today (3 active items)'
  );

  const streak = calculateHabitStreak([todayStr, yesterdayStr]);
  assert.equal(streak.current, 2, 'Two consecutive qualifying days should give a 2-day streak');

  console.log('All Gratitude journal tests passed!');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
