#!/usr/bin/env node
// License policy classifier for the canonical license/compliance CI gate.
//
// Consumes the `dependency-changes` JSON emitted by
// actions/dependency-review-action (the added/updated dependencies in a PR,
// each carrying a resolved SPDX `license` and a `scope`), classifies every
// added dependency against the org policy (allow / deny / review lists),
// applies the repo's exception allowlist and the per-PR `license-override`
// label, and decides the PR outcome per the fail-vs-warn matrix in
// docs/license-compliance-ci.md.
//
// It is deliberately dependency-free (Node stdlib only) so the security gate
// pulls in no third-party code at runtime. The exception allowlist is passed
// in already converted to JSON (the workflow uses `yq` for YAML -> JSON).
//
// Exit code: 0 when nothing blocks (or warn-only / override applies), 1 when a
// blocking violation remains. Fatal usage/parse errors exit 2.

'use strict'

import fs from 'node:fs'

// ---------------------------------------------------------------------------
// Severity model (mirrors the design-doc matrix)
// ---------------------------------------------------------------------------
const SEVERITY = { CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', INFO: 'Informational' }
const SEVERITY_RANK = { Critical: 3, High: 2, Medium: 1, Informational: 0 }

// ---------------------------------------------------------------------------
// SPDX normalization — lowercase + collapse the most common variants so the
// policy lists can be written in canonical form. dependency-review already
// hands us SPDX ids in most cases; this mainly guards casing and a few
// human-readable strings that leak through from odd manifests.
// ---------------------------------------------------------------------------
const NORMALIZE = {
  'apache 2.0': 'apache-2.0',
  'apache license 2.0': 'apache-2.0',
  'apache-2.0 with llvm-exception': 'apache-2.0-with-llvm-exception',
  'mit license': 'mit',
  'bsd': 'bsd-3-clause',
  'bsd license': 'bsd-3-clause',
  'new bsd': 'bsd-3-clause',
  'simplified bsd': 'bsd-2-clause',
  'gnu affero general public license v3.0': 'agpl-3.0',
  'gnu general public license v2.0': 'gpl-2.0',
  'gnu general public license v3.0': 'gpl-3.0',
  'gnu lesser general public license v3.0': 'lgpl-3.0',
  'mozilla public license 2.0': 'mpl-2.0'
}

function normalizeOne (raw) {
  const s = String(raw || '').toLowerCase().trim()
  if (!s) return ''
  if (NORMALIZE[s]) return NORMALIZE[s]
  const stripped = s.replace(/^the\s+/, '').replace(/\s+license$/, '').trim()
  return NORMALIZE[stripped] || stripped
}

// ---------------------------------------------------------------------------
// Classify a single SPDX expression against the policy lists.
// Returns the worst category among AND-ed terms; for OR-ed terms the consumer
// may pick the most permissive, so we take the best (lowest severity).
// Categories: 'deny' | 'review' | 'allow' | 'unknown'
// ---------------------------------------------------------------------------
function classifyExpression (license, policy) {
  if (license === null || license === undefined || String(license).trim() === '' ||
      String(license).toUpperCase() === 'NOASSERTION') {
    return 'unknown'
  }
  const expr = String(license).replace(/[()]/g, ' ').trim()

  // OR: user may choose any operand -> most permissive wins.
  if (/\s+OR\s+/i.test(expr)) {
    const cats = expr.split(/\s+OR\s+/i).map(part => classifyExpression(part, policy))
    return bestCategory(cats)
  }
  // AND: every operand must comply -> worst wins.
  if (/\s+AND\s+/i.test(expr)) {
    const cats = expr.split(/\s+AND\s+/i).map(part => classifyExpression(part, policy))
    return worstCategory(cats)
  }

  const id = normalizeOne(expr.replace(/\s+(WITH)\s+.*/i, '').trim())
  if (policy.deny.has(id)) return 'deny'
  if (policy.allow.has(id)) return 'allow'
  if (policy.review.has(id)) return 'review'
  return 'unknown'
}

const CATEGORY_RANK = { deny: 3, unknown: 2, review: 1, allow: 0 }
function worstCategory (cats) {
  return cats.reduce((acc, c) => (CATEGORY_RANK[c] > CATEGORY_RANK[acc] ? c : acc), 'allow')
}
function bestCategory (cats) {
  return cats.reduce((acc, c) => (CATEGORY_RANK[c] < CATEGORY_RANK[acc] ? c : acc), 'deny')
}

// ---------------------------------------------------------------------------
// Map (category, scope) -> severity per the fail-vs-warn matrix.
//   deny    + runtime/unknown scope -> Critical (hard block, no override)
//   deny    + development scope      -> Medium   (warn)
//   unknown (no detectable license)  -> High
//   review  (weak-copyleft / model)  -> High
//   allow                            -> Informational
// ---------------------------------------------------------------------------
function severityFor (category, scope) {
  const isDev = scope === 'development'
  switch (category) {
    case 'deny': return isDev ? SEVERITY.MEDIUM : SEVERITY.CRITICAL
    case 'unknown': return SEVERITY.HIGH
    case 'review': return SEVERITY.HIGH
    default: return SEVERITY.INFO
  }
}

// ---------------------------------------------------------------------------
// Exception allowlist matching. An entry resolves a finding when the package
// matches (by name or package_url, optional version) and, if the entry pins a
// license, that license matches too. Expired entries are ignored.
// ---------------------------------------------------------------------------
function allowlistResolves (finding, allowlist, today) {
  for (const entry of allowlist) {
    if (entry.expires) {
      const exp = Date.parse(entry.expires)
      if (!Number.isNaN(exp) && exp < today) continue
    }
    const pkg = String(entry.package || '').trim()
    if (!pkg) continue
    const matchesPkg =
      pkg === finding.name ||
      pkg === finding.package_url ||
      pkg === `${finding.name}@${finding.version}` ||
      (finding.package_url && finding.package_url.startsWith(pkg))
    if (!matchesPkg) continue
    if (entry.license) {
      if (normalizeOne(entry.license) !== normalizeOne(finding.license || '')) continue
    }
    return entry
  }
  return null
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
function parseArgs (argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) {
        out[key] = 'true'
      } else {
        out[key] = next
        i++
      }
    }
  }
  return out
}

