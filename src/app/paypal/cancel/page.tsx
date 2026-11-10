import Link from "next/link";
import { TopBar } from "@/components/TopBar";

export default function PayPalCancel() {
  return (
    <>
      <TopBar />
      <main className="wrap section">
        <h1>Payment cancelled</h1>
        <p className="lede" style={{ marginTop: 12 }}>Nothing was charged. Go back to your plan to pay when you are ready.</p>
        <Link className="btn btn-primary" href="/" style={{ marginTop: 20 }}>Go to Danta</Link>
      </main>
    </>
  );
}
