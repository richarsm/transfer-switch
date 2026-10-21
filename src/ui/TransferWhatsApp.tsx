import { useEffect, useState } from "react";
import { formatCardNumber } from "../lib/cards";
import {
  canSendTransferWhatsApp,
  transferWhatsAppText,
  whatsappUrl,
} from "../lib/whatsapp";

type Props = {
  isAdmin: boolean;
  trackingCode?: string;
  cubaCardNumber: string;
  cubaRecipientName: string;
  cubaPhone: string;
  onSave: (input: {
    cubaCardNumber: string;
    cubaRecipientName: string;
    cubaPhone: string;
  }) => void;
  onManualSend?: (text: string) => void;
};

export function TransferWhatsAppPanel({
  isAdmin,
  trackingCode = "",
  cubaCardNumber,
  cubaRecipientName,
  cubaPhone,
  onSave,
  onManualSend,
}: Props) {
  const [card, setCard] = useState(formatCardNumber(cubaCardNumber));
  const [name, setName] = useState(cubaRecipientName);
  const [mobile, setMobile] = useState(cubaPhone);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCard(formatCardNumber(cubaCardNumber));
    setName(cubaRecipientName);
    setMobile(cubaPhone);
  }, [cubaCardNumber, cubaRecipientName, cubaPhone]);

  const payload = { card, name, mobile, code: trackingCode };
  const text = transferWhatsAppText(payload);
  const ready = canSendTransferWhatsApp(payload);

  function persist() {
    onSave({ cubaCardNumber: card, cubaRecipientName: name, cubaPhone: mobile });
  }

  function openWhatsApp(phone?: string) {
    persist();
    onManualSend?.(text);
    window.open(whatsappUrl(text, phone ?? ""), "_blank", "noopener,noreferrer");
  }

  async function copyText() {
    persist();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="card">
      <h2>Confirmación por WhatsApp</h2>
      <p className="muted">
        Formato Transfermóvil. El código {trackingCode || "TT-xxxx"} viaja en el mensaje para emparejar la respuesta.
      </p>
      <div className="grid-2">
        <label className="field">
          Tarjeta
          <input
            value={card}
            inputMode="numeric"
            placeholder="XXXX-XXXX-XXXX-XXXX"
            onChange={(e) => setCard(formatCardNumber(e.target.value))}
          />
        </label>
        <label className="field">
          Nombre
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Titular de la tarjeta" />
        </label>
      </div>
      <label className="field" style={{ marginTop: 14 }}>
        Móvil
        <input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+53 5 ..." />
      </label>
      <pre className="wa-preview">{text}</pre>
      {isAdmin ? (
        <div className="row">
          <button className="btn primary" type="button" disabled={!ready} onClick={() => openWhatsApp()}>
            Enviar por WhatsApp
          </button>
          <button className="btn ghost" type="button" disabled={!ready} onClick={() => openWhatsApp(mobile)}>
            Enviar al móvil cubano
          </button>
          <button className="btn ghost" type="button" disabled={!ready} onClick={() => void copyText()}>
            {copied ? "Copiado" : "Copiar texto"}
          </button>
          <button className="btn ghost" type="button" disabled={!ready} onClick={persist}>
            Guardar datos
          </button>
        </div>
      ) : (
        <div className="row">
          <button className="btn primary" type="button" disabled={!ready} onClick={persist}>
            Guardar datos
          </button>
          <p className="muted" style={{ margin: 0 }}>
            Solo el administrador puede enviar el WhatsApp.
          </p>
        </div>
      )}
    </section>
  );
}