function toSet (csv) {
  return new Set(
    String(csv || '')
      .split(',')
      .map(s => normalizeOne(s))
      .filter(Boolean)
  )
}

function readJson (pathArg, fallback) {
  if (!pathArg || pathArg === '-') return fallback
  if (!fs.existsSync(pathArg)) return fallback
  const raw = fs.readFileSync(pathArg, 'utf8').trim()
  if (!raw) return fallback
  return JSON.parse(raw)
}

function boolArg (v) {
  return String(v || '').toLowerCase() === 'true'
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main () {
  const args = parseArgs(process.argv.slice(2))
  const warnOnly = boolArg(args['warn-only'])
  const override = boolArg(args.override)

  const policy = {
    allow: toSet(args.allow),
    deny: toSet(args.deny),
    review: toSet(args.review)
  }

  const changes = readJson(args.changes, [])
  const allowlistRaw = readJson(args.allowlist, {})
  const allowlist = Array.isArray(allowlistRaw)
    ? allowlistRaw
    : (Array.isArray(allowlistRaw.allow) ? allowlistRaw.allow : [])
  const today = Date.now()

  const findings = []
  for (const dep of changes) {
    if (dep.change_type && dep.change_type !== 'added') continue
    const category = classifyExpression(dep.license, policy)
    if (category === 'allow') continue // permissive & attributed elsewhere; not a finding
    const scope = dep.scope || 'unknown'
    let severity = severityFor(category, scope)
    const resolvedBy = allowlistResolves(dep, allowlist, today)
    findings.push({
      name: dep.name,
      version: dep.version,
      license: dep.license || '(none detected)',
      scope,
      ecosystem: dep.ecosystem,
      manifest: dep.manifest,
      category,
      severity,
      resolvedBy
    })
  }

  // Decide blocking. Critical always blocks (no override). High blocks unless
  // resolved by an allowlist entry or the per-PR override label. Medium/Info
  // never block.
  let blockingCount = 0
  for (const f of findings) {
    if (f.resolvedBy) { f.status = 'allowlisted'; continue }
    if (f.severity === SEVERITY.CRITICAL) { f.status = 'blocking'; blockingCount++; continue }
    if (f.severity === SEVERITY.HIGH) {
      if (override) { f.status = 'override' } else { f.status = 'blocking'; blockingCount++ }
      continue
    }
    f.status = 'warn'
  }

  const counts = { Critical: 0, High: 0, Medium: 0, Informational: 0 }
  for (const f of findings) counts[f.severity]++

  const willFail = blockingCount > 0 && !warnOnly

  writeSummary({ findings, counts, blockingCount, warnOnly, override, willFail })
  const commentBody = renderComment({ findings, counts, blockingCount, warnOnly, override, willFail })
  if (args['comment-out']) fs.writeFileSync(args['comment-out'], commentBody)

  setOutput('violation', String(findings.length > 0))
  setOutput('blocking', String(blockingCount > 0))
  setOutput('will-fail', String(willFail))
  setOutput('critical', String(counts.Critical))
  setOutput('high', String(counts.High))
  setOutput('medium', String(counts.Medium))

  if (willFail) {
    console.error(`::error title=License compliance::${blockingCount} blocking license finding(s).`)
    process.exit(1)
  }
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function findingRows (findings) {
  if (findings.length === 0) return ['| _none_ | | | | |']
  return findings
    .slice()
    .sort((a, b) => (SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]) ||
      String(a.name).localeCompare(String(b.name)))
    .map(f => {
      const status = f.status === 'allowlisted'
        ? 'allowlisted'
        : f.status === 'override'
          ? 'override (this PR)'
          : f.status === 'blocking'
            ? '**blocks**'
            : 'warn'
      return `| \`${f.name}@${f.version}\` | ${f.license} | ${f.scope} | ${f.severity} | ${status} |`
    })
}

function writeSummary (ctx) {
  const path = process.env.GITHUB_STEP_SUMMARY
  if (!path) return
  const lines = []
  lines.push('## License compliance')
  lines.push('')
  lines.push(ctx.warnOnly
    ? '_Running in **warn-only** (shadow) mode: findings are reported but do not block the merge._'
    : '_Enforcing mode: blocking findings fail the check._')
  lines.push('')
  lines.push(`Critical: ${ctx.counts.Critical} | High: ${ctx.counts.High} | Medium: ${ctx.counts.Medium}`)
  lines.push('')
  lines.push('| Dependency | License | Scope | Severity | Outcome |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const row of findingRows(ctx.findings)) lines.push(row)
  lines.push('')
  if (ctx.blockingCount > 0) {
    lines.push('Unresolved findings escalate to the compliance SKILL: run it, decide, and record the outcome in the exception allowlist. See docs/license-compliance-ci.md.')
  }
  fs.appendFileSync(path, lines.join('\n') + '\n')
}

function renderComment (ctx) {
  const marker = '<!-- license-compliance-summary -->'
  const lines = [marker]
  const title = ctx.blockingCount > 0
    ? (ctx.warnOnly ? 'License compliance — findings detected (warn-only)' : 'License compliance — blocking findings')
    : (ctx.findings.length > 0 ? 'License compliance — findings detected' : 'License compliance — clean')
  lines.push(`## ${title}`)
  lines.push('')
  if (ctx.findings.length === 0) {
    lines.push('No new dependency license findings in this PR.')
  } else {
    lines.push(`Critical: **${ctx.counts.Critical}** · High: **${ctx.counts.High}** · Medium: **${ctx.counts.Medium}**`)
    lines.push('')
    lines.push('| Dependency | License | Scope | Severity | Outcome |')
    lines.push('| --- | --- | --- | --- | --- |')
    for (const row of findingRows(ctx.findings)) lines.push(row)
    lines.push('')
    if (ctx.blockingCount > 0) {
      lines.push('**How to resolve a blocking finding:**')
      lines.push('- Remove or replace the disallowed dependency, or')
      lines.push('- If the license is genuinely acceptable, run the compliance SKILL and record the decision in `.github/license-allowlist.yml` (CODEOWNERS-reviewed), or')
      lines.push('- For a one-off, a maintainer can apply the `license-override` label (High findings only; Critical cannot be overridden).')
    }
  }
  if (ctx.warnOnly) {
    lines.push('')
    lines.push('_Warn-only (shadow) mode — this check does not block merges yet._')
  }
  lines.push('')
  lines.push('_Updated automatically by the canonical license compliance workflow._')
  return lines.join('\n')
}

function setOutput (key, value) {
  const path = process.env.GITHUB_OUTPUT
  if (!path) return
  fs.appendFileSync(path, `${key}=${value}\n`)
}

try {
  main()
} catch (err) {
  console.error(`::error title=license-policy::${err && err.message ? err.message : err}`)
  process.exit(2)
}
