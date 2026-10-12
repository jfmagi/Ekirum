import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = fileURLToPath(new URL('.', import.meta.url));
const testFiles = readdirSync(scriptsDir)
  .filter((f) => f.startsWith('test-') && f.endsWith('.ts'))
  .sort();

console.log(`\n🚀 Ekirum Test Runner: Executing ${testFiles.length} isolated test suites...\n`);

interface SuiteResult {
  file: string;
  success: boolean;
  durationMs: number;
  output: string;
}

const results: SuiteResult[] = [];
const overallStart = Date.now();

for (const file of testFiles) {
  const start = Date.now();
  const filePath = join(scriptsDir, file);
  process.stdout.write(`  ⏳ ${file.padEnd(30)} `);

  const res = await new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', filePath], {
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.on('data', (d) => {
      output += d.toString();
    });
    child.stderr.on('data', (d) => {
      output += d.toString();
    });
    child.on('close', (code) => resolve({ code, output }));
  });

  const durationMs = Date.now() - start;
  const success = res.code === 0;
  results.push({ file, success, durationMs, output: res.output });

  if (success) {
    console.log(`\x1b[32mPASSED\x1b[0m (${durationMs}ms)`);
  } else {
    console.log(`\x1b[31mFAILED\x1b[0m (${durationMs}ms)`);
  }
}

const totalTime = Date.now() - overallStart;
console.log('\n' + '='.repeat(60));
console.log('TEST RUN SUMMARY:');
let allPassed = true;
for (const r of results) {
  if (r.success) {
    console.log(`  \x1b[32m✓\x1b[0m ${r.file.padEnd(30)} ${r.durationMs}ms`);
  } else {
    allPassed = false;
    console.log(`  \x1b[31m✗\x1b[0m ${r.file.padEnd(30)} ${r.durationMs}ms`);
    console.log('\n--- Failure Output (' + r.file + ') ---');
    console.log(r.output.trim());
    console.log('----------------------------------------\n');
  }
}

const passedCount = results.filter((r) => r.success).length;
console.log('='.repeat(60));
console.log(
  `Total: ${results.length} suites | Passed: ${passedCount} | Failed: ${
    results.length - passedCount
  } | Duration: ${totalTime}ms\n`
);

if (!allPassed) {
  process.exit(1);
}
