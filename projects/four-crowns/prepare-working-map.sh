#!/usr/bin/env bash
set -euo pipefail

source_map="$1"
working_map="$2"

if [[ ! -f "${working_map}" ]]; then
    cp "${source_map}" "${working_map}"
    echo "Created editable working map: ${working_map}"
fi
