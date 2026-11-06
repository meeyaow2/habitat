"use client";

import { AirVent, Armchair, CircleDot, CookingPot, Droplets, Fan, Flame, GlassWater, Heater, Lamp, Laptop, Microwave, Package, Refrigerator, Router, Tv, WashingMachine, Wind, type IconNode } from "lucide";

/** Lucide icon nodes, rendered to images for use on the Konva canvas. */
const NODES: Record<string, IconNode> = {
  "air-vent": AirVent,
  refrigerator: Refrigerator,
  "washing-machine": WashingMachine,
  wind: Wind,
  tv: Tv,
  heater: Heater,
  fan: Fan,
  "cooking-pot": CookingPot,
  microwave: Microwave,
  droplets: Droplets,
  flame: Flame,
  "glass-water": GlassWater,
  "circle-dot": CircleDot,
  laptop: Laptop,
  router: Router,
  lamp: Lamp,
  armchair: Armchair,
  package: Package,
};

const cache = new Map<string, HTMLImageElement>();

function toSvg(node: IconNode, colour: string): string {
  const children = node
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${String(v)}"`).join(" ")}/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${colour}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`;
}

export function iconImage(icon: string, colour: string, onLoad: () => void): HTMLImageElement {
  const key = `${icon}:${colour}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const img = new window.Image();
  img.onload = onLoad;
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(toSvg(NODES[icon] ?? Package, colour))}`;
  cache.set(key, img);
  return img;
}
