#!/usr/bin/env bash
# Baseline: automated checks for Tidewater (App Readiness Audit, phase 1).
#
# Runs the checks a tool can decide, saves the raw evidence, and prints a summary.
# It never changes the app. Judgment (pass, fail, severity) happens afterwards,
# in findings.json, using this evidence.
#
# Usage, from the repo root:
#   (from main: v0-as-built plus this audit folder only)
#   TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/tidewater_test bash audit/baseline.sh
#
# Needs: Node 22 and npm, git, gitleaks (brew install gitleaks), and a Postgres
# for the database tests (the local Supabase stack works, or the separate
# container described in the README).

set -u
OUT="audit/out/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"
COMMIT="$(git rev-parse --short HEAD)"
PORT="${LAB_PORT:-3123}"
summary() { printf '%-34s %s\n' "$1" "$2" | tee -a "$OUT/summary.txt"; }

echo "Tidewater baseline at commit $COMMIT, $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee "$OUT/summary.txt"
git describe --tags --always > "$OUT/describe.txt"

# G1.1: no secrets in the repo, its full history, agent instruction files or the built bundle
gitleaks git . --redact --no-banner --report-format json --report-path "$OUT/gitleaks-history.json" >"$OUT/gitleaks-history.log" 2>&1
summary "G1.1 secrets in git history" "$( [ $? -eq 0 ] && echo 'none found' || echo 'LEAKS FOUND, see gitleaks-history.json')"
ls AGENTS.md CLAUDE.md .cursorrules .github/copilot-instructions.md 2>/dev/null > "$OUT/agent-files.txt"
grep -nEi "key|token|secret|password" $(cat "$OUT/agent-files.txt") > "$OUT/agent-files-grep.txt" 2>/dev/null
summary "G1.1 agent instruction files" "$(wc -l < "$OUT/agent-files.txt" | tr -d ' ') file(s), $(wc -l < "$OUT/agent-files-grep.txt" | tr -d ' ') suspicious line(s)"
git ls-files | grep -E '(^|/)\.env' > "$OUT/tracked-env-files.txt"
summary "G1.1 tracked .env files" "$(tr '\n' ' ' < "$OUT/tracked-env-files.txt")"

# G1.4: builds from a clean install; plus type check, lint, tests (G2.7, G3.2)
npm ci --no-audit --no-fund >"$OUT/npm-ci.log" 2>&1;            summary "G1.4 npm ci" "exit $?"
npm run -s typecheck >"$OUT/typecheck.log" 2>&1;                summary "G2.7 type check" "exit $?"
npm run -s lint >"$OUT/lint.log" 2>&1;                          summary "G2.7 lint (zero warnings)" "exit $?"
if [ -n "${TEST_DATABASE_URL:-}" ]; then
  npm test >"$OUT/tests.log" 2>&1; rc=$?
  summary "G3.2 tests (unit + real DB)" "exit $rc, $(grep -E 'Tests +[0-9]' "$OUT/tests.log" | tail -1 | tr -s ' ')"
else
  summary "G3.2 tests (unit + real DB)" "SKIPPED: set TEST_DATABASE_URL"
fi
npm run -s build >"$OUT/build.log" 2>&1;                        summary "G1.4 production build" "exit $?"
gitleaks dir .next/static --redact --no-banner >"$OUT/gitleaks-bundle.log" 2>&1
summary "G1.1 secrets in client bundle" "$( [ $? -eq 0 ] && echo 'none found' || echo 'LEAKS FOUND, see gitleaks-bundle.log')"

# G1.3 / G3.6: known vulnerabilities, all dependencies and production only
npm audit --json >"$OUT/npm-audit-all.json" 2>/dev/null
npm audit --omit=dev --json >"$OUT/npm-audit-prod.json" 2>/dev/null
for f in all prod; do
  summary "G1.3 npm audit ($f)" "$(node -e "const m=require('./$OUT/npm-audit-$f.json').metadata.vulnerabilities;console.log('critical '+m.critical+', high '+m.high+', moderate '+m.moderate+', low '+m.low)")"
done
summary "G3.6 automated dependency updates" "$( [ -f .github/dependabot.yml ] && echo 'dependabot.yml present' || echo 'none')"

# Meta signals: safety switched off (AI-02), shipped stubs (AI-01), swallowed errors
grep -rnE "ignoreBuildErrors|ignoreDuringBuilds|eslint-disable|@ts-ignore|@ts-expect-error|as any\b|Access-Control-Allow-Origin|rejectUnauthorized:\s*false|DISABLE ROW LEVEL SECURITY" \
  src supabase next.config.ts eslint.config.mjs tsconfig.json >"$OUT/safety-switches.txt" 2>/dev/null
summary "AI-02 safety switches" "$(wc -l < "$OUT/safety-switches.txt" | tr -d ' ') hit(s)"
grep -rnIiE "TODO|FIXME|lorem|mock data|sample data|not implemented" src >"$OUT/stubs.txt" 2>/dev/null
summary "AI-01 / G3.11 stub markers in src" "$(wc -l < "$OUT/stubs.txt" | tr -d ' ') hit(s)"
grep -rnE "catch\s*(\([^)]*\))?\s*\{\s*\}" src >"$OUT/empty-catch.txt" 2>/dev/null
summary "AI-01 empty catch blocks" "$(wc -l < "$OUT/empty-catch.txt" | tr -d ' ') hit(s)"

# G3.8 / G2.7: who must review changes, and what CI runs
cp .github/CODEOWNERS "$OUT/CODEOWNERS.txt" 2>/dev/null
summary "G3.8 CODEOWNERS owners" "$(grep -v '^#' .github/CODEOWNERS 2>/dev/null | awk 'NF{print $2}' | sort -u | tr '\n' ' ')"
summary "G2.7 CI workflow" "$( [ -f .github/workflows/ci.yml ] && echo 'present (runs only on GitHub)' || echo 'none')"
summary "G2.7 / G3.8 git remote" "$(git remote | tr '\n' ' ' | sed 's/^$/none: branch protection cannot exist yet/')"

# G1.2 / G3.9: run the production build and probe it signed out
APP_URL="http://localhost:$PORT" NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321" NEXT_PUBLIC_SUPABASE_ANON_KEY="dummy" \
  npx next start -p "$PORT" >"$OUT/next-start.log" 2>&1 &
SERVER=$!; sleep 8
curl -sI "http://localhost:$PORT/" >"$OUT/headers.txt"
for h in content-security-policy strict-transport-security x-frame-options x-content-type-options; do
  summary "G3.9 header $h" "$(grep -qi "^$h:" "$OUT/headers.txt" && echo present || echo MISSING)"
done
summary "G3.9 cross-site POST" "HTTP $(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Origin: https://evil.example' "http://localhost:$PORT/login")"
summary "G1.2 signed-out page /clients" "HTTP $(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/clients")"
summary "G1.2 signed-out API call" "HTTP $(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/clients/x/brief")"
summary "G3.3 health endpoint" "$(curl -s "http://localhost:$PORT/api/health")"
kill "$SERVER" 2>/dev/null

echo "Evidence saved in $OUT"
