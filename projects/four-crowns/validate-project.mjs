#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectDir = dirname(fileURLToPath(import.meta.url));
const mapPath = join(projectDir, "industrial", "industrial-source-parity.tmx");
const projectPath = join(projectDir, "four-crowns.tiled-project");
const manifest = JSON.parse(readFileSync(join(projectDir, "references.json"), "utf8"));
const references = join(projectDir, ".local", "references");
const source = JSON.parse(readFileSync(join(references, "industrial-layout.json"), "utf8"));
const districtManifest = JSON.parse(readFileSync(join(references, "industrial-district-manifest.json"), "utf8"));
const mineManifest = JSON.parse(readFileSync(join(references, "industrial-mine-manifest.json"), "utf8"));
const cottageManifest = JSON.parse(readFileSync(join(references, "industrial-cottage-manifest.json"), "utf8"));
const tempDir = mkdtempSync(join(tmpdir(), "worldscape-four-crowns-"));
const exportedPath = join(tempDir, "industrial.tmj");
const movedPath = join(tempDir, "industrial-moved.tmj");
const reopenedPath = join(tempDir, "industrial-moved-reopened.tmj");
const generatedDir = join(tempDir, "generated-industrial");
const workingMapPath = join(tempDir, "industrial-working.tmx");
process.on("exit", () => rmSync(tempDir, { recursive: true, force: true }));

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
}

function allLayers(layers) {
  return layers.flatMap((layer) => [layer, ...(layer.layers ? allLayers(layer.layers) : [])]);
}

function allObjects(map) {
  return allLayers(map.layers).flatMap((layer) => layer.objects ?? []);
}

function property(object, name) {
  return object?.properties?.find((entry) => entry.name === name)?.value;
}

function close(actual, expected, message) {
  assert(Math.abs(actual - expected) < 1e-8, `${message}: expected ${expected}, got ${actual}`);
}

function absolutePolyline(object) {
  return object?.polyline?.map((point) => [point.x + object.x, point.y + object.y]);
}

function polygon(object) {
  return object?.polygon?.map((point) => [point.x + object.x, point.y + object.y]);
}

function placement(site) {
  if (site.id === "mine") return { scale: site.width / mineManifest.referenceWidth, width: mineManifest.frameSize[0], height: mineManifest.frameSize[1], anchor: mineManifest.anchor };
  if (site.id === "cottage") {
    const layer = cottageManifest.layers.find((candidate) => candidate.id === "building-neutral");
    return { scale: cottageManifest.placement.scale, width: layer.size.w, height: layer.size.h, anchor: [cottageManifest.pivot.x - layer.origin.x, cottageManifest.pivot.y - layer.origin.y] };
  }
  const registered = districtManifest.sites.find((candidate) => candidate.id === site.id);
  return { scale: registered.scale * site.width / registered.width, width: districtManifest.frame.w, height: districtManifest.frame.h, anchor: [registered.anchor.x * districtManifest.frame.w, registered.anchor.y * districtManifest.frame.h] };
}

function findById(objects, id) {
  const found = objects.find((entry) => property(entry, "worldscape_id") === id);
  assert(found, `missing semantic object: ${id}`);
  return found;
}

