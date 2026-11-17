# GEMINI-CLI-ARTIFACT-001: Full Exploit Chain

## Overview

A single fork pull request against `google-gemini/gemini-cli` grants the attacker:

1. **Arbitrary code execution** on Google's CI runners (Linux, macOS, Windows)
2. **GITHUB_TOKEN** with `statuses:write` — merge queue manipulation
3. **GEMINI_API_KEY** — Gemini API access charged to Google's account

No approval gate. No human review. Fully automatic.

## Attack Chain

```
Attacker forks google-gemini/gemini-cli
        │
        ▼
Opens PR with payload hidden in package.json preinstall
and/or modified test/build files
        │
        ▼
trigger_e2e.yml fires automatically on `pull_request`
  → Saves fork's repo name + SHA to artifact
        │
        ▼
chained_e2e.yml fires on `workflow_run: completed`
  → Downloads artifact with fork SHA
  → Checks out fork code (all 4 jobs: Linux×2, macOS, Windows, evals)
        │
        ├──── npm ci ──────────────────────────────────────────┐
        │     Fork's preinstall hook executes                  │
        │     GITHUB_TOKEN available (statuses:write)          │
        │     → Exfiltrate token                               │
        │     → Set any commit status to "success"             │
        │     → Install backdoor in node_modules/              │
        │                                                      │
        ├──── npm run build ───────────────────────────────────┤
        │     Fork's build scripts execute                     │
        │     → Inject code into compiled output               │
        │     → Modify runtime to intercept env vars           │
        │                                                      │
        ├──── npm run test:integration:sandbox:none ───────────┤
        │     Fork's compiled code runs WITH:                  │
        │       GEMINI_API_KEY (step-level env)                │
        │       GITHUB_TOKEN (always present)                  │
        │     → Exfiltrate both tokens                         │
        │     → Make Gemini API calls                          │
        │     → Set commit statuses                            │
        └──────────────────────────────────────────────────────┘
```

## This PoC Demonstrates

### Phase 1: preinstall hook (`scripts/poc-preinstall.js`)

Added `"preinstall": "node scripts/poc-preinstall.js || true"` to package.json.

Runs during `npm ci` step. Collects evidence:
- GITHUB_TOKEN is present (confirms `statuses:write` access)
- GEMINI_API_KEY is absent (confirms step-level scoping)
- Runner metadata (name, OS, workspace, workflow, run ID)

### Phase 2: test execution (`scripts/poc-test-phase.js`)

Imported in `integration-tests/globalSetup.ts`. Runs during "Run E2E tests" step.

Collects evidence:
- GEMINI_API_KEY is present, with length and prefix verification
- GITHUB_TOKEN is present
- Cross-references preinstall evidence to confirm both phases executed

### Evidence Files

Both phases write JSON evidence to `.poc-evidence/`:
- `preinstall-evidence.json` — Phase 1 results
- `test-phase-evidence.json` — Phase 2 results

These files persist as workflow artifacts and appear in the CI logs.

## Supply Chain Impact

### GITHUB_TOKEN (statuses:write)

The workflow sets these permissions:
```yaml
permissions:
  contents: read
  statuses: write
```

GITHUB_TOKEN is available to all steps. An attacker's code can call the
GitHub Statuses API to set commit statuses. However, the `set_workflow_status`
job runs with `if: always()` and overwrites the status with the real E2E
result after all jobs complete — so a premature "success" status set during
preinstall would be overwritten within minutes.

The GITHUB_TOKEN's primary value to an attacker is as a credential for
authenticated GitHub API access (read repo contents, list workflows,
enumerate secrets metadata) rather than persistent status manipulation.

### GEMINI_API_KEY

Available during the test step. An attacker can:
- Use Google's API key for Gemini API access (charged to Google's account)
- Enumerate accessible models and projects
- Exfiltrate the key for persistent access after the run

### Combined Attack

1. Open innocent-looking PR (typo fix, doc update)
2. Payload in preinstall hook or build script: exfiltrate GITHUB_TOKEN
3. Payload in test code (runs with API key in env): exfiltrate GEMINI_API_KEY
4. Tests pass naturally (payload doesn't interfere with test execution)
5. Attacker has both tokens before any human reviews the PR
6. GEMINI_API_KEY provides persistent Gemini API access beyond the CI run

## Timeline

- **2026-10-02**: VRP submitted
- **2026-10-04**: Routed to Google Cloud VRP
- **2026-10-04**: AI agent set P1/S4
- **2026-10-10**: Fix PR #29615 opened (adds `persist-credentials: false` only)
- **2026-10-17**: Fix PR auto-closed by stale bot
- **2026-11-17**: Vulnerability still fully live (45 days)

## Fix PR #29615 Does Not Fix the Vulnerability

The only change in PR #29615 was adding `persist-credentials: false` to checkout steps.
This prevents git credential persistence. It does NOT:
- Stop fork code from executing
- Remove GEMINI_API_KEY from the test step environment
- Remove GITHUB_TOKEN from any step
- Add any approval gate for fork PRs
- Restrict npm lifecycle hooks

The vulnerability is **completely unmitigated**.

## Correct Fix

The workflow should either:

1. **Never check out fork code in a privileged workflow** — run E2E on the base branch only, or
2. **Use `pull_request` trigger** (not `workflow_run`) which doesn't have access to secrets, or
3. **Gate fork PRs behind environment approval** (like `eval-pr.yml` does with `eval-gate`), or
4. **Pin the checkout to the base branch** and only test fork changes after merge simulation
