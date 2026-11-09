import { newId, type FloorDoc, type PlanObject } from "@/features/home/model";
import { getTemplate, instantiateFloor, type TemplateKey } from "@/features/home/templates";

export type GuestAsset = {
  id: string;
  name: string;
  categoryId: string;
  brand: string;
  model: string;
  room: string;
  purchased: string;
  warranty: string;
  warrantyTone: "active" | "warning" | "none";
  maintenance: { title: string; due: string }[];
  service: { title: string; date: string; vendor: string }[];
  document: string | null;
  note?: string;
};

export type GuestHome = {
  version: 1;
  kind: "sample" | "own";
  name: string;
  templateKey: TemplateKey;
  propertyType: "hdb" | "condo" | "blank";
  doc: FloorDoc;
  assets: GuestAsset[];
  updatedAt: string;
};

export const GUEST_KEYS = {
  sample: "habitat.guest.sample.v1",
  own: "habitat.guest.home.v1",
  last: "habitat.guest.last.v1",
} as const;

const SAMPLE_ASSETS: GuestAsset[] = [
  {
    id: "sample-aircon-main",
    name: "Main bedroom aircon",
    categoryId: "air_conditioner",
    brand: "Daikin",
    model: "iSmile FTKM25",
    room: "Main bedroom",
    purchased: "18 Mar 2025",
    warranty: "18 Mar 2028",
    warrantyTone: "active",
    maintenance: [{ title: "Professional aircon servicing", due: "Due 18 Dec 2026" }, { title: "Clean air filter", due: "Due 9 Jan 2027" }],
    service: [{ title: "General servicing", date: "18 Sep 2026", vendor: "CoolBreeze Aircon" }],
    document: "Gain City receipt.pdf",
  },
  {
    id: "sample-washer",
    name: "Washing machine",
    categoryId: "washing_machine",
    brand: "LG",
    model: "FV1409S4W",
    room: "Service yard",
    purchased: "12 Dec 2024",
    warranty: "30 Nov 2026",
    warrantyTone: "warning",
    maintenance: [{ title: "Clean drum, seal and drain filter", due: "Due 13 Nov 2026" }, { title: "Book technician for spin noise", due: "Due 11 Nov 2026" }],
    service: [{ title: "Drain filter cleaned", date: "12 Oct 2026", vendor: "Household" }],
    document: "Harvey Norman receipt.pdf",
    note: "Making a loud noise during the spin cycle.",
  },
  {
    id: "sample-fridge",
    name: "Refrigerator",
    categoryId: "refrigerator",
    brand: "Samsung",
    model: "RT38CG6624S9",
    room: "Kitchen",
    purchased: "4 Sep 2025",
    warranty: "4 Sep 2028",
    warrantyTone: "active",
    maintenance: [{ title: "Clean condenser area", due: "Due 4 Mar 2027" }],
    service: [{ title: "Door gasket replaced", date: "4 Jun 2026", vendor: "Samsung service centre" }],
    document: "Courts receipt.pdf",
  },
];

function marker(assetId: string, x: number, y: number): PlanObject {
  return { id: newId(), kind: "asset", assetId, furnitureType: null, label: null, x: x - 22, y: y - 22, width: 44, height: 44, rotation: 0 };
}

export function createSampleGuestHome(): GuestHome {
  const template = getTemplate("hdb_4_room")!;
  const doc = instantiateFloor(template.floors[0]);
  doc.objects.push(
    marker("sample-aircon-main", 265, 95),
    marker("sample-washer", 455, 745),
    marker("sample-fridge", 575, 775),
  );
  return {
    version: 1,
    kind: "sample",
    name: "4-room HDB sample",
    templateKey: "hdb_4_room",
    propertyType: "hdb",
    doc,
    assets: SAMPLE_ASSETS.map((asset) => ({ ...asset, maintenance: [...asset.maintenance], service: [...asset.service] })),
    updatedAt: new Date().toISOString(),
  };
}

export function createOwnGuestHome(templateKey: TemplateKey, name = "My home"): GuestHome {
  const template = getTemplate(templateKey) ?? getTemplate("blank")!;
  const propertyType = templateKey.startsWith("hdb_") ? "hdb" : templateKey.startsWith("condo_") ? "condo" : "blank";
  return {
    version: 1,
    kind: "own",
    name: name.trim().slice(0, 60) || "My home",
    templateKey,
    propertyType,
    doc: instantiateFloor(template.floors[0]),
    assets: [],
    updatedAt: new Date().toISOString(),
  };
}

export function addGuestAsset(home: GuestHome, categoryId: string, at: { x: number; y: number }): GuestHome {
  const presets: Record<string, { name: string; brand: string; model: string }> = {
    air_conditioner: { name: "Air conditioner", brand: "", model: "" },
    washing_machine: { name: "Washing machine", brand: "", model: "" },
    refrigerator: { name: "Refrigerator", brand: "", model: "" },
  };
  const preset = presets[categoryId] ?? { name: "Appliance", brand: "", model: "" };
  const id = newId();
  const asset: GuestAsset = { id, ...preset, categoryId, room: "Not assigned", purchased: "Not recorded", warranty: "Not recorded", warrantyTone: "none", maintenance: [], service: [], document: null };
  return { ...home, assets: [...home.assets, asset], doc: { ...home.doc, objects: [...home.doc.objects, marker(id, at.x, at.y)] }, updatedAt: new Date().toISOString() };
}

export function isGuestHome(value: unknown): value is GuestHome {
  if (!value || typeof value !== "object") return false;
  const x = value as Partial<GuestHome>;
  return x.version === 1 && (x.kind === "sample" || x.kind === "own") && !!x.doc && Array.isArray(x.doc.rooms) && Array.isArray(x.doc.objects) && Array.isArray(x.assets);
}
