#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(readFileSync(join(root, ".local/references/industrial-layout.json"), "utf8"));
const districtManifest = JSON.parse(readFileSync(join(root, ".local/references/industrial-district-manifest.json"), "utf8"));
const mineManifest = JSON.parse(readFileSync(join(root, ".local/references/industrial-mine-manifest.json"), "utf8"));
const cottageManifest = JSON.parse(readFileSync(join(root, ".local/references/industrial-cottage-manifest.json"), "utf8"));
const out = process.argv[2] ? resolve(process.argv[2]) : join(root, "industrial");
mkdirSync(out, { recursive: true });

const colors = {
  ground: "#81897a", rock: "#9ea9a7", forest: "#385c4e", river: "#426e86",
  yard: "#959585", cottage: "#8e9974", road: "#c0baa2", path: "#b1b498",
};
const points = (value) => value.map(([x, y]) => `${x},${y}`).join(" ");
const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
const prop = (name, value, type = typeof value === "boolean" ? "bool" : typeof value === "number" ? (Number.isInteger(value) ? "int" : "float") : "") => `<property name="${esc(name)}"${type ? ` type="${type}"` : ""} value="${esc(value)}"/>`;
const properties = (values) => `<properties>${Object.entries(values).map(([name, value]) => prop(name, value)).join("")}</properties>`;

function routeLength(route) {
  return route.points.slice(1).reduce((sum, b, index) => sum + Math.hypot(b[0] - route.points[index][0], b[1] - route.points[index][1]), 0);
}

function sample(route, distance) {
  let remaining = Math.max(0, distance);
  for (let index = 1; index < route.points.length; index += 1) {
    const a = route.points[index - 1], b = route.points[index];
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (!length) continue;
    if (remaining <= length || index === route.points.length - 1) {
      const t = Math.min(1, remaining / length);
      return { x: a[0] + dx * t, y: a[1] + dy * t, dx: dx / length, dy: dy / length };
    }
    remaining -= length;
  }
  throw new Error("route contains no segment");
}

const rail = source.routes.find((route) => route.kind === "rail");
const railLength = routeLength(rail);
const sleepers = [];
for (let distance = 0; distance < railLength; distance += 11) {
  const p = sample(rail, distance), offset = rail.width / 2 + 3;
  sleepers.push(`<line x1="${p.x - p.dy * offset}" y1="${p.y + p.dx * offset}" x2="${p.x + p.dy * offset}" y2="${p.y - p.dx * offset}"/>`);
}
const railEdges = [-1, 1].map((side) => {
  const edge = [];
  for (let distance = 0; distance <= railLength; distance += 2) {
    const p = sample(rail, distance);
    edge.push([p.x - p.dy * rail.width / 2 * side, p.y + p.dx * rail.width / 2 * side]);
  }
  return `<polyline points="${points(edge)}"/>`;
});

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024">
 <rect width="1536" height="1024" fill="${colors.ground}"/>
 <g>${source.landforms.map((form) => `<polygon points="${points(form.polygon)}" fill="${form.material === "rock" ? colors.rock : colors.forest}"/>`).join("")}</g>
 <polygon points="${points(source.river)}" fill="${colors.river}"/>
 <g>${source.sites.map((site) => `<polygon points="${points(site.id === "mine" ? source.mineAssembly.apron : site.footprint)}" fill="${site.id === "cottage" ? colors.cottage : colors.yard}"/>`).join("")}</g>
 <polygon points="${points(source.mineAssembly.cliffFace)}" fill="#657775"/>
 <polygon points="${points(source.mineAssembly.cliffCrown)}" fill="#adb7ac"/>
 <polygon points="${points(source.quarryBench)}" fill="#667b7b"/>
 <polyline points="${points(source.quarryBench.slice(0, 4))}" fill="none" stroke="#c4cfca" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
 <polygon points="${points(source.pen.polygon)}" fill="#526b49"/>
 <g fill="none" stroke-linecap="round" stroke-linejoin="round">
  ${source.routes.filter((route) => route.kind !== "rail").map((route) => `<polyline points="${points(route.points)}" stroke="${route.kind === "path" ? colors.path : colors.road}" stroke-width="${route.width}"/>`).join("")}
  <polyline points="${points(source.mineAssembly.servicePath)}" stroke="${colors.path}" stroke-width="5"/>
  ${source.bridges.map((bridge) => `<line x1="${bridge.start[0]}" y1="${bridge.start[1]}" x2="${bridge.end[0]}" y2="${bridge.end[1]}" stroke="#424e4c" stroke-width="${bridge.width + 7}"/><line x1="${bridge.start[0]}" y1="${bridge.start[1]}" x2="${bridge.end[0]}" y2="${bridge.end[1]}" stroke="#a9a99a" stroke-width="${bridge.width}"/>`).join("")}
  <polyline points="${points(rail.points)}" stroke="#6a736b" stroke-width="${rail.width + 12}"/>
 </g>
 <g>${source.crossings.map((crossing) => { const [x, y] = crossing.point; return `<polygon points="${points([[x-20,y-15],[x+22,y+6],[x+17,y+17],[x-25,y-4]])}" fill="#b0ac94"/>`; }).join("")}</g>
 <g fill="none" stroke="#46473f" stroke-width="2.5">${sleepers.join("")}</g>
 <g fill="none" stroke-linecap="round" stroke-linejoin="round">
  <g stroke="#313d41" stroke-width="2.2">${railEdges.join("")}</g>
  <g stroke="#adb8b4" stroke-width="0.8">${railEdges.join("")}</g>
 </g>
