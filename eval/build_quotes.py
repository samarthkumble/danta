"""Builds eval/quotes.json: 20 fictional clinic quotes with an answer key.

Every clinic, patient and price is invented. Each quote is written in one of five
layouts real quotes use (dotted lines, dash lists, pipe tables, prose, rupee notation),
and some carry planted problems. The answer key is derived from the line data here,
not from Danta's code, and this file is committed before any model run.
"""
import json

def money(v, cur):
    sym = {"USD": "$", "GBP": "£", "CAD": "CAD ", "AUD": "AUD ", "INR": "Rs. ", "AED": "AED "}[cur]
    s = f"{v:,.2f}" if cur != "INR" else f"{v:,.0f}/-"
    return f"{sym}{s}"

def render(q):
    cur, style = q["currency"], q["style"]
    out = [q["header"], ""]
    for t, trip in enumerate(q["trips"], 1):
        out.append(trip["heading"])
        for i, (desc, qty, unit, printed) in enumerate(trip["lines"]):
            if style == "dotted":
                out.append(f"{i+1}. {desc} {'.'*max(3, 40-len(desc))} {qty} x {unit:.2f} = {printed:.2f}")
            elif style == "dash":
                out.append(f"- {desc}{f' (x{qty})' if qty > 1 else ''}: {money(printed, cur)}")
            elif style == "table":
                if i == 0:
                    out.append("| Treatment | Qty | Rate | Amount |")
                out.append(f"| {desc} | {qty} | {unit:,.2f} | {printed:,.2f} |")
            elif style == "rupee":
                out.append(f"{desc} - {qty} no. @ {money(unit, cur)} = {money(printed, cur)}")
            elif style == "prose":
                part = f"{desc.lower()} at {money(printed, cur)}" + (f" ({qty} units)" if qty > 1 else "")
                out.append(("We will do " if i == 0 else "Then ") + part + ".")
        if trip.get("after"):
            out.append(trip["after"])
        out.append("")
    if q["stated"] is not None:
        out.append(f"TOTAL: {money(q['stated'], cur)}" if style != "prose" else f"Altogether this comes to {money(q['stated'], cur)}.")
    if q.get("deposit"):
        out.append(q["deposit"])
    if q.get("warranty"):
        out.append(q["warranty"])
    return "\n".join(out).strip()

def key(q):
    lines = [l for t in q["trips"] for l in t["lines"]]
    text = " ".join(l[0].lower() for l in lines)
    full = render(q).lower()
    total = round(sum(l[3] for l in lines) * 100)
    tags = set()
    if any(abs(round(l[1] * l[2] * 100) - round(l[3] * 100)) > 1 for l in lines):
        tags.add("line_math")
    if q["stated"] is not None and abs(round(q["stated"] * 100) - total) > 1:
        tags.add("total_mismatch")
    implant = "implant" in text
    if implant and not any(w in text for w in ("crown", "bridge", "denture", "prosthe")):
        tags.add("implant_no_crown")
    if implant and "abutment" not in text:
        tags.add("no_abutment")
    if any(w in text for w in ("crown", "bridge", "veneer")) and "lab" not in full:
        tags.add("no_lab_fee")
    if not q.get("warranty"):
        tags.add("no_warranty")
    gap = q.get("gap_days")
    if implant and len(q["trips"]) > 1 and gap is not None and gap < 60:
        tags.add("short_gap")
    return {"totalCents": total, "statedTotalCents": None if q["stated"] is None else round(q["stated"] * 100),
            "trips": len(q["trips"]), "items": len(lines), "currency": q["currency"], "issues": sorted(tags)}

W6 = "Warranty: crowns 1 year against fracture; implants 5 years (manufacturer)."
Q = []
def add(id, style, currency, header, trips, stated, gap_days=None, deposit=None, warranty=W6, note=""):
    Q.append(dict(id=id, style=style, currency=currency, header=header, trips=trips, stated=stated, gap_days=gap_days, deposit=deposit, warranty=warranty, note=note))

T = lambda heading, lines, after=None: dict(heading=heading, lines=lines, after=after)

