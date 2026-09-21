#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
four_crowns_repo="${1:-${FOUR_CROWNS_REPO:-${script_dir}/../../../AIDungeon-develop}}"

if [[ ! -d "${four_crowns_repo}/experiments/map_art" ]]; then
    echo "Four Crowns checkout not found at: ${four_crowns_repo}" >&2
    echo "Pass its path as the first argument or set FOUR_CROWNS_REPO." >&2
    exit 1
fi

four_crowns_repo="$(cd "${four_crowns_repo}" && pwd -P)"
reference_dir="${script_dir}/.local/references"
mkdir -p "${reference_dir}"

link_reference() {
    local source_path="$1"
    local local_name="$2"
    local expected_hash="$3"
    if [[ "${local_name}" != "$(basename "${local_name}")" || "${local_name}" == "." || "${local_name}" == ".." ]]; then
        echo "Unsafe local reference name: ${local_name}" >&2
        exit 1
    fi

    local absolute_source="${four_crowns_repo}/${source_path}"

    if [[ ! -f "${absolute_source}" ]]; then
        echo "Missing Four Crowns reference: ${absolute_source}" >&2
        exit 1
    fi

    absolute_source="$(realpath "${absolute_source}")"
    case "${absolute_source}" in
        "${four_crowns_repo}"/*) ;;
        *)
            echo "Reference escapes Four Crowns checkout: ${source_path}" >&2
            exit 1
            ;;
    esac

    local actual_hash
    actual_hash="$(shasum -a 256 "${absolute_source}" | awk '{print $1}')"
    if [[ "${actual_hash}" != "${expected_hash}" ]]; then
        echo "Reference hash changed: ${source_path}" >&2
        echo "expected ${expected_hash}" >&2
        echo "actual   ${actual_hash}" >&2
        exit 1
    fi

    ln -sfn "${absolute_source}" "${reference_dir}/${local_name}"
}

while IFS=$'\t' read -r source_path local_name expected_hash; do
    link_reference "${source_path}" "${local_name}" "${expected_hash}"
done < <(node -e '
const manifest = require(process.argv[1]);
for (const reference of manifest.references) {
  process.stdout.write([reference.source, reference.localName, reference.sha256].join("\t") + "\n");
}
' "${script_dir}/references.json")

echo "Prepared Four Crowns references in ${reference_dir}"
