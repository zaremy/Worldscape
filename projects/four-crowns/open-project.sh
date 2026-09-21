#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
"${script_dir}/setup-local-references.sh" "${1:-${FOUR_CROWNS_REPO:-${script_dir}/../../../AIDungeon-develop}}"
node "${script_dir}/generate-industrial-import.mjs"
node "${script_dir}/validate-project.mjs"
source_map="${script_dir}/industrial/industrial-source-parity.tmx"
working_map="${script_dir}/industrial/industrial-working.tmx"
"${script_dir}/prepare-working-map.sh" "${source_map}" "${working_map}"

tiled_binary="${TILED:-}"
if [[ -z "${tiled_binary}" ]]; then
    if command -v tiled >/dev/null 2>&1; then
        tiled_binary="$(command -v tiled)"
    elif [[ -x /Applications/Tiled.app/Contents/MacOS/Tiled ]]; then
        tiled_binary="/Applications/Tiled.app/Contents/MacOS/Tiled"
    else
        echo "Tiled was not found. Install it or set TILED to its executable path." >&2
        exit 1
    fi
fi

exec "${tiled_binary}" \
    --project "${script_dir}/four-crowns.tiled-project" \
    "${working_map}"
