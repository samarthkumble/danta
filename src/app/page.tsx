import { TopBar } from "@/components/TopBar";
import { StartDemo } from "@/components/StartDemo";
import { QuoteForm } from "@/components/QuoteForm";

const SOURCES = {
  carequest: "https://carequest.org/press-release/new-report-nearly-9-6-million-adults-have-traveled-outside-the-us-to-receive-dental-treatment/",
  bda: "https://bda.org/news-and-opinion/news/dental-tourism-patients-need-to-know-the-risks",
  quint: "https://www.thequint.com/fit/medical-tourism-nris-medical-dental-procedures-india",
  diaspora: "https://www.wam.ae/en/article/15hsmel-indian-diaspora-ranks-world%E2%80%99s-biggest-354-million",
  refunds: "https://docs.paypal.ai/payments/methods/paypal/refund",
};

export default function Home() {
  return (
    <>
      <TopBar current="home" />
      <main>
        <section className="hero">
          <div className="wrap hero-grid">
            <div>
              <h1>Fly home for your teeth. Pay as the work gets done.</h1>
              <p className="lede">
                Danta turns an Indian dental clinic&apos;s quote into a checked plan you pay in stages with PayPal: a deposit to book, each
                stage when it happens, and a written aftercare guarantee your dentist back home can claim against.
              </p>
              <div className="row" style={{ marginTop: 26 }}>
                <StartDemo />
                <a className="btn btn-ghost" href="#own-quote">
                  Check your own quote
                </a>
              </div>
            </div>
            <ItineraryPreview />
          </div>
        </section>

        <section className="section">
          <div className="wrap grid-3">
            <div className="card stat-card">
              <div className="stat">9.6M</div>
              <p>US adults have travelled abroad for dental treatment, most of them to save money.</p>
              <a href={SOURCES.carequest}>CareQuest Institute, 2026</a>
            </div>
            <div className="card stat-card">
              <div className="stat">86%</div>
              <p>of UK dentists who saw dental tourists had to treat complications. Nearly all worried about follow-up care and redress.</p>
              <a href={SOURCES.bda}>British Dental Association survey</a>
            </div>
            <div className="card stat-card">
              <div className="stat">CAD 1,500</div>
              <p>paid one Toronto patient for a whole trip to India, against CAD 2,500 quoted at home for a single crown.</p>
              <a href={SOURCES.quint}>The Quint, 2024</a>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <h2>The trouble is not the dentistry. It is paying for it from 13,000 km away.</h2>
            <p className="lede muted" style={{ maxWidth: "44em", marginTop: 10 }}>
              Patients from the {""}
              <a href={SOURCES.diaspora}>35-million-strong Indian diaspora</a> wire money in advance, read quotes with missing items, and
              have no way back when a crown cracks after they fly home. Clinics juggle two trips, healing months and patients in other time
              zones on WhatsApp.
            </p>
            <ol className="steps" style={{ marginTop: 26, padding: 0 }}>
              <li>
                <h3>Read the quote</h3>
                <p className="small muted">AI pulls out every line, linked to the exact text. Code redoes the arithmetic and flags missing items, like a crown with no lab fee.</p>
              </li>
              <li>
                <h3>Pay in stages</h3>
                <p className="small muted">A deposit with PayPal Checkout books trip one. Each later stage is invoiced with PayPal only when it is due.</p>
              </li>
              <li>
                <h3>Agent with limits</h3>
                <p className="small muted">The clinic&apos;s AI assistant proposes invoices and reschedules. Code checks healing gaps and amounts, and a person approves.</p>
              </li>
              <li>
                <h3>Aftercare claims</h3>
                <p className="small muted">A home dentist&apos;s note is checked against the clinic&apos;s written warranty, and the refund goes back through PayPal.</p>
              </li>
            </ol>
          </div>
        </section>

        <section className="section" id="own-quote">
          <div className="wrap">
            <h2>Check your own quote</h2>
            <p className="muted" style={{ margin: "6px 0 16px" }}>
              Paste any clinic&apos;s estimate. Danta never gives medical advice; it checks the money and the schedule.
            </p>
            <QuoteForm />
          </div>
        </section>

        <section className="section">
          <div className="wrap grid-2">
            <div className="card">
              <h2>What Danta will not do</h2>
              <ul className="small" style={{ paddingLeft: 18, marginTop: 10, lineHeight: 1.7 }}>
                <li>Judge whether a treatment is right for you. That stays between you and your dentists.</li>
                <li>Move money on the AI&apos;s say-so. Every invoice, reschedule and refund needs a person&apos;s approval.</li>
                <li>
                  Promise refunds forever. PayPal refunds work for <a href={SOURCES.refunds}>180 days after payment</a>, so the guarantee
                  covers that window; later claims go to the clinic.
                </li>
                <li>Charge twice. Every PayPal call carries an idempotency key and every payment is checked against the plan.</li>
              </ul>
            </div>
            <div className="card">
              <h2>For clinics</h2>
              <p className="small" style={{ marginTop: 10, lineHeight: 1.7 }}>
                A console with both trips on a timeline, every payment in one ledger, and an assistant that drafts the invoices and reschedules
                for you to approve. Danta would earn a small fee per completed case; patients pay nothing extra.
              </p>
              <div style={{ marginTop: 16 }}>
                <StartDemo label="Open the clinic console" to="clinic" />
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="foot">
        <div className="wrap">
          Built for the PayPal AI Hackathon 2026. Demo clinic, patient and quotes are fictional. Payments use the PayPal sandbox. Open source
          under the MIT licence.
        </div>
      </footer>
    </>
  );
}

function ItineraryPreview() {
  return (
    <div className="trips" aria-label="Example plan: an implant over two trips">
      <div className="pass">
        <div className="pass-main">
          <span className="pass-tag">Trip 1</span>
          <div className="pass-route">
            Newark <span className="plane">✈</span> Mangaluru
          </div>
          <p className="small muted" style={{ marginBottom: 8 }}>5 days, implant placed</p>
          <div className="pass-stage">
            <span>Booking deposit</span>
            <span className="num">$278.00</span>
            <span className="pill paid">Paid</span>
          </div>
          <div className="pass-stage">
            <span>Scan, graft and implant</span>
            <span className="num">$672.00</span>
            <span className="pill due">Due on arrival</span>
          </div>
        </div>
        <div className="pass-stub">
          <span className="small muted">Paid so far</span>
          <span className="amount num">$278</span>
          <span className="stamp">Paid PayPal</span>
        </div>
      </div>
      <div className="healing">4 months of healing at home</div>
      <div className="pass">
        <div className="pass-main">
          <span className="pass-tag">Trip 2</span>
          <div className="pass-route">
            Newark <span className="plane">✈</span> Mangaluru
          </div>
          <p className="small muted" style={{ marginBottom: 8 }}>3 days, crown fitted</p>
          <div className="pass-stage">
            <span>Abutment, crown and fitting</span>
            <span className="num">$440.00</span>
            <span className="pill">Invoiced when due</span>
          </div>
        </div>
        <div className="pass-stub">
          <span className="small muted">Guarantee</span>
          <span className="amount">6 months</span>
          <span className="small muted">on the crown</span>
        </div>
      </div>
    </div>
  );
}