</svg>`;
writeFileSync(join(out, "industrial-blockout-base.svg"), svg);

let nextObjectId = 1;
const object = (attrs, body = "") => `<object id="${nextObjectId++}" ${attrs}>${body}</object>`;
const polygonObject = (name, type, polygon, values = {}) => object(
  `name="${esc(name)}" type="${type}" x="0" y="0"`,
  `${properties(values)}<polygon points="${points(polygon)}"/>`,
);
const routeObject = (route) => object(
  `name="${esc(route.id)}" type="Route" x="${route.points[0][0]}" y="${route.points[0][1]}"`,
  `${properties({ worldscape_id: `route.industrial.${route.id}`, route_kind: route.kind, corridor_width: route.width, source: "Four Crowns exact" })}<polyline points="${points(route.points.map(([x, y]) => [x - route.points[0][0], y - route.points[0][1]]))}"/>`,
);
const pointObject = (name, type, [x, y], values) => object(`name="${esc(name)}" type="${type}" x="${x}" y="${y}"`, `${properties(values)}<point/>`);
const lineObject = (name, type, linePoints, values) => object(
  `name="${esc(name)}" type="${type}" x="${linePoints[0][0]}" y="${linePoints[0][1]}"`,
  `${properties(values)}<polyline points="${points(linePoints.map(([x, y]) => [x - linePoints[0][0], y - linePoints[0][1]]))}"/>`,
);

const tileBySite = { mine: 1, quarry: 2, logging: 3, foundry: 4, cottage: 5 };
function imagePlacement(site) {
  if (site.id === "mine") return { scale: site.width / mineManifest.referenceWidth, width: mineManifest.frameSize[0], height: mineManifest.frameSize[1], anchor: mineManifest.anchor };
  if (site.id === "cottage") {
    const layer = cottageManifest.layers.find((candidate) => candidate.id === "building-neutral");
    return { scale: cottageManifest.placement.scale, width: layer.size.w, height: layer.size.h, anchor: [cottageManifest.pivot.x - layer.origin.x, cottageManifest.pivot.y - layer.origin.y] };
  }
  const registered = districtManifest.sites.find((candidate) => candidate.id === site.id);
  return { scale: registered.scale * site.width / registered.width, width: districtManifest.frame.w, height: districtManifest.frame.h, anchor: [registered.anchor.x * districtManifest.frame.w, registered.anchor.y * districtManifest.frame.h] };
}
const buildingObject = (site) => {
  const p = imagePlacement(site), width = p.width * p.scale, height = p.height * p.scale;
  const x = site.x - p.anchor[0] * p.scale;
  const y = site.y + (p.height - p.anchor[1]) * p.scale;
  return object(
    `name="${esc(site.label)}" type="Building" gid="${tileBySite[site.id]}" x="${x}" y="${y}" width="${width}" height="${height}"`,
    properties({ worldscape_id: `site.industrial.${site.id}`, source_x: site.x, source_y: site.y, delivery_status: "source-parity" }),
  );
};

const layers = [
  `<imagelayer id="1" name="00 Exact Four Crowns blockout" locked="1"><image source="industrial-blockout-base.svg" width="1536" height="1024"/></imagelayer>`,
  `<objectgroup id="2" name="10 Building placements — drag these" color="#f4d03f">${source.sites.map(buildingObject).join("")}</objectgroup>`,
  `<objectgroup id="3" name="20 Site reservations" color="#f4d03f" opacity="0.7" visible="0">${source.sites.map((site) => polygonObject(`${site.label} reservation`, "SiteReservation", site.footprint, { worldscape_id: `reservation.industrial.${site.id}`, reservation_not_footprint: true })).join("")}</objectgroup>`,
  `<objectgroup id="4" name="30 Routes — exact source geometry" color="#f8f4dd" visible="0">${source.routes.map(routeObject).join("")}</objectgroup>`,
  `<objectgroup id="5" name="40 Topography — exact source geometry" color="#48c9b0" visible="0">${source.landforms.map((form) => polygonObject(form.id, "Landform", form.polygon, { worldscape_id: `landform.industrial.${form.id}`, material: form.material })).join("")}${polygonObject("river", "Water", source.river, { worldscape_id: "water.industrial.river" })}</objectgroup>`,
  `<objectgroup id="6" name="45 Detailed source geometry" color="#ec7063" visible="0">${source.bridges.map((bridge) => lineObject(bridge.id, "Bridge", [bridge.start, bridge.end], { worldscape_id: `bridge.industrial.${bridge.id}`, route_id: bridge.route, corridor_width: bridge.width })).join("")}${source.crossings.map((crossing) => pointObject(crossing.id, "Crossing", crossing.point, { worldscape_id: `crossing.industrial.${crossing.id}`, crossing_kind: crossing.kind, priority: crossing.priority })).join("")}${polygonObject("mine apron", "WorkArea", source.mineAssembly.apron, { worldscape_id: "workarea.industrial.mine-apron" })}${polygonObject("mine cliff face", "LandformDetail", source.mineAssembly.cliffFace, { worldscape_id: "landform-detail.industrial.mine-cliff-face" })}${polygonObject("mine cliff crown", "LandformDetail", source.mineAssembly.cliffCrown, { worldscape_id: "landform-detail.industrial.mine-cliff-crown" })}${lineObject("mine service path", "RouteDetail", source.mineAssembly.servicePath, { worldscape_id: "route-detail.industrial.mine-service", corridor_width: 5 })}${pointObject("mine stock", "Socket", source.mineAssembly.stock, { worldscape_id: "socket.industrial.mine.stock" })}${pointObject("mine timber", "Socket", source.mineAssembly.timber, { worldscape_id: "socket.industrial.mine.timber" })}${polygonObject("quarry bench", "WorkArea", source.quarryBench, { worldscape_id: "workarea.industrial.quarry-bench" })}${polygonObject("cottage pen", "WorkArea", source.pen.polygon, { worldscape_id: "workarea.industrial.cottage-pen" })}${pointObject("cottage pen gate", "Socket", source.pen.gate, { worldscape_id: "socket.industrial.cottage.pen-gate" })}${source.pen.residents.map((resident, index) => pointObject(`pen resident ${index + 1}`, "Resident", resident, { worldscape_id: `resident.industrial.cottage-pen.${index + 1}` })).join("")}</objectgroup>`,
  `<objectgroup id="7" name="50 Sockets" color="#ffffff" visible="0">${source.sites.flatMap((site) => [["entrance", site.entrance], ["loading", site.loading], ["work", site.work]].filter(([, value]) => value).map(([kind, [x, y]]) => object(`name="${esc(`${site.id}.${kind}`)}" type="Socket" x="${x}" y="${y}"`, `${properties({ worldscape_id: `socket.industrial.${site.id}.${kind}`, socket_kind: kind })}<point/>`))).join("")}</objectgroup>`,
];

const tmx = `<?xml version="1.0" encoding="UTF-8"?>
<map version="1.12" tiledversion="1.12.2" orientation="orthogonal" renderorder="right-down" width="48" height="32" tilewidth="32" tileheight="32" infinite="0" backgroundcolor="#81897a" nextlayerid="8" nextobjectid="${nextObjectId}">
 <properties>${prop("district_id", "Khorinis_Industrial")}${prop("import_source", "Four Crowns khorinis-district-layout-v2.json")}${prop("worldscape_schema", "four-crowns-source-parity-v0")}${prop("fidelity_role", "golden benchmark before Harbor authoring")}</properties>
 <tileset firstgid="1" source="../industrial-assets.tsx"/>
 ${layers.join("\n ")}
</map>`;
writeFileSync(join(out, "industrial-source-parity.tmx"), tmx);
console.log("Generated industrial/industrial-source-parity.tmx from the exact Four Crowns layout source.");
