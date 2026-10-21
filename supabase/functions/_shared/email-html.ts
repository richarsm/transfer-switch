export type EmailField = { label: string; value: string };

export const EMAIL_LOGO_CID = "logo@t-transfer";
export const EMAIL_LOGO_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAABTklEQVR42u3cwW3DMBBEUVaRKnJOcS4vzaQM5+67MMPdJ2AL0H+QQFqyznno+Pr5fk+a03pMC30FzPboMQyRgxDCBhEEDSGIGIQQLowgWhBAsCCCUEEEgcII4gQBhAkjiAJgL4AgYQQxAAAwAACYAIAQYYSpJ/b3+wKQCv85AMIAzQhnQ/xmhDVXQCsCAAC7EVYCNCGM3gfcgDB6J3wDwkmefMOMA7glfAsCgEkAN8ZPI7gC3IIArF0F2QcYAAAAiAAAgAEAwAAAYAAAMAAAGAAADAAAXS9RTXyCdoTPQgDYDOA9IleAWxAAK6Ddq6Db/tGyeh8AAML8nyIAQAAAAAKAG798MvJ5AABfwHoWwHfjwvEBAAAgBgAAJggAIRwfAAAAEMLxARQAQAjHh1AQH0JBfAAFABDC8UEUhIdQEh9CQXwQBeFhlETfCPNUp38QxM4FDv4AMgAAAABJRU5ErkJggg==";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function brandedEmailHtml(input: {
  heading: string;
  intro?: string;
  fields?: EmailField[];
  note?: string;
  helpTitle?: string;
}): string {
  const fields = (input.fields ?? []).filter((f) => f.value.trim());
  const fieldRows = fields
    .map(
      (f, i) => `
        <tr>
          <td style="padding:${i === 0 ? "22px" : "8px"} 24px 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.04em;color:#d7b56a;">
            ${esc(f.label)}
          </td>
        </tr>
        <tr>
          <td style="padding:4px 24px ${i === fields.length - 1 ? "22px" : "10px"} 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:600;color:#fffaf3;line-height:1.4;">
            ${esc(f.value).replace(/\n/g, "<br>")}
          </td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>T-Transfer</title>
</head>
<body style="margin:0;padding:0;background:#e7e0d2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e7e0d2;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px;background:#f3eee4;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 8px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="44" height="44" style="width:44px;height:44px;">
                    <img src="cid:${EMAIL_LOGO_CID}" width="44" height="44" alt="T-Transfer" style="display:block;border:0;width:44px;height:44px;border-radius:12px;">
                  </td>
                  <td style="padding-left:12px;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#16362c;">T-Transfer</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 8px 28px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;font-weight:700;color:#16362c;">
              ${esc(input.heading)}
            </td>
          </tr>
          ${
            input.intro
              ? `<tr><td style="padding:8px 28px 20px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#3d5248;">${esc(input.intro)}</td></tr>`
              : ""
          }
          ${
            fieldRows
              ? `<tr><td style="padding:0 28px 8px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#16362c;border-radius:16px;">
              ${fieldRows}
            </table>
          </td></tr>`
              : ""
          }
          ${
            input.note
              ? `${
                  input.helpTitle === ""
                    ? ""
                    : `<tr><td style="padding:18px 28px 4px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#16362c;">${esc(input.helpTitle || "¿Algún problema con esta operación?")}</td></tr>`
                }
          <tr><td style="padding:${input.helpTitle === "" ? "18px" : "4px"} 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#3d5248;">${esc(input.note)}</td></tr>`
              : ""
          }
          <tr>
            <td style="padding:20px 28px 28px 28px;border-top:1px solid #cfc4b0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#3d5248;">
              GYN → CUP · reloj de Cuba<br>
              T-Transfer
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function htmlFromPlainText(heading: string, text: string, intro?: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fields: EmailField[] = [];
  const leftover: string[] = [];
  for (const line of lines) {
    if (/^t-transfer$/i.test(line)) continue;
    const split = line.search(/:\s/);
    if (split > 0 && split < 40 && !line.startsWith("-")) {
      fields.push({ label: line.slice(0, split).trim(), value: line.slice(split + 1).trim() });
    } else if (line.startsWith("- ")) {
      const body = line.slice(2);
      const inner = body.search(/:\s/);
      if (inner > 0) {
        fields.push({ label: body.slice(0, inner).trim(), value: body.slice(inner + 1).trim() });
      } else leftover.push(body);
    } else leftover.push(line);
  }
  if (fields.length && leftover[0] && /^[A-Z0-9][A-Z0-9-]{3,24}$/.test(leftover[0])) {
    fields.unshift({ label: "Código", value: leftover.shift() as string });
  }
  return brandedEmailHtml({
    heading,
    intro: intro || leftover.filter((l) => !/^por tipo:?$/i.test(l)).slice(0, 4).join(" "),
    fields,
  });
}