add("q01", "dotted", "USD", "Sea Breeze Dental, Udupi. Estimate for an NRI patient (Texas). Prices in USD.",
    [T("TRIP 1 (6 days)", [("Consultation and OPG X-ray", 1, 40, 40), ("Implant fixture, tooth 46", 1, 480, 480), ("Implant surgery", 1, 160, 160)], "Healing: 4 months before the crown."),
     T("TRIP 2 (3 days)", [("Abutment", 1, 130, 130), ("PFM crown incl. lab", 1, 210, 210)])], 1020, 120, "25% deposit to book.", note="clean")
add("q02", "dotted", "USD", "Pearl Smiles, Kochi. Estimate in USD.",
    [T("VISIT 1", [("Root canal treatment, tooth 16", 1, 120, 120), ("Zirconia crown, tooth 16", 1, 240, 240)])], 360, deposit="Full payment on day 1.", note="crown without lab fee")
add("q03", "dash", "GBP", "Malabar Dental Care, Kozhikode. Quote for UK patient, in GBP.",
    [T("Trip 1:", [("CBCT scan", 1, 45, 45), ("Implants, upper front", 2, 420, 840), ("Bone graft", 1, 150, 150)], "Return after 3 months."),
     T("Trip 2:", [("Abutments", 2, 110, 220), ("Implant crowns, lab work included", 2, 260, 520)])], 1775, 90, "20% deposit.", note="clean, quantities")
add("q04", "dash", "GBP", "Coastal Implant Centre, Mangaluru. GBP quote.",
    [T("First visit:", [("Consultation", 1, 30, 30), ("Implant, lower left", 1, 450, 450), ("Surgical fee", 1, 120, 120)], "Second visit in 3 weeks."),
     T("Second visit:", [("Abutment", 1, 100, 100), ("Crown with lab charges", 1, 220, 220)])], 920, 21, "Deposit 30%.", note="short healing gap")
add("q05", "table", "CAD", "Konkan Dental Studio, Goa. Estimate for Canadian patient (CAD).",
    [T("Stage 1", [("Scaling and polishing", 1, 60, 60), ("Porcelain veneers, upper 6", 6, 280, 1680)])], 1740, deposit="50% advance.", note="veneers without lab fee")
add("q06", "table", "CAD", "Nethravathi Dental Clinic, Puttur. CAD.",
    [T("Trip 1", [("Implant fixture", 1, 500, 500), ("Placement", 1, 150, 150)], "Healing 4 months."),
     T("Trip 2", [("Abutment", 1, 120, 120), ("Lab fee", 1, 60, 60), ("Zirconia crown", 1, 250, 250)])], 1080, 120, "20% deposit.", warranty=None, note="no warranty")
add("q07", "dotted", "USD", "Smile Arc Dental, Bengaluru. USD quote.",
    [T("TRIP 1", [("Extraction, tooth 36", 1, 50, 50), ("Implant fixture", 1, 520, 520), ("Surgical placement", 1, 150, 150)], "Heal 4 months."),
     T("TRIP 2", [("Abutment", 1, 140, 140), ("Zirconia crown + lab", 1, 260, 260)])], 1180, 120, "20% deposit.", note="stated total wrong by 60")
add("q08", "dotted", "USD", "Royal Dental, Mysuru. USD.",
    [T("VISIT 1", [("Composite fillings", 3, 35, 115), ("Root canal, tooth 26", 1, 110, 110)])], 225, note="line math wrong (3x35=105)")
add("q09", "prose", "AUD", "Dear Mr. Varghese, thank you for visiting Kerala Smile Centre, Thrissur. Prices in AUD.",
    [T("On your first trip:", [("Two implants in the lower jaw", 2, 600, 1200), ("CBCT scan", 1, 50, 50)], "After four months of healing you will return."),
     T("On your second trip:", [("Abutments", 2, 120, 240), ("Implant crowns, lab work included", 2, 300, 600)])], 2090, 120, "We ask for a 20% deposit.", note="clean, prose")
add("q10", "prose", "AUD", "Hello Ms. Iyer, here is your plan from Blue Lotus Dental, Chennai (AUD).",
    [T("Visit one:", [("Implant for the missing molar", 1, 650, 650), ("Surgery and medicines", 1, 120, 120)], "You can come back for the rest later.")], 770, deposit="Pay in full at the visit.", note="implant with no crown or abutment, single trip")
