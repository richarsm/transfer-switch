export function transferWhatsAppText(input: {
  card: string;
  name: string;
  mobile: string;
}): string {
  return `Tarjeta: ${formatCard(input.card)}\nNombre : ${input.name.trim()}\nMovil: ${input.mobile.trim()}`;
}

export function canSendTransferWhatsApp(input: {
  card: string;
  name: string;
  mobile: string;
}): boolean {
  return Boolean(input.card.replace(/\D/g, "") && input.name.trim() && input.mobile.trim());
}

export function whatsappDigits(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 8 && digits.startsWith("5")) return `53${digits}`;
  return digits;
}

export function whatsappUrl(text: string, phone = ""): string {
  const digits = whatsappDigits(phone);
  const encoded = encodeURIComponent(text);
  return digits ? `https://wa.me/${digits}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

function formatCard(card: string): string {
  const digits = card.replace(/\D/g, "");
  if (digits.length === 16) return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  return card.trim();
}
