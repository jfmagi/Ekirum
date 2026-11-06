import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {
  initializeDefusionVault,
  configureVaultPassphrase,
  unlockDefusionVault,
  encryptDefusionPayload,
  decryptDefusionEntry,
  DEFUSION_XP,
} from '../src/lib/defusionCrypto';
import { useEkirumStore } from '../src/store/useEkirumStore';
import { db } from '../src/lib/db';
import { exportAll, importAndMerge } from '../src/lib/syncEngine';

async function runTests() {
  console.log('Running Defusion encryption, vault lifecycle, silent XP, and sync tests...');

  // 1. Test zero-friction sealing before passphrase is set, then configuring passphrase on first unlock
  const vault = await initializeDefusionVault();
  assert.equal(vault.passphraseConfigured, false, 'Initial vault should not have passphraseConfigured yet');
  assert.ok(vault.publicKeyJwk, 'Public key JWK must be generated');
  assert.ok(vault.pendingSealKey && vault.pendingWrappedPrivateKey && vault.pendingIv, 'Pending seal material must exist');

  const secretThought = 'I will never finish this architecture migration on time';
  const framingPrefix = "I notice I'm having the thought that…";
  const sealed = await encryptDefusionPayload(vault.publicKeyJwk, {
    text: secretThought,
    prefix: framingPrefix,
  });

  assert.ok(sealed.ciphertext && sealed.iv && sealed.wrappedKey, 'Encrypted fields must be non-empty');
  assert.ok(!sealed.ciphertext.includes(secretThought), 'Ciphertext must not contain plaintext thought');
  assert.ok(!sealed.ciphertext.includes(framingPrefix), 'Ciphertext must not contain plaintext prefix');

  // Configure passphrase on first unlock
  const { updatedVault, privateKey } = await configureVaultPassphrase(vault, 'correct-horse-battery');
  assert.equal(updatedVault.passphraseConfigured, true, 'Vault should mark passphraseConfigured=true');
  assert.equal(updatedVault.pendingSealKey, undefined, 'Pending seal key must be stripped once passphrase is set');
  assert.equal(updatedVault.pendingWrappedPrivateKey, undefined, 'Pending wrapped key must be stripped');
  assert.ok(updatedVault.wrappedPrivateKey && updatedVault.salt && updatedVault.iv, 'PBKDF2 wrapped key material must exist');

  // Decrypt entry sealed BEFORE passphrase was set
  const decrypted = await decryptDefusionEntry(privateKey, {
    ...sealed,
    burned: false,
  });
  assert.deepEqual(decrypted, {
    text: secretThought,
    prefix: framingPrefix,
  });

  // 2. Test wrong passphrase rejection and passphrase rotation
  await assert.rejects(
    async () => {
      await unlockDefusionVault(updatedVault, 'wrong-passphrase');
    },
    /Incorrect passphrase/,
    'Unlocking with wrong passphrase must fail'
  );

  const unlockedKey = await unlockDefusionVault(updatedVault, 'correct-horse-battery');
  const decryptedAgain = await decryptDefusionEntry(unlockedKey, { ...sealed, burned: false });
  assert.equal(decryptedAgain?.text, secretThought);

  // Rotate passphrase
  const { updatedVault: rotatedVault, privateKey: rotatedKey } = await configureVaultPassphrase(
    updatedVault,
    'new-passphrase-2026',
    'correct-horse-battery'
  );
  await assert.rejects(
    async () => {
      await unlockDefusionVault(rotatedVault, 'correct-horse-battery');
    },
    /Incorrect passphrase/,
    'Old passphrase must no longer unlock rotated vault'
  );
  const decryptedAfterRotation = await decryptDefusionEntry(rotatedKey, { ...sealed, burned: false });
  assert.equal(decryptedAfterRotation?.text, secretThought);

  // 3. Test Zustand store defuseThought: silent XP, project skill connection, and burn mode
  await useEkirumStore.getState().clearAllData();
  const project = useEkirumStore.getState().createProject('Deep Work', '#8B1528', 'Compass');
  useEkirumStore.getState().dismissCelebration();
  const initialUserXp = useEkirumStore.getState().user.totalXp;
  const initialSkill = useEkirumStore.getState().skills.find((s) => s.id === project.skillId)!;
  assert.equal(initialSkill.xp, 0);

  // Seal a thought linked to the project
  const entry1 = await useEkirumStore.getState().defuseThought({
    text: 'Worrying about tomorrow presentation',
    prefix: 'My mind is telling me a story that…',
    projectId: project.id,
    burned: false,
  });
  assert.ok(entry1, 'defuseThought should return created entry');
  assert.equal(entry1.burned, false);
  assert.ok(entry1.ciphertext && entry1.iv && entry1.wrappedKey);

  // Verify silent XP was granted to both character and linked project skill without triggering a celebration modal
  const afterSealState = useEkirumStore.getState();
  assert.equal(entry1.xpEarned, DEFUSION_XP, 'Entry should record 10 XP earned');
  const updatedSkill1 = afterSealState.skills.find((s) => s.id === project.skillId)!;
  assert.equal(updatedSkill1.xp, DEFUSION_XP, 'Connected project skill should receive 10 XP');
  assert.equal(updatedSkill1.totalCompleted, 1, 'Connected project skill should increment totalCompleted');
  assert.ok(
    afterSealState.user.totalXp >= initialUserXp + DEFUSION_XP,
    'User should silently receive 10 XP (plus any first-action achievement bonus)'
  );
  assert.equal(afterSealState.celebration, null, 'Defusing a thought must not pop up an XP celebration modal');

  // Verify backup export never contains plaintext
  const exported = await exportAll();
  const exportedJson = JSON.stringify(exported);
  assert.ok(
    !exportedJson.includes('Worrying about tomorrow presentation'),
    'Exported backup JSON must never contain plaintext thought'
  );

  const xpBeforeSecond = afterSealState.user.totalXp;

  // Burn a thought on defuse
  const entry2 = await useEkirumStore.getState().defuseThought({
    text: 'This thought should be vaporized immediately',
    projectId: project.id,
    burned: true,
  });
  assert.ok(entry2);
  assert.equal(entry2.burned, true);
  assert.equal(entry2.ciphertext, undefined, 'Burned thought must not store ciphertext');
  assert.equal(entry2.iv, undefined, 'Burned thought must not store iv');
  assert.equal(entry2.wrappedKey, undefined, 'Burned thought must not store wrappedKey');
  assert.equal(
    useEkirumStore.getState().user.totalXp,
    xpBeforeSecond + DEFUSION_XP,
    'Burned thought silently grants exact 10 XP'
  );

  // Burn an existing sealed entry
  await useEkirumStore.getState().burnDefusionEntry(entry1.id);
  const burnedEntry1 = useEkirumStore.getState().defusionEntries.find((e) => e.id === entry1.id)!;
  assert.equal(burnedEntry1.burned, true);
  assert.equal(burnedEntry1.ciphertext, undefined, 'Burning an existing entry must erase its ciphertext');
  const dbEntry1 = await db.defusionEntries.get(entry1.id);
  assert.equal(dbEntry1?.burned, true);
  assert.equal(dbEntry1?.ciphertext, undefined);

  // 4. Test multi-device sync of Defusion entries & monotonic burn
  const remoteEntryId = 'def-remote-1';
  const remoteBackup = await exportAll('remote-device');
  remoteBackup.tables.defusionEntries = [
    ...(remoteBackup.tables.defusionEntries || []),
    {
      id: remoteEntryId,
      projectId: project.id,
      burned: false,
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      wrappedKey: sealed.wrappedKey,
      xpAwarded: true,
      xpEarned: 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: false,
    },
  ];

  const xpBeforeMerge = useEkirumStore.getState().user.totalXp;
  const mergeRes = await importAndMerge(remoteBackup);
  assert.equal(mergeRes.success, true);
  await useEkirumStore.getState().syncWithDatabase();

  const xpAfterMerge = useEkirumStore.getState().user.totalXp;
  assert.equal(xpAfterMerge, xpBeforeMerge + 10, 'Importing a new remote defusion entry should credit its 10 XP delta');

  console.log('All Defusion tests passed!');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
