import { useState, type FormEvent } from "react";
import { useStore } from "../data/StoreContext";
import { havanaDateISO } from "../lib/havana";
import { formatMoney, parseAmount } from "../lib/money";

export function CardsPage() {
  const store = useStore();
  const isAdmin = store.session?.role === "admin";
  const today = havanaDateISO();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      store.upsertCard({
        id: editing && editing !== "new" ? editing : undefined,
        alias: String(form.get("alias") ?? ""),
        bank: String(form.get("bank") ?? ""),
        last4: String(form.get("last4") ?? ""),
        holder: String(form.get("holder") ?? ""),
        balanceCup: parseAmount(String(form.get("balanceCup") ?? "")),
        dailyLimit: parseAmount(String(form.get("dailyLimit") ?? "")),
        monthlyLimit: parseAmount(String(form.get("monthlyLimit") ?? "")),
        active: form.get("active") === "on",
        notes: String(form.get("notes") ?? ""),
      });
      setEditing(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Tarjetas</h1>
        {isAdmin ? (
          <button className="btn primary" onClick={() => setEditing("new")}>
            Alta de tarjeta
          </button>
        ) : null}
      </div>
      {error ? <div className="error">{error}</div> : null}
      <div className="grid-2">
        {store.snapshot.cards.map((card) => {
          const room = store.cardHeadroom(card.id, today);
          const dailyPct = Math.min(100, (room.usedToday / card.dailyLimit) * 100);
          return (
            <article className="card" key={card.id}>
              <div className="page-head">
                <h2>{card.alias}</h2>
                <span className={`badge ${card.active ? "ok" : "bad"}`}>
                  {card.active ? "Activa" : "Bloqueada"}
                </span>
              </div>
              <p className="muted">
                {card.bank} · **** {card.last4} · {card.holder}
              </p>
              <p>
                Saldo {formatMoney(room.balanceLeft, "CUP")}
                <br />
                Hoy {formatMoney(room.usedToday, "CUP")} / {formatMoney(card.dailyLimit, "CUP")}
                <br />
                Mes {formatMoney(room.usedMonth, "CUP")} / {formatMoney(card.monthlyLimit, "CUP")}
              </p>
              <div className="usage">
                <span style={{ width: `${dailyPct}%` }} />
              </div>
              {isAdmin ? (
                <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => setEditing(card.id)}>
                  Editar
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
      {editing ? (
        <CardForm
          key={editing}
          initial={
            editing === "new" ? null : store.snapshot.cards.find((c) => c.id === editing) ?? null
          }
          onSubmit={onSubmit}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function CardForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: ReturnType<typeof useStore>["snapshot"]["cards"][number] | null;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form className="card" onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
      <h2>{initial ? "Editar tarjeta" : "Nueva tarjeta"}</h2>
      <div className="grid-3">
        <label className="field">
          Alias
          <input name="alias" defaultValue={initial?.alias} required />
        </label>
        <label className="field">
          Banco
          <input name="bank" defaultValue={initial?.bank} required />
        </label>
        <label className="field">
          Últimos 4
          <input name="last4" defaultValue={initial?.last4} required />
        </label>
      </div>
      <label className="field">
        Titular
        <input name="holder" defaultValue={initial?.holder} required />
      </label>
      <div className="grid-3">
        <label className="field">
          Saldo CUP
          <input name="balanceCup" defaultValue={initial?.balanceCup ?? 0} />
        </label>
        <label className="field">
          Límite diario
          <input name="dailyLimit" defaultValue={initial?.dailyLimit ?? 0} />
        </label>
        <label className="field">
          Límite mensual
          <input name="monthlyLimit" defaultValue={initial?.monthlyLimit ?? 0} />
        </label>
      </div>
      <label className="field" style={{ flexDirection: "row", alignItems: "center" }}>
        <input name="active" type="checkbox" defaultChecked={initial?.active ?? true} />
        Activa
      </label>
      <label className="field">
        Notas
        <textarea name="notes" defaultValue={initial?.notes} />
      </label>
      <div className="row">
        <button className="btn primary" type="submit">
          Guardar
        </button>
        <button className="btn ghost" type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
