import "server-only";
import type { Tx } from "@/lib/db";
import { addDays, addInterval, todayIn } from "@/lib/domain/dates";
import { createAsset } from "@/features/assets/server";
import { createTask, completeTask, recordEvent } from "@/features/maintenance/server";
import { applyTemplate, createProperty, getFloors, loadFloorDoc, saveFloorDoc } from "@/features/home/server";
import { roomAt, type PlanObject } from "@/features/home/model";
import { assetSchema } from "@/lib/validation/schemas";

/**
 * Sample household used by demo mode and `npm run db:seed`. Created through
 * the same RLS-scoped services the app uses. All data is fictional.
 */
export async function seedDemoHousehold(tx: Tx, userId: string, opts: { name?: string; demo?: boolean } = {}) {
  const today = todayIn("Asia/Singapore");
  const d = (days: number) => addDays(today, days);
  const m = (months: number) => addInterval(today, months, "month");

  const [{ create_household: householdId }] = await tx<{ create_household: string }[]>`
    select public.create_household(${opts.name ?? "The Tan household"}, 'SGD', 'en-SG')
  `;
  const actor = { householdId, userId, currency: "SGD" };

  const propertyId = await createProperty(tx, householdId, { name: "Punggol flat", propertyType: "hdb", hdbFlatType: "4_room" });
  await applyTemplate(tx, householdId, propertyId, "hdb_4_room");
  const [floor] = await getFloors(tx, propertyId);
  const doc = await loadFloorDoc(tx, floor.id);
  const roomId = (name: string) => doc.rooms.find((r) => r.name === name)?.id ?? null;

  const items = [
    { name: "Living room aircon", categoryId: "air_conditioner", brand: "Daikin", model: "iSmile FTKM35", room: "Living room", purchaseDate: m(-26), purchasePrice: "1180", vendor: "Gain City", warrantyExpiresOn: m(10), warrantyStartsOn: m(-26), warrantyKind: "manufacturer", warrantyProvider: "Daikin (compressor)", pos: { dx: 205, dy: -150 } },
    { name: "Master bedroom aircon", categoryId: "air_conditioner", brand: "Daikin", model: "iSmile FTKM25", room: "Master bedroom", purchaseDate: m(-26), purchasePrice: "860", vendor: "Gain City", warrantyExpiresOn: d(38), warrantyStartsOn: m(-26), warrantyKind: "store", warrantyProvider: "Gain City extended cover", pos: { dx: 140, dy: -150 } },
    { name: "Refrigerator", categoryId: "refrigerator", brand: "Samsung", model: "RT38CG6624S9", room: "Kitchen", purchaseDate: m(-14), purchasePrice: "1299", vendor: "Courts", warrantyExpiresOn: m(10), warrantyStartsOn: m(-14), pos: { dx: 60, dy: 50 } },
    { name: "Washing machine", categoryId: "washing_machine", brand: "LG", model: "FV1409S4W", room: "Service yard", purchaseDate: m(-23), purchasePrice: "849", vendor: "Harvey Norman", warrantyExpiresOn: d(21), warrantyStartsOn: m(-23), status: "needs_attention", notes: "Making a loud noise during spin cycle.", pos: { dx: 70, dy: 5 } },
    { name: "Storage water heater", categoryId: "water_heater", brand: "Ariston", model: "AN2 RS 30", room: "Common bath", purchaseDate: m(-40), purchasePrice: "320", vendor: "Plumber install", warrantyExpiresOn: m(-4), warrantyStartsOn: m(-40), pos: { dx: 60, dy: 25 } },
    { name: "Living room TV", categoryId: "television", brand: "Sony", model: "Bravia 55X85L", room: "Living room", purchaseDate: m(-9), purchasePrice: "1599", vendor: "Best Denki", warrantyExpiresOn: m(15), warrantyStartsOn: m(-9), pos: { dx: 0, dy: -165, skip: true } },
    { name: "Robot vacuum", categoryId: "vacuum", brand: "Roborock", model: "Q7 Max", room: "Living room", purchaseDate: m(-5), purchasePrice: "499", vendor: "Shopee", warrantyExpiresOn: m(7), warrantyStartsOn: m(-5), pos: { dx: 200, dy: 60 } },
    { name: "Hob & hood", categoryId: "cooker_hob", brand: "Bosch", model: "PPI82560MS", room: "Kitchen", purchaseDate: m(-40), purchasePrice: "980", vendor: "Renovation contractor", pos: { dx: -60, dy: 40, skip: true } },
  ] as const;

  const assetIds: Record<string, string> = {};
  for (const it of items) {
    const input = assetSchema.parse({
      ...it,
      roomId: roomId(it.room),
      recordPurchaseExpense: true,
      notes: "notes" in it ? it.notes : null,
      status: "status" in it ? it.status : "active",
    });
    assetIds[it.name] = await createAsset(tx, actor, input);
  }

  // Place appliances on the floor plan relative to their room centre.
  const objects: PlanObject[] = [...doc.objects];
  for (const it of items) {
    if ("skip" in it.pos && it.pos.skip) continue;
    const r = doc.rooms.find((x) => x.name === it.room)!;
    const cx = r.x + r.width / 2 + it.pos.dx;
    const cy = r.y + r.height / 2 + it.pos.dy;
    const size = 44;
    objects.push({ id: crypto.randomUUID(), kind: "asset", assetId: assetIds[it.name], furnitureType: null, label: null, x: cx - size / 2, y: cy - size / 2, width: size, height: size, rotation: 0 });
    if (!roomAt(doc.rooms, { x: cx, y: cy })) throw new Error(`Seed marker for ${it.name} is outside any room`);
  }
  await saveFloorDoc(tx, householdId, floor.id, floor.version, { ...doc, objects });

  // Maintenance: mix of overdue, due soon, upcoming and history.
  await createTask(tx, actor, { title: "Clean air filters", description: null, assetId: assetIds["Living room aircon"], assignedTo: userId, dueOn: d(-3), priority: "normal", recurrenceInterval: 1, recurrenceUnit: "month", source: "general_guidance" });
  const service = await createTask(tx, actor, { title: "Professional aircon servicing", description: "All units. General servicing — chemical wash not needed.", assetId: assetIds["Master bedroom aircon"], assignedTo: null, dueOn: d(9), priority: "normal", recurrenceInterval: 3, recurrenceUnit: "month", source: "general_guidance" });
  await createTask(tx, actor, { title: "Clean drum, seal and drain filter", description: null, assetId: assetIds["Washing machine"], assignedTo: userId, dueOn: d(4), priority: "normal", recurrenceInterval: 1, recurrenceUnit: "month", source: "general_guidance" });
  await createTask(tx, actor, { title: "Book technician for washing machine noise", description: "Loud noise during spin. Check if still under warranty first.", assetId: assetIds["Washing machine"], assignedTo: userId, dueOn: d(2), priority: "high", recurrenceInterval: null, recurrenceUnit: null, source: "user" });
  await createTask(tx, actor, { title: "Degrease hood filters", description: null, assetId: assetIds["Hob & hood"], assignedTo: null, dueOn: d(23), priority: "low", recurrenceInterval: 3, recurrenceUnit: "month", source: "general_guidance" });
  await createTask(tx, actor, { title: "Test smoke detector", description: null, assetId: null, assignedTo: null, dueOn: d(12), priority: "normal", recurrenceInterval: 1, recurrenceUnit: "month", source: "general_guidance" });
  await createTask(tx, actor, { title: "Water heater inspection by licensed technician", description: null, assetId: assetIds["Storage water heater"], assignedTo: null, dueOn: d(60), priority: "normal", recurrenceInterval: 1, recurrenceUnit: "year", source: "general_guidance" });

  // History: past services with costs (become expenses through the normal path).
  await completeTask(tx, actor, { taskId: service, performedOn: addDays(m(-6), 9), notes: "3 units serviced.", vendor: "CoolBreeze Aircon Services", cost: 9000 });
  await completeTask(tx, actor, { taskId: service, performedOn: addDays(m(-3), 9), notes: "3 units serviced. Technician noted the bedroom unit drains slowly.", vendor: "CoolBreeze Aircon Services", cost: 9000 });
  await recordEvent(tx, actor, { assetId: assetIds["Refrigerator"], kind: "repair", title: "Replaced door gasket", performedOn: m(-5), vendor: "Samsung service centre", cost: 0, notes: "Covered under warranty." });
  await recordEvent(tx, actor, { assetId: assetIds["Storage water heater"], kind: "repair", title: "Replaced heating element", performedOn: m(-7), vendor: "Licensed plumber", cost: 18000, notes: null });
  await recordEvent(tx, actor, { assetId: assetIds["Living room aircon"], kind: "service", title: "Gas top-up", performedOn: m(-8), vendor: "CoolBreeze Aircon Services", cost: 6000, notes: null });
  await tx`
    insert into expenses (household_id, category, description, amount_cents, currency, incurred_on, vendor, created_by)
    values (${householdId}, 'renovation', 'Kitchen cabinet hinge repair', 12000, 'SGD', ${m(-2)}, 'Handyman', ${userId}),
           (${householdId}, 'parts', 'Aircon remote replacement', 2500, 'SGD', ${d(-12)}, 'Shopee', ${userId})
  `;

  await tx`update profiles set onboarding_step = 'done', onboarding_completed_at = now() where id = ${userId}`;
  return householdId;
}
