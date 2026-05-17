// Drift check for the committed MLP weights.
//
// Regenerates the training data + weights from scratch using the pinned
// manifest and the current engine/AI/feature code, then byte-compares
// the regenerated weights against the committed src/ai/ml-mlp/weights.json.
//
// Non-zero exit on drift; the caller (CI, pre-release, or a human bumping
// the weights) should either accept the new file (cp the temp output over
// the committed file + commit) or chase down the regression.
//
// This script is intentionally NOT part of `npm test` — it runs the full
// generate + train pipeline (~minutes) and is meant for release-time /
// nightly use, not every commit.
//
// Usage:
//   npm run verify-weights

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMMITTED_WEIGHTS = join(REPO_ROOT, 'src', 'ai', 'ml-mlp', 'weights.json');

function runTsx(scriptPath: string, args: string[]): void {
  execFileSync('tsx', [scriptPath, ...args], { cwd: REPO_ROOT, stdio: 'inherit' });
}

function main(): void {
  console.log('Step 1/3 — regenerating training data from manifest...');
  runTsx('scripts/generate-training-data.ts', []);

  console.log('\nStep 2/3 — retraining weights into temp directory...');
  const tmpDir = mkdtempSync(join(tmpdir(), 'mb-verify-'));
  const tmpWeights = join(tmpDir, 'weights.json');
  const tmpReport = join(tmpDir, 'report.json');
  runTsx('scripts/train.ts', [
    '--weights-out',
    tmpWeights,
    '--report-out',
    tmpReport,
  ]);

  console.log('\nStep 3/3 — byte-comparing regenerated weights against the committed file...');
  const committed = readFileSync(COMMITTED_WEIGHTS);
  const regen = readFileSync(tmpWeights);
  if (committed.equals(regen)) {
    console.log(`OK — committed weights match (${committed.length} bytes).`);
    return;
  }

  console.error(`\nDRIFT — committed weights do not match the regenerated file.`);
  console.error(`  committed:   ${COMMITTED_WEIGHTS}  (${committed.length} bytes)`);
  console.error(`  regenerated: ${tmpWeights}  (${regen.length} bytes)`);
  console.error(`\nTo accept the new weights:`);
  console.error(`  cp "${tmpWeights}" "${COMMITTED_WEIGHTS}"`);
  console.error(`  cp "${tmpReport}" "${join(REPO_ROOT, 'src', 'ai', 'ml-mlp', 'report.json')}"`);
  console.error(`  git add src/ai/ml-mlp/weights.json src/ai/ml-mlp/report.json`);
  console.error(`  git commit -m "ml-mlp: refresh weights"`);
  process.exit(1);
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
