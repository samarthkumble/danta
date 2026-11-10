import "server-only";
import { db, must } from "./db";
import { createCaseFromQuote } from "./cases";
import type { Plan } from "./plan";

/** Everything here is fictional demo data, labelled as such in the UI. */
export const DEMO_CLINIC = {
  name: "Coastline Dental Studio (demo)",
  city: "Mangaluru, India",
  currency: "USD",
  warranty_days: 180,
  warranty_terms:
    "Implant fixture: 5-year manufacturer warranty against fixture failure. " +
    "Crown: if the crown loosens, chips or fractures within 6 months under normal use, we replace it on your next visit or refund up to 50% of the crown fee. " +
    "Not covered: damage from accidents or sports injuries, or problems after missing the recommended follow-up check.",
};

export const DEMO_QUOTE = `COASTLINE DENTAL STUDIO, Mangaluru (demo clinic)
Treatment estimate for: Priya Nair (international patient, New Jersey, USA)
Prepared by Dr. A. Shenoy. Prices in USD.

TRIP 1 (approx. 5 days in Mangaluru)
1. Consultation and CBCT 3D scan ............ 1 x 60.00 = 60.00
2. Bone graft, lower left (tooth 36), if required ... 1 x 180.00 = 180.00
3. Implant fixture, Osstem TS III, tooth 36 ...... 1 x 520.00 = 520.00
4. Surgical placement fee ...................... 1 x 150.00 = 150.00
5. Medication and post-op review ............... 1 x 40.00 = 40.00

Healing period: 4 months before the crown can be fitted.

TRIP 2 (approx. 3 days)
6. Abutment ................................... 1 x 140.00 = 140.00
7. Zirconia crown, tooth 36 .................... 1 x 260.00 = 260.00
8. Final fitting and X-ray ...................... 1 x 40.00 = 40.00

TOTAL PAYABLE: USD 1,450.00
A 20% deposit confirms your Trip 1 booking.

Warranty: implant fixture 5 years (manufacturer). Crown loosening or fracture within 6 months:
replacement or up to 50% of the crown fee refunded. Accidents and missed follow-ups not covered.`;

export async function demoClinicId(): Promise<string> {
  const found = await db().from("clinics").select("id").eq("name", DEMO_CLINIC.name).maybeSingle();
  if (found.data) return found.data.id as string;
  const c = must(await db().from("clinics").insert(DEMO_CLINIC).select("id").single(), "demo clinic") as { id: string };
  await db().from("resources").insert([
    { clinic_id: c.id, name: "Dr. A. Shenoy (implants)", kind: "dentist" },
    { clinic_id: c.id, name: "Dr. R. Pai (prosthodontics)", kind: "dentist" },
    { clinic_id: c.id, name: "Chair 3 + CBCT", kind: "chair" },
  ]);
  return c.id;
}

/** Fresh demo: removes demo cases and builds Priya's case from the sample quote. */
export async function resetDemo() {
  const clinicId = await demoClinicId();
  // Each visitor gets their own copy; copies older than a day are cleared so judges never collide.
  await db().from("cases").delete().eq("clinic_id", clinicId).eq("demo", true).lt("created_at", new Date(Date.now() - 86_400_000).toISOString());
  const prev = await db()
    .from("cases")
    .select("plan")
    .eq("clinic_id", clinicId)
    .eq("demo", true)
    .eq("quote_text", DEMO_QUOTE)
    .not("plan", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  // Translations travel with it, so repeat visitors do not wait for the AI either.
  const cached = (prev.data?.plan ?? undefined) as Plan | undefined;
  const c = await createCaseFromQuote({
    plan: cached,
    clinicId,
    patientName: "Priya Nair",
    patientEmail: process.env.SANDBOX_BUYER_EMAIL ?? "priya.demo@example.com",
    homeCity: "Edison, New Jersey",
    language: "English",
    quote: DEMO_QUOTE,
    firstDay: new Date(Date.now() + 30 * 86_400_000),
    demo: true,
  });
  return { id: c.id, token: c.public_token };
}
