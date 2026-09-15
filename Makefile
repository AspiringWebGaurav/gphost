# ==============================================================================
# GPHosting - Project Automation Makefile
# ==============================================================================

.PHONY: help clean total-clean total

help:
	@echo "GPHosting Cleanup Commands:"
	@echo "  make clean        - Strictly removes .next and node_modules"
	@echo "  make total-clean  - Strictly removes .next, node_modules, and package-lock.json"
	@echo "  make total        - Shortcut alias for make total-clean"

clean:
	@node scripts/clean.mjs standard

total-clean:
	@node scripts/clean.mjs total

total: total-clean