function validateMap(map) {
  assert.equal(map.width * map.tilewidth, source.map.width, "Industrial width must match Four Crowns");
  assert.equal(map.height * map.tileheight, source.map.height, "Industrial height must match Four Crowns");
  const layers = allLayers(map.layers);
  for (const name of ["00 Exact Four Crowns blockout", "10 Building placements — drag these", "20 Site reservations", "30 Routes — exact source geometry", "40 Topography — exact source geometry", "45 Detailed source geometry", "50 Sockets"]) {
    assert(layers.some((layer) => layer.name === name), `missing Industrial fidelity layer: ${name}`);
  }

  const objects = allObjects(map);
  const ids = objects.map((entry) => property(entry, "worldscape_id"));
  assert(ids.every(Boolean), "every Industrial semantic object must have a worldscape_id");
  assert.equal(new Set(ids).size, ids.length, "Industrial worldscape_id values must be unique");

  for (const route of source.routes) {
    const imported = findById(objects, `route.industrial.${route.id}`);
    assert.deepEqual(absolutePolyline(imported), route.points, `route geometry drifted: ${route.id}`);
    assert.equal(property(imported, "corridor_width"), route.width, `route width drifted: ${route.id}`);
  }
  for (const form of source.landforms) {
    const imported = findById(objects, `landform.industrial.${form.id}`);
    assert.deepEqual(polygon(imported), form.polygon, `landform geometry drifted: ${form.id}`);
    assert.equal(property(imported, "material"), form.material, `landform material drifted: ${form.id}`);
  }
  assert.deepEqual(polygon(findById(objects, "water.industrial.river")), source.river, "river geometry drifted");

  for (const site of source.sites) {
    const building = findById(objects, `site.industrial.${site.id}`);
    assert.deepEqual([property(building, "source_x"), property(building, "source_y")], [site.x, site.y], `source anchor drifted: ${site.id}`);
    const expected = placement(site), width = expected.width * expected.scale, height = expected.height * expected.scale;
    close(building.width, width, `${site.id} width drifted`);
    close(building.height, height, `${site.id} height drifted`);
    close(building.x + expected.anchor[0] * expected.scale, site.x, `${site.id} ground x drifted`);
    close(building.y - (height - expected.anchor[1] * expected.scale), site.y, `${site.id} ground y drifted`);
    const reservation = findById(objects, `reservation.industrial.${site.id}`);
    assert.equal(property(reservation, "reservation_not_footprint"), true, `${site.id} reservation flag must be boolean true`);
    assert.deepEqual(polygon(reservation), site.footprint, `reservation drifted: ${site.id}`);
    for (const kind of ["entrance", "loading", "work"]) if (site[kind]) {
      const socket = findById(objects, `socket.industrial.${site.id}.${kind}`);
      assert.deepEqual([socket.x, socket.y], site[kind], `socket drifted: ${site.id}.${kind}`);
    }
  }

  for (const bridge of source.bridges) {
    const imported = findById(objects, `bridge.industrial.${bridge.id}`);
    assert.deepEqual(absolutePolyline(imported), [bridge.start, bridge.end], `bridge geometry drifted: ${bridge.id}`);
    assert.equal(property(imported, "corridor_width"), bridge.width, `bridge width drifted: ${bridge.id}`);
  }
  for (const crossing of source.crossings) {
    const imported = findById(objects, `crossing.industrial.${crossing.id}`);
    assert.deepEqual([imported.x, imported.y], crossing.point, `crossing drifted: ${crossing.id}`);
  }
  for (const [id, expected] of [
    ["workarea.industrial.mine-apron", source.mineAssembly.apron],
    ["landform-detail.industrial.mine-cliff-face", source.mineAssembly.cliffFace],
    ["landform-detail.industrial.mine-cliff-crown", source.mineAssembly.cliffCrown],
    ["workarea.industrial.quarry-bench", source.quarryBench],
    ["workarea.industrial.cottage-pen", source.pen.polygon],
  ]) assert.deepEqual(polygon(findById(objects, id)), expected, `${id} geometry drifted`);
  assert.deepEqual(absolutePolyline(findById(objects, "route-detail.industrial.mine-service")), source.mineAssembly.servicePath, "mine service path drifted");
  assert.deepEqual([findById(objects, "socket.industrial.mine.stock").x, findById(objects, "socket.industrial.mine.stock").y], source.mineAssembly.stock, "mine stock socket drifted");
  assert.deepEqual([findById(objects, "socket.industrial.mine.timber").x, findById(objects, "socket.industrial.mine.timber").y], source.mineAssembly.timber, "mine timber socket drifted");
  assert.deepEqual([findById(objects, "socket.industrial.cottage.pen-gate").x, findById(objects, "socket.industrial.cottage.pen-gate").y], source.pen.gate, "pen gate drifted");
  source.pen.residents.forEach((resident, index) => {
    const imported = findById(objects, `resident.industrial.cottage-pen.${index + 1}`);
    assert.deepEqual([imported.x, imported.y], resident, `pen resident ${index + 1} drifted`);
  });

  assert.equal(layers.find((layer) => layer.name === "10 Building placements — drag these")?.visible, true, "buildings must start visible");
  assert.equal(layers.find((layer) => layer.name === "20 Site reservations")?.visible, false, "reservations must start hidden");
}

