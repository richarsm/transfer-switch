import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useStore } from "../data/StoreContext";
import { formatHavanaLong } from "../lib/havana";
import { formatMoney } from "../lib/money";
import { awaitingAdminProcess } from "../lib/operations";

const links = [
  { to: "/", label: "Tablero", end: true },
  { to: "/operaciones", label: "Operaciones", end: false },
  { to: "/beneficiarios", label: "Beneficiarios", end: false },
  { to: "/tarjetas", label: "Tarjetas", end: false },
  { to: "/provincias", label: "Provincias", end: false },
  { to: "/apertura", label: "Apertura", admin: true },
  { to: "/viajes", label: "Viajes", end: false },
  { to: "/operadores", label: "Operadores", admin: true },
];

export function Shell() {
  const { session, snapshot, logout } = useStore();
  const isAdmin = session?.role === "admin";
  const pendingCount = snapshot.operations.filter(awaitingAdminProcess).length;
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nav = links.filter((l) => !l.admin || isAdmin);

  return (
    <div className="app-shell">
      {menuOpen ? (
        <button
          type="button"
          className="nav-backdrop"
          aria-label="Cerrar menú"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
      <aside id="app-nav" className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="sidebar-head">
          <div className="brand">
            <strong>T-Transfer</strong>
            <span>GYN → CUP · reloj de Cuba</span>
          </div>
          <button
            type="button"
            className="menu-toggle drawer-close"
            aria-label="Cerrar menú"
            onClick={() => setMenuOpen(false)}
          >
            <CloseIcon />
          </button>
        </div>
        <nav className="nav">
          {nav.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => (isActive ? "active" : "")}
              onClick={() => setMenuOpen(false)}
            >
              <span className="nav-item">
                {l.label}
                {l.to === "/operaciones" && pendingCount > 0 ? (
                  <span className="nav-count">{pendingCount}</span>
                ) : null}
              </span>
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div>
            {session?.displayName}
            <br />
            <span>{session?.role === "admin" ? "Administrador" : "Operador"}</span>
          </div>
          <button className="btn ghost" onClick={logout} style={{ color: "#f0d9a0", borderColor: "#2c5446" }}>
            Salir
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="mobile-bar">
          <button
            type="button"
            className="menu-toggle"
            aria-label="Abrir vistas"
            aria-expanded={menuOpen}
            aria-controls="app-nav"
            onClick={() => setMenuOpen(true)}
          >
            <MenuIcon />
          </button>
          <div className="brand">
            <strong>T-Transfer</strong>
          </div>
          <OpeningRates compact />
        </div>
        <div className="topbar">
          <div>
            <div className="muted">{formatHavanaLong()}</div>
          </div>
          <OpeningRates />
        </div>
        <Outlet />
      </main>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function OpeningRates({ compact = false }: { compact?: boolean }) {
  const { currentOpening } = useStore();
  if (!currentOpening) {
    return <div className={`rate-ref ${compact ? "compact" : ""}`}>Sin apertura</div>;
  }
  return (
    <div className={`rate-ref ${compact ? "compact" : ""}`} title="Tasa por 1 000 GYN">
      <span className="rate-chip" title={`Tarjeta CUP`}>
        <CardIcon />
        <b>{formatMoney(currentOpening.cupPer1000Gyn, "CUP")}</b>
      </span>
      <span
        className="rate-chip"
        title={`Efectivo CUP`}
      >
        <CashHandIcon variant="cup" />
        <b>{formatMoney(currentOpening.cashCupPer1000Gyn || 0, "CUP")}</b>
      </span>
      <span
        className="rate-chip"
        title={`Efectivo USD`}
      >
        <CashHandIcon variant="usd" />
        <b>{formatMoney(currentOpening.cashUsdPer1000Gyn || 0, "USD")}</b>
      </span>
    </div>
  );
}

function CardIcon() {
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true">
      <rect x="0.5" y="0.5" width="21" height="15" rx="2.5" fill="#1f4a3c" stroke="#d7b56a" />
      <rect x="0.5" y="4" width="21" height="3" fill="#d7b56a" />
      <rect x="3" y="10" width="6" height="2" rx="0.5" fill="#f0d9a0" />
    </svg>
  );
}

function CashHandIcon({ variant }: { variant: "usd" | "cup" }) {
  const dark = variant === "usd" ? "#2e8a40" : "#1d5cad";
  const mid = variant === "usd" ? "#3f9e52" : "#2f74c7";
  const light = variant === "usd" ? "#8ed98c" : "#7eb6f5";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <g transform="rotate(-32 15 7.5)">
        <rect x="7" y="1.6" width="15" height="9.2" rx="1.4" fill={dark} stroke="#1a1a1a" strokeWidth="1" />
        <rect x="8.3" y="2.8" width="12.4" height="6.8" rx="1" fill={light} />
        <circle cx="14.5" cy="6.2" r="2.15" fill={mid} />
        <path
          d="M14.5 4.55v3.3M13.35 5.3c0-.45.52-.78 1.15-.78s1.15.33 1.15.78-.45.62-1.15.75c-.82.16-1.2.48-1.2.95s.55.85 1.2.85 1.2-.35 1.2-.85"
          stroke="#fff"
          strokeWidth="0.75"
          fill="none"
          strokeLinecap="round"
        />
      </g>
      <path
        d="M2.2 21.4 6.8 14.8l4.6 3.2-4.2 5.2z"
        fill="#3a3d42"
        stroke="#1a1a1a"
        strokeWidth="0.95"
        strokeLinejoin="round"
      />
      <path
        d="M6.6 15.1c2.4-2.1 6.8-.2 7.8 2 .8 1.6.1 3.3-1.7 3.7-2.1.4-4.9.1-6.8-1.6-1.3-1.2-1.2-2.7.7-4.1z"
        fill="#e8b48c"
        stroke="#1a1a1a"
        strokeWidth="0.95"
        strokeLinejoin="round"
      />
      <path
        d="M13.4 13.4c1.55.25 2.55 1.7 2.2 3.25-.3 1.25-1.45 1.9-2.5 1.55"
        fill="#e8b48c"
        stroke="#1a1a1a"
        strokeWidth="0.95"
        strokeLinejoin="round"
      />
    </svg>
  );
}
