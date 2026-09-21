# Four Crowns project

This project is the first Worldscape dogfood case. It imports the existing Four
Crowns Industrial blockout as the fidelity gate for deciding whether Harbor
authoring should continue in Tiled.

Four Crowns source data and art remain in their original repository. Worldscape
uses ignored, hash-checked symlinks and generates its Industrial Tiled map from
the authoritative layout JSON.

## Open it

From the Worldscape repository root:

```sh
projects/four-crowns/open-project.sh
```

The script expects Four Crowns at `../AIDungeon-develop`. Pass another checkout
path as its first argument or set `FOUR_CROWNS_REPO` when needed:

```sh
projects/four-crowns/open-project.sh /path/to/AIDungeon-develop
```

The launcher finds either the `tiled` command or the standard macOS app bundle.
Set `TILED=/path/to/Tiled` for another installation.

To regenerate the Industrial import and validate without opening the editor:

```sh
projects/four-crowns/setup-local-references.sh
node projects/four-crowns/generate-industrial-import.mjs
node projects/four-crowns/validate-project.mjs
```

## Fidelity gate

`industrial/industrial-source-parity.tmx` is the immutable generated baseline.
`open-project.sh` creates an ignored `industrial-working.tmx` once and opens that
editable copy on every later run, so saved drag and layer edits survive reopen.
The baseline's flat terrain, river, clearings, roads, bridges and rails come from the exact source
used by `/spritesheet-proof`. Its real building sprites retain the same ground
anchors and scale, and are individually draggable in Tiled. Reservations,
routes, topography and sockets are separate toggleable semantic layers.

This benchmark decides whether the Tiled route is worth continuing. Harbor
authoring should not advance if edits cannot preserve this level of spatial
fidelity or if the interaction remains materially worse than the existing proof.

The rejected first Harbor overlay is documented on issue #4, not retained as a
map fixture. Its generic geometry and false task contacts should not become a
template. Harbor resumes only after this parity map proves the editing workflow.

To reset local edits, delete `industrial/industrial-working.tmx` and run
`open-project.sh` again. The launcher creates a fresh copy of the baseline.

Reference provenance and frozen hashes are in `references.json`.
