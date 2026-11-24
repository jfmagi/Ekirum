import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {
  initializeDefusionVault,
  configureVaultPassphrase,
  unlockDefusionVault,
  encryptGratitudePayload,
  decryptGratitudeEntry,
  GRATITUDE_XP,
} from '../src/lib/defusionCrypto';
import { sanitizeGratitudeEntry } from '../src/lib/schemaSanitizers';
import { useEkirumStore } from '../src/store/useEkirumStore';
import { db } from '../src/lib/db';
import { exportAll, importAndMerge } from '../src/lib/syncEngine';
import { formatLocalDate } from '../src/lib/dateParser';

async function runTests() {
  console.log('Running Gratitude Journal encryption, shared vault, XP, achievements & sync tests...');

  // 1. Test encryption/decryption using shared vault before passphrase & after passphrase setup
  const vault = await initializeDefusionVault();
  const payload = {
    items: ['Morning sunlight through the window', 'Quiet coffee before work', 'A kind note from a friend'],
    note: 'Felt grounded before opening email.',
  };
  const sealed = await encryptGratitudePayload(vault.publicKeyJwk, payload);
  assert.ok(sealed.ciphertext && sealed.iv && sealed.wrappedKey);
  assert.ok(!sealed.ciphertext.includes('Morning sunlight'), 'Ciphertext must never include plaintext');

  const { updatedVault } = await configureVaultPassphrase(vault, 'shared-passphrase-1');
  const unlockedKey = await unlockDefusionVault(updatedVault, 'shared-passphrase-1');
  const decrypted = await decryptGratitudeEntry(unlockedKey, sealed);
  assert.deepEqual(decrypted, payload);

  // 2. Test store saveGratitudeEntry, XP (10 XP once/day), Skill link, Achievement unlock, and anti-farming
  await useEkirumStore.getState().clearAllData();
  const project = useEkirumStore.getState().createProject('Mindfulness', '#8B1528', 'Heart');
  useEkirumStore.getState().dismissCelebration();

  const initialUserXp = useEkirumStore.getState().user.totalXp;
  const todayStr = formatLocalDate();

  const saveRes1 = await useEkirumStore.getState().saveGratitudeEntry({
    date: todayStr,
    items: ['Warm tea', 'Clean desk'],
    note: 'Good focus session',
    projectId: project.id,
  });

  assert.ok(saveRes1.entry, 'Should create today gratitude entry');
  assert.equal(saveRes1.entry.id, `grat-${todayStr}`);
  assert.equal(saveRes1.xpEarned, GRATITUDE_XP, 'First daily entry must earn 10 XP');
  assert.ok(saveRes1.entry.ciphertext && saveRes1.entry.iv && saveRes1.entry.wrappedKey);

  const afterSave1 = useEkirumStore.getState();
  const skill1 = afterSave1.skills.find((s) => s.id === project.skillId)!;
  assert.equal(skill1.xp, GRATITUDE_XP, 'Linked project skill should gain 10 XP');
  assert.equal(skill1.totalCompleted, 1);

  const firstLightAch = afterSave1.achievements.find((a) => a.id === 'ach-gratitude-1');
  const firstMarkAch = afterSave1.achievements.find((a) => a.id === 'ach-1');
  assert.ok(firstLightAch?.unlockedAt, 'Should unlock ach-gratitude-1 ("First Light")');
  assert.ok(firstMarkAch?.unlockedAt, 'Should unlock ach-1 ("First Mark") on initial XP gain');
  const expectedBonus = (firstLightAch?.xpReward || 0) + (firstMarkAch?.xpReward || 0);
  assert.equal(
    afterSave1.user.totalXp,
    initialUserXp + GRATITUDE_XP + expectedBonus,
    'User should receive 10 XP + unlocked achievement bonuses'
  );

  // Editing the same day's entry must NOT grant extra XP
  const xpBeforeEdit = afterSave1.user.totalXp;
  const skillXpBeforeEdit = skill1.xp;
  const editRes = await useEkirumStore.getState().saveGratitudeEntry({
    id: saveRes1.entry.id,
    date: todayStr,
    items: ['Warm tea', 'Clean desk', 'Evening walk'],
    note: 'Added third item',
    projectId: project.id,
  });
  assert.equal(editRes.xpEarned, 0, 'Editing existing day must earn 0 extra XP');
  assert.equal(useEkirumStore.getState().user.totalXp, xpBeforeEdit, 'User XP must not increase on edit');
  assert.equal(
    useEkirumStore.getState().skills.find((s) => s.id === project.skillId)?.xp,
    skillXpBeforeEdit,
    'Skill XP must not increase on edit'
  );

  // Deleting today's entry and recreating today must STILL prevent double daily XP
  useEkirumStore.getState().deleteGratitudeEntry(saveRes1.entry.id);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(useEkirumStore.getState().gratitudeEntries.length, 0);

  const recreateRes = await useEkirumStore.getState().saveGratitudeEntry({
    date: todayStr,
    items: ['Back again'],
    projectId: project.id,
  });
  assert.equal(recreateRes.xpEarned, 0, 'Recreating on same day after delete must not double-credit daily XP');
  assert.equal(useEkirumStore.getState().user.totalXp, xpBeforeEdit);
  assert.equal(useEkirumStore.getState().gratitudeEntries.length, 1);

  // 3. Test backup safety (no plaintext leaks) & multi-device sync of remote day
  const exported = await exportAll();
  const exportedJson = JSON.stringify(exported);
  assert.ok(!exportedJson.includes('Back again'), 'Exported JSON must never expose plaintext gratitude items');
  assert.ok(!exportedJson.includes('Evening walk'), 'Exported JSON must never expose previous ciphertext plaintext');

  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = formatLocalDate(yesterdayDate);

  const remoteBackup = await exportAll('remote-device');
  remoteBackup.tables.gratitudeEntries = [
    ...(remoteBackup.tables.gratitudeEntries || []),
    {
      id: `grat-${yesterdayStr}`,
      date: yesterdayStr,
      projectId: project.id,
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      wrappedKey: sealed.wrappedKey,
      xpAwarded: true,
      xpEarned: 10,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
      isDeleted: false,
    },
  ];

  const xpBeforeMerge = useEkirumStore.getState().user.totalXp;
  const mergeRes = await importAndMerge(remoteBackup);
  assert.equal(mergeRes.success, true);
  await useEkirumStore.getState().syncWithDatabase();

  const afterMergeState = useEkirumStore.getState();
  assert.equal(afterMergeState.gratitudeEntries.length, 2, 'Should now have both days in store');
  assert.equal(afterMergeState.user.totalXp, xpBeforeMerge + 10, 'Remote gratitude day credits its 10 XP delta');
  const weekAch = afterMergeState.achievements.find((a) => a.id === 'ach-gratitude-7');
  assert.equal(weekAch?.progress, 2, 'Week of Notice progress should update to 2/7 days');

  // 4. Sanitizer checks
  assert.equal(sanitizeGratitudeEntry({ id: 'x', date: 'bad-date' }), null);
  const validSanitized = sanitizeGratitudeEntry({
    id: 'grat-2026-11-20',
    date: '2026-11-20',
    ciphertext: 'abc',
    iv: 'def',
    wrappedKey: 'ghi',
    xpAwarded: true,
    xpEarned: 10,
  });
  assert.equal(validSanitized?.date, '2026-11-20');

  // Ensure db table contains expected count
  const dbCount = await db.gratitudeEntries.filter((e) => !e.isDeleted).count();
  assert.equal(dbCount, 2);

  console.log('All Gratitude Journal tests passed!');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
