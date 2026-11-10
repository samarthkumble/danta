import Link from "next/link";
import { TopBar } from "@/components/TopBar";

export default function PayPalReturn() {
  return (
    <>
      <TopBar />
      <main className="wrap section">
        <h1>Back from PayPal</h1>
        <p className="lede" style={{ marginTop: 12 }}>You can close this tab. Your plan updates as soon as PayPal confirms the payment.</p>
        <Link className="btn btn-primary" href="/" style={{ marginTop: 20 }}>Go to Danta</Link>
      </main>
    </>
  );
}
