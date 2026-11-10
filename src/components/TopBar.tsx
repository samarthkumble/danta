import Link from "next/link";

export function TopBar({ current, clinicHref }: { current?: "home" | "patient" | "clinic"; clinicHref?: string }) {
  return (
    <header className="topbar">
      <div className="wrap">
        <Link href="/" className="brand" aria-label="Danta home">
          <b>Danta</b>
          <span>dental care in India, paid in stages</span>
        </Link>
        <span className="sandbox-flag" title="All payments use the PayPal sandbox. No real money moves.">
          PayPal sandbox
        </span>
        <nav aria-label="Views">
          <Link href="/" aria-current={current === "home" ? "page" : undefined}>
            About
          </Link>
          {clinicHref && (
            <Link href={clinicHref} aria-current={current === "clinic" ? "page" : undefined}>
              Clinic console
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
