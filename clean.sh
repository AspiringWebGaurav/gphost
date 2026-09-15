#!/usr/bin/env bash
# ==============================================================================
# GPHosting - Project Cleanup Script
#
# Usage:
#   ./clean.sh           -> Standard Clean: removes .next, node_modules
#   ./clean.sh total     -> Total Clean: removes .next, node_modules, package-lock.json
#   source clean.sh      -> Enables direct 'clean' and 'total-clean' commands in your shell
# ==============================================================================

set -e

# If sourced in interactive bash terminal, export convenient shell functions
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  clean() {
    bash "${SCRIPT_DIR}/clean.sh" standard "$@"
  }
  total-clean() {
    bash "${SCRIPT_DIR}/clean.sh" total "$@"
  }
  total_clean() {
    bash "${SCRIPT_DIR}/clean.sh" total "$@"
  }
  echo -e "\033[1;32m✓ GPHosting Clean functions loaded!\033[0m"
  echo "  Type 'clean' to remove .next and node_modules"
  echo "  Type 'total-clean' to completely remove .next, node_modules, and package-lock.json"
  return 0 2>/dev/null || exit 0
fi

# Determine script root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "${SCRIPT_DIR}"

# Parse command line argument
PARAM="${1:-standard}"
SECOND_PARAM="${2:-}"

if [[ "$PARAM" == "total" || "$SECOND_PARAM" == "total" || "$PARAM" == "total clean" || "$*" == *"total"* ]]; then
  node "${SCRIPT_DIR}/scripts/clean.mjs" total "$@"
else
  node "${SCRIPT_DIR}/scripts/clean.mjs" standard "$@"
fi
