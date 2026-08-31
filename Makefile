.DEFAULT_GOAL := help

PORT = 8877

# ── Help ──────────────────────────────────────────────────────────────────────
.PHONY: help
help:
	@echo ""
	@echo "  make serve    Start dev server → http://localhost:$(PORT)"
	@echo "  make kill     Kill this project's HTTP server"
	@echo ""

# ── Dev server ────────────────────────────────────────────────────────────────
# scripts/serve.py is http.server plus Cache-Control: no-cache; a plain
# http.server sends only Last-Modified, so browsers keep stale ES modules after
# edits. Falls back to plain http.server outside the monorepo.
.PHONY: serve
serve:
	@echo "Serving → http://localhost:$(PORT)"
	@if [ -f ../../scripts/serve.py ]; then python3 ../../scripts/serve.py $(PORT); else python3 -m http.server $(PORT); fi

# ── Kill ──────────────────────────────────────────────────────────────────────
.PHONY: kill
kill:
	@lsof -ti :$(PORT) | xargs kill 2>/dev/null && echo "Stopped server on port $(PORT)" || echo "No server running on port $(PORT)"

# ── Corpus ────────────────────────────────────────────────────────────────────
# Validates data/ against CONTRACTS.md contract 1. Plain node, no npm install.
# Exits 0, or exits 1 naming the file, the record and the field.
#
# Two names, one target. CONTRACTS.md 1.12 and DESIGN.md both send readers to
# `make corpus`; the fleet Makefile convention is `make validate`. Both run the
# validator, so neither a frozen contract nor a fleet habit hits a missing rule.
.PHONY: validate corpus
validate:
	@node tools/validate-corpus.mjs

corpus: validate
