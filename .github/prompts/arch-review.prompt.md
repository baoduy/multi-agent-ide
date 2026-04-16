---
description: "Launch a full architecture, security, and code quality review of the codebase. Audits Electron security, OWASP Top 10, class-first OOP compliance, IPC contracts, Zustand store discipline, and dead code cleanup."
name: "arch-review"
agent: "arch.review"
argument-hint: "Optional: scope the review — e.g. 'security only', 'daemon package', 'dead code cleanup', or leave blank for a full review"
---

Run a full review of this codebase using the Arch Review agent.

{% if args %}
**Scope requested**: {{ args }}
{% else %}
**Scope**: Full review — architecture, security, code quality, and dead code cleanup.
{% endif %}

Perform all applicable review categories for the scope above:
1. **Architecture** — OOP compliance, IPC adapter thinness, store discipline, `flush()` after DB writes
2. **Security** — Electron hardening (contextIsolation, nodeIntegration, CSP, preload surface), OWASP Top 10
3. **Code Quality** — unused imports, dead exports, unrendered components, duplicate utilities
4. **Cleanup** — orphaned `package.json` dependencies, commented-out code, legacy stubs

Produce a severity-coded report (🔴 Critical / 🟡 Warning / 🟢 Suggestion) with file paths and concrete fixes. End with a Summary listing total findings and top 3 recommended actions.