add("q11", "rupee", "INR", "SRI DURGA DENTAL HOSPITAL, Mangaluru. Estimate (INR).",
    [T("Sitting 1", [("RCT tooth 37", 1, 6000, 6000), ("Post and core", 1, 2500, 2500)]), T("Sitting 2", [("Zirconia crown incl. lab", 1, 12000, 12000)])], 20500, 7, "Advance Rs. 5,000/-", note="clean, rupees, no implant")
add("q12", "rupee", "INR", "Shree Dental Care, Bengaluru. Quotation (INR).",
    [T("Phase 1", [("Implant (Osstem)", 2, 28000, 56000), ("Bone graft", 1, 9000, 9000)], "Gap of 1 month."),
     T("Phase 2", [("Abutment", 2, 6000, 12000), ("Ceramic crown", 2, 9500, 19000)])], 96000, 30, "Advance 25%.", warranty=None,
    note="short gap, no lab fee, no warranty")
add("q13", "dash", "AED", "Udupi Smile Studio. Quote for patient living in Dubai, in AED.",
    [T("Trip 1:", [("Full mouth X-ray", 1, 80, 80), ("Deep cleaning", 1, 250, 250), ("Composite fillings", 4, 150, 600)])], 930, warranty="Fillings guaranteed 1 year.", note="clean, simple")
add("q14", "table", "USD", "Arabian Sea Dental, Karwar. USD.",
    [T("Trip 1", [("All-on-4 implants, lower arch", 4, 450, 1800), ("Temporary denture", 1, 300, 300)], "Healing 5 months."),
     T("Trip 2", [("Multi-unit abutments", 4, 120, 480), ("Final fixed prosthesis (lab included)", 1, 1800, 1800)])], 4380, 150, "15% deposit.", note="clean, large")
add("q15", "dotted", "USD", "Green Valley Dental, Shivamogga. USD.",
    [T("TRIP 1", [("Implant fixture", 1, 500, 500), ("Placement", 1, 150, 150)], "Heal 4 months."),
     T("TRIP 2", [("Zirconia crown with lab fee", 1, 260, 260)])], 910, 120, "20% deposit.", note="implant without abutment")
add("q16", "dash", "GBP", "Tulu Nadu Dental Arts, Mangaluru. GBP.",
    [T("Visit 1:", [("Teeth whitening", 1, 180, 180), ("Bridge, 3 units", 3, 190, 570)])], 750, "Full payment at visit.", warranty=None, note="bridge without lab, no warranty")
add("q17", "table", "CAD", "Western Ghats Dental, Hassan. CAD.",
    [T("Trip 1", [("Clear aligners, full course", 1, 2200, 2200), ("Retainers", 2, 90, 200)])], 2400, deposit="40% advance.", warranty="Aligner refinements free for 12 months.", note="line math wrong (2x90=180)")
add("q18", "prose", "USD", "Dear Dr. Rao's patient, Moodbidri Family Dentistry estimate (USD).",
    [T("First trip:", [("Extraction of two wisdom teeth", 2, 70, 140), ("Implant on the lower right", 1, 480, 480)], "After three months come back."),
     T("Second trip:", [("Abutment", 1, 110, 110), ("Crown, lab charges included", 1, 230, 230)])], 960, 90, "A deposit of 20%.", note="clean prose")
add("q19", "dotted", "USD", "Karavali Dental Hub, Kundapura. USD.",
    [T("TRIP 1", [("Complete dentures, upper and lower", 1, 650, 650), ("Relining", 1, 80, 80)])], 780, deposit="Full payment.", warranty="Dentures adjusted free for 6 months.", note="total off by 50")
add("q20", "rupee", "INR", "Mahalasa Dental Clinic, Udupi. Estimate (INR).",
    [T("Sitting 1", [("Implant", 1, 30000, 30000), ("Abutment", 1, 7000, 7000), ("PFM crown", 1, 8000, 8000)])], 45000, None, "Advance Rs. 10,000/-", note="implant, abutment and crown in one sitting, no lab")

data = [{"id": q["id"], "note": q["note"], "quote": render(q), "key": key(q)} for q in Q]
json.dump(data, open("eval/quotes.json", "w"), indent=1, ensure_ascii=False)
from collections import Counter
print(len(data), "quotes;", Counter(t for d in data for t in d["key"]["issues"]))
