import { z } from "zod";
import { handle } from "../_util";
import { createCaseFromQuote } from "@/lib/cases";
import { demoClinicId } from "@/lib/demo";

const Body = z.object({
  patientName: z.string().min(2).max(80),
  patientEmail: z.string().email(),
  homeCity: z.string().max(80).default(""),
  language: z.string().max(30).default("English"),
  quote: z.string().min(40).max(12000),
  firstDay: z.string().optional(),
});

export const maxDuration = 60;

export const POST = handle(async (req: Request) => {
  const b = Body.parse(await req.json());
  const c = await createCaseFromQuote({
    clinicId: await demoClinicId(),
    patientName: b.patientName,
    patientEmail: b.patientEmail,
    homeCity: b.homeCity,
    language: b.language,
    quote: b.quote,
    firstDay: b.firstDay ? new Date(b.firstDay) : undefined,
  });
  return { id: c.id, token: c.public_token };
});