for (const reference of manifest.references) {
  const localPath = join(references, reference.localName);
  const digest = createHash("sha256").update(readFileSync(realpathSync(localPath))).digest("hex");
  assert.equal(digest, reference.sha256, `reference hash changed: ${reference.id}`);
}

run(process.execPath, [join(projectDir, "generate-industrial-import.mjs"), generatedDir]);
for (const filename of ["industrial-blockout-base.svg", "industrial-source-parity.tmx"]) {
  assert.equal(readFileSync(join(generatedDir, filename), "utf8"), readFileSync(join(projectDir, "industrial", filename), "utf8"), `committed generated artifact is stale: ${filename}`);
}

const tiledBinary = process.env.TILED ?? (existsSync("/Applications/Tiled.app/Contents/MacOS/Tiled")
  ? "/Applications/Tiled.app/Contents/MacOS/Tiled"
  : "tiled");
run(tiledBinary, ["--project", projectPath, "--export-map", mapPath, exportedPath]);
const exported = JSON.parse(readFileSync(exportedPath, "utf8"));
validateMap(exported);

const moved = structuredClone(exported);
const buildingLayer = allLayers(moved.layers).find((layer) => layer.name === "10 Building placements — drag these");
const quarry = findById(buildingLayer.objects, "site.industrial.quarry");
quarry.x += 17;
quarry.y -= 9;
writeFileSync(movedPath, JSON.stringify(moved));
run(tiledBinary, ["--export-map", movedPath, reopenedPath]);
const reopenedQuarry = findById(allObjects(JSON.parse(readFileSync(reopenedPath, "utf8"))), "site.industrial.quarry");
assert.deepEqual([reopenedQuarry.x, reopenedQuarry.y], [quarry.x, quarry.y], "moved building did not survive save/reopen");

run(join(projectDir, "prepare-working-map.sh"), [mapPath, workingMapPath]);
const editedWorkingMap = readFileSync(workingMapPath, "utf8").replace("Khorinis_Industrial", "Khorinis_Industrial_Edited");
writeFileSync(workingMapPath, editedWorkingMap);
run(join(projectDir, "prepare-working-map.sh"), [mapPath, workingMapPath]);
assert.equal(readFileSync(workingMapPath, "utf8"), editedWorkingMap, "reopen preparation overwrote the editable working map");

const rasterizer = process.env.TMXRASTERIZER ?? "/Applications/Tiled.app/Contents/MacOS/tmxrasterizer";
if (existsSync(rasterizer)) {
  const rendered = join(tempDir, "industrial-source-parity.png");
  run(rasterizer, ["--scale", "1", mapPath, rendered]);
  assert.deepEqual(readFileSync(rendered), readFileSync(join(projectDir, "evidence", "industrial-source-parity.png")), "acceptance render is stale");
} else console.log("SKIP: set TMXRASTERIZER to verify the native acceptance render on this platform.");

const broken = structuredClone(exported);
broken.layers = broken.layers.filter((layer) => layer.name !== "45 Detailed source geometry");
assert.throws(() => validateMap(broken), /missing Industrial fidelity layer/, "negative control did not reject missing source geometry");
const shifted = structuredClone(exported);
const shiftedCrossing = findById(allObjects(shifted), `crossing.industrial.${source.crossings[0].id}`);
shiftedCrossing.x += 1;
assert.throws(() => validateMap(shifted), /crossing drifted/, "negative control did not reject shifted geometry");

console.log("PASS: Industrial map matches all Four Crowns source geometry and registration manifests.");
console.log("PASS: Generated artifacts are current; moved and reopened working-map edits persist.");
console.log(`PASS: ${manifest.references.length} external source hashes match; negative control fires.`);
