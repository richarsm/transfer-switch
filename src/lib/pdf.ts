export type PdfCol = {
  label: string;
  width: number;
  align?: "left" | "right";
};

export type PdfRow = {
  cells: string[];
  tone?: "head" | "section" | "total" | "normal";
};

function pdfEscape(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (char === "\\" || char === "(" || char === ")") out += `\\${char}`;
    else if (code === 10 || code === 13) out += " ";
    else if (code < 128) out += char;
    else if (code <= 255) out += `\\${code.toString(8).padStart(3, "0")}`;
    else out += "?";
  }
  return out;
}

function clip(text: string, widthPt: number, size: number): string {
  const max = Math.max(4, Math.floor((widthPt - 10) / (size * 0.5)));
  return text.length > max ? `${text.slice(0, max - 1)}.` : text;
}

function color(tone: PdfRow["tone"]): { fill: string; text: string; bold: boolean } {
  if (tone === "head") return { fill: "0.09 0.21 0.17", text: "0.94 0.85 0.63", bold: true };
  if (tone === "section") return { fill: "0.93 0.90 0.84", text: "0.08 0.13 0.11", bold: true };
  if (tone === "total") return { fill: "0.86 0.91 0.88", text: "0.08 0.13 0.11", bold: true };
  return { fill: "1 1 1", text: "0.08 0.13 0.11", bold: false };
}

export function downloadTablePdf(input: {
  filename: string;
  title: string;
  subtitle: string[];
  columns: PdfCol[];
  rows: PdfRow[];
}) {
  const pageW = 792;
  const pageH = 612;
  const marginX = 32;
  const marginTop = 36;
  const rowH = 18;
  const headerH = 20;
  const tableW = input.columns.reduce((s, c) => s + c.width, 0);
  const pages: string[][] = [];
  let commands: string[] = [];
  let y = pageH - marginTop;

  function flush() {
    pages.push(commands);
    commands = [];
    y = pageH - marginTop;
  }

  function add(cmd: string) {
    commands.push(cmd);
  }

  function writeTitle() {
    add("BT");
    add("/F2 16 Tf");
    add(`${input.title ? "0.09 0.21 0.17" : "0"} rg`);
    add(`${marginX} ${y} Td`);
    add(`(${pdfEscape(input.title)}) Tj`);
    add("ET");
    y -= 18;
    for (const line of input.subtitle) {
      add("BT");
      add("/F1 10 Tf");
      add("0.24 0.32 0.28 rg");
      add(`${marginX} ${y} Td`);
      add(`(${pdfEscape(line)}) Tj`);
      add("ET");
      y -= 14;
    }
    y -= 8;
  }

  function drawRow(row: PdfRow, height: number) {
    if (y - height < 36) {
      flush();
      writeTitle();
      drawRow({ cells: input.columns.map((c) => c.label), tone: "head" }, headerH);
    }
    const { fill, text, bold } = color(row.tone);
    add(`${fill} rg`);
    add(`${marginX} ${y - height} ${tableW} ${height} re f`);
    add("0.55 0.55 0.5 RG 0.4 w");
    add(`${marginX} ${y - height} ${tableW} ${height} re S`);
    let x = marginX;
    const size = row.tone === "head" ? 8 : 8;
    const font = bold ? "/F2" : "/F1";
    const baseline = y - height + 6;
    input.columns.forEach((col, i) => {
      add("0.55 0.55 0.5 RG 0.4 w");
      add(`${x} ${y - height} ${col.width} ${height} re S`);
      const raw = row.cells[i] ?? "";
      const value = clip(raw, col.width, size);
      const textW = value.length * size * 0.5;
      const tx =
        col.align === "right" ? x + col.width - 6 - textW : x + 6;
      add("BT");
      add(`${font} ${size} Tf`);
      add(`${text} rg`);
      add(`${Math.max(x + 3, tx)} ${baseline} Td`);
      add(`(${pdfEscape(value)}) Tj`);
      add("ET");
      x += col.width;
    });
    y -= height;
  }

  writeTitle();
  drawRow({ cells: input.columns.map((c) => c.label), tone: "head" }, headerH);
  if (!input.rows.length) {
    drawRow(
      { cells: ["Sin operaciones de asesores en este dia.", "", "", "", "", "", ""], tone: "normal" },
      rowH,
    );
  } else {
    for (const row of input.rows) drawRow(row, rowH);
  }

  flush();

  const pageCount = pages.length;
  const pageObj = (i: number) => 3 + i;
  const contentObj = (i: number) => 3 + pageCount + i;
  const font1 = 3 + pageCount * 2;
  const font2 = font1 + 1;
  const objs: string[] = new Array(font2);

  objs[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[1] = `<< /Type /Pages /Kids [ ${pages.map((_, i) => `${pageObj(i)} 0 R`).join(" ")} ] /Count ${pageCount} >>`;
  pages.forEach((pageCmds, i) => {
    const stream = pageCmds.join("\n");
    objs[pageObj(i) - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> >> /Contents ${contentObj(i)} 0 R >>`;
    objs[contentObj(i) - 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  objs[font1 - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objs[font2 - 1] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  let body = "%PDF-1.4\n";
  const offsets = [0];
  objs.forEach((obj, i) => {
    offsets[i + 1] = body.length;
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let i = 1; i <= objs.length; i++) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  const url = URL.createObjectURL(new Blob([body], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = input.filename;
  link.click();
  URL.revokeObjectURL(url);
}
