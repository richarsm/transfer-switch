import { useEffect, useState } from "react";
import {
  canSendTransferWhatsApp,
  transferWhatsAppText,
  whatsappUrl,
} from "../lib/whatsapp";

type Props = {
  isAdmin: boolean;
  cubaCardNumber: string;
  cubaRecipientName: string;
  cubaPhone: string;
  onSave: (input: {
    cubaCardNumber: string;
    cubaRecipientName: string;
    cubaPhone: string;
  }) => void;
};

export function TransferWhatsAppPanel({
  isAdmin,
  cubaCardNumber,
  cubaRecipientName,
  cubaPhone,
  onSave,
}: Props) {
  const [card, setCard] = useState(cubaCardNumber);
  const [name, setName] = useState(cubaRecipientName);
  const [mobile, setMobile] = useState(cubaPhone);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCard(cubaCardNumber);
    setName(cubaRecipientName);
    setMobile(cubaPhone);
  }, [cubaCardNumber, cubaRecipientName, cubaPhone]);

  const payload = { card, name, mobile };
  const text = transferWhatsAppText(payload);
  const ready = canSendTransferWhatsApp(payload);

  function persist() {
    onSave({ cubaCardNumber: card, cubaRecipientName: name, cubaPhone: mobile });
  }

  function openWhatsApp(phone?: string) {
    persist();
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
        Datos del destinatario en Cuba. El administrador los envía en el formato de Transfermóvil.
      </p>
      <div className="grid-2">
        <label className="field">
          Tarjeta
          <input value={card} onChange={(e) => setCard(e.target.value)} placeholder="XXXX XXXX XXXX XXXX" />
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
