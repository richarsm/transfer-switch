import { useEffect, useMemo, useRef, useState } from "react";
import type { Beneficiary } from "../domain/types";
import { beneficiaryTitle, searchBeneficiaries } from "../lib/beneficiaries";

type Props = {
  beneficiaries: Beneficiary[];
  selectedId: string;
  onSelect: (b: Beneficiary) => void;
  onClear: () => void;
  provinceName: (id: string) => string;
};

export function BeneficiaryPicker({
  beneficiaries,
  selectedId,
  onSelect,
  onClear,
  provinceName,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const selected = beneficiaries.find((b) => b.id === selectedId);
  const matches = useMemo(
    () => searchBeneficiaries(beneficiaries, query).slice(0, 8),
    [beneficiaries, query],
  );

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="suggest" ref={box}>
      <label className="field">
        Buscar cliente o beneficiario
        <input
          value={query}
          placeholder="Nombre o teléfono"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </label>
      {selected ? (
        <div className="suggest-chip">
          <span>
            Usando <strong>{beneficiaryTitle(selected)}</strong>
            {selected.provinceId ? ` · ${provinceName(selected.provinceId)}` : ""}
          </span>
          <button type="button" className="btn ghost" onClick={onClear}>
            Quitar
          </button>
        </div>
      ) : null}
      {open && matches.length > 0 ? (
        <div className="suggest-list" role="listbox">
          {matches.map((b) => (
            <button
              key={b.id}
              type="button"
              className={b.id === selectedId ? "active" : ""}
              onClick={() => {
                onSelect(b);
                setQuery("");
                setOpen(false);
              }}
            >
              <strong>{beneficiaryTitle(b)}</strong>
              <small>
                {b.contactPhone}
                {b.cubaCardNumber ? ` · **** ${b.cubaCardNumber.replace(/\D/g, "").slice(-4)}` : ""}
                {b.address ? ` · ${b.address}` : ""}
                {b.cubaAddress ? ` · Cuba: ${b.cubaAddress}` : ""}
              </small>
            </button>
          ))}
        </div>
      ) : null}
      {open && query.trim() && matches.length === 0 ? (
        <p className="muted" style={{ margin: "6px 0 0" }}>
          No hay coincidencias. Completa los datos y se guardarán al crear la operación.
        </p>
      ) : null}
    </div>
  );
}
