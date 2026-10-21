import { useEffect, useState } from "react";
import type { Operation } from "../domain/types";
import { sendOperationCloseNotice } from "../lib/cuba-send";
import { closeCycleEmailHtml } from "../lib/email-template";
import { advisorCloseEmailText, clientConfirmationText, whatsappUrl } from "../lib/whatsapp";

export function ClientNotifyPanel({
  operation,
  provinceName,
  references,
  advisorName,
  advisorEmail,
  canClose,
  confirmWhy,
  onConfirm,
}: {
  operation: Operation;
  provinceName?: string;
  references: string[];
  advisorName: string;
  advisorEmail: string;
  canClose: boolean;
  confirmWhy?: string | null;
  onConfirm?: () => void;
}) {
  const [phone, setPhone] = useState(operation.contactPhone);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPhone(operation.contactPhone);
  }, [operation.id, operation.contactPhone]);

  const body = clientConfirmationText({
    kind: operation.kind,
    code: operation.trackingCode,
    contactName: operation.contactName,
    amountGyn: operation.amountGyn,
    amountCup: operation.amountCup,
    amountUsd: operation.amountUsd,
    cubaPhone: operation.cubaPhone,
    cubaRecipientName: operation.cubaRecipientName,
    cubaCardNumber: operation.cubaCardNumber,
    cubaAddress: operation.cubaAddress,
    provinceName,
    references,
  });
  const advisorText = advisorCloseEmailText({ advisorName, clientText: body });
  const advisorHtml = closeCycleEmailHtml({
    advisorName,
    operation,
    provinceName,
    references,
  });
  const pending = operation.status !== "confirmed";
  const blocked = Boolean(confirmWhy);

  async function notify(afterConfirm = false) {
    if (!phone.trim()) {
      setError("Indica el WhatsApp del contacto en Guyana u otro número.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (afterConfirm) onConfirm?.();
      const result = await sendOperationCloseNotice({
        phone,
        text: body,
        advisorEmail,
        advisorText,
        advisorHtml,
        code: operation.trackingCode,
        operationId: operation.id,
      });
      if (result.waMeUrl) window.open(result.waMeUrl, "_blank", "noopener,noreferrer");
      const wa = result.cloudSent
        ? "WhatsApp enviado al contacto de Guyana."
        : "Se abrió WhatsApp para el contacto de Guyana.";
      const mail = advisorEmail
        ? result.emailed
          ? ` Correo enviado al asesor (${advisorEmail}).`
          : " El correo al asesor se enviará cuando esté t-transfer@gmail.com en el servidor."
        : " El asesor no tiene correo registrado.";
      setNotice(`${wa}${mail}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo avisar.");
    } finally {
      setBusy(false);
    }
  }

  if (!canClose) return null;

  if (!pending) {
    return (
      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {error ? <div className="error">{error}</div> : null}
        {notice ? <p className="muted">{notice}</p> : null}
        <div className="row">
          <button
            className="btn primary"
            type="button"
            disabled={busy || !phone.trim()}
            onClick={() => void notify()}
          >
            {busy ? "Enviando…" : "Enviar notificación"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
      <p className="muted" style={{ margin: 0 }}>
        Al completar: WhatsApp al contacto de Guyana y correo al asesor desde t-transfer@gmail.com para cerrar el ciclo.
        {operation.kind === "cash_cup" || operation.kind === "cash_usd"
          ? " En efectivo el mensaje incluye quién recibe."
          : ""}
      </p>
      {error ? <div className="error">{error}</div> : null}
      {notice ? <p className="muted">{notice}</p> : null}
      <label className="field">
        WhatsApp del contacto
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+592 ..."
        />
      </label>
      <p className="muted" style={{ margin: 0 }}>
        Correo al asesor: {advisorEmail || "sin email en Operadores"}
        {advisorName ? ` · ${advisorName}` : ""}
      </p>
      <pre className="wa-preview">{body}</pre>
      <div className="row">
        <button
          className="btn primary"
          type="button"
          disabled={busy || blocked}
          onClick={() => void notify(true)}
        >
          {busy ? "Enviando…" : "Marcar confirmada y avisar"}
        </button>
        {phone.trim() ? (
          <a className="btn ghost" href={whatsappUrl(body, phone)} target="_blank" rel="noreferrer">
            Abrir WhatsApp
          </a>
        ) : null}
      </div>
      {confirmWhy ? <p className="muted">{confirmWhy}</p> : null}
    </div>
  );
}
