# Fidelity evidence

`industrial-source-parity.png` is the current acceptance image. It is a native
Tiled raster export of the generated Industrial benchmark. Compare it directly
with the Four Crowns blockout: terrain, water, clearings, routes, bridges, rail,
building anchors and building scale all come from the same source contract.

Regenerate the acceptance image on macOS with:

```sh
/Applications/Tiled.app/Contents/MacOS/tmxrasterizer \
  --scale 1 \
  projects/four-crowns/industrial/industrial-source-parity.tmx \
  projects/four-crowns/evidence/industrial-source-parity.png
```

Set `TMXRASTERIZER` to the executable path on another platform. Validation
regenerates and byte-compares the PNG when that executable is available.

The initial Harbor overlay was rejected because generic geometry over a faded
painting was visibly less useful and less accurate than the Four Crowns proof.
Issue #4 records that failed direction; it is intentionally absent here.
