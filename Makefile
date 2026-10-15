.PHONY: accept accept-deadfin test build dev

accept:
	bash e2e/harness/accept.sh

# The parity probe: same suite vs a pinned deadfin image. Failures here are
# server findings, not client merge blockers.
accept-deadfin:
	ACCEPT_TARGET=deadfin bash e2e/harness/accept.sh

test:
	npm test

build:
	npm run build

dev:
	npm run dev
