/* eslint-env jest, node */
const fs = require("fs");
const os = require("os");
const path = require("path");
const PDFLoader = require("../../../../processSingleFile/convert/asPDF/PDFLoader");

/**
 * Builds a one-page PDF where every entry in `runs` is drawn as its own text
 * object at an absolute position, the way PDF writers lay out table cells and
 * columns: separate runs on a shared baseline with no space character between.
 * @param {{text: string, x: number, y: number, font?: "F1"|"F2"}[]} runs
 */
function buildPdf(runs) {
  const stream = runs
    .map(
      ({ text, x, y, font = "F1" }) =>
        `BT /${font} 12 Tf 1 0 0 1 ${x} ${y} Tm (${text}) Tj ET`
    )
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${
    objects.length + 1
  } /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

describe("PDFLoader", () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdfloader-"));
    // getPdfJS() uses a dynamic import(), which Jest's CommonJS runtime cannot
    // load. Hand it the same bundled pdf.js build through require() instead.
    jest.spyOn(PDFLoader.prototype, "getPdfJS").mockImplementation(async () => {
      const pdfjs = require("pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js");
      return { getDocument: pdfjs.getDocument, version: pdfjs.version };
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function loadText(name, runs) {
    const filePath = path.join(tmpDir, `${name}.pdf`);
    fs.writeFileSync(filePath, buildPdf(runs));
    const [doc] = await new PDFLoader(filePath).load();
    return doc.pageContent;
  }

  it("separates table cells that share a baseline", async () => {
    const text = await loadText("table", [
      { text: "Product", x: 72, y: 700 },
      { text: "Units", x: 172, y: 700 },
      { text: "Price", x: 272, y: 700 },
      { text: "Widget", x: 72, y: 680 },
      { text: "42", x: 172, y: 680 },
      { text: "9.99", x: 272, y: 680 },
    ]);

    expect(text).toBe("Product Units Price\nWidget 42 9.99");
  });

  it("does not split a word whose runs touch, such as a font change mid-word", async () => {
    // "Bold" in Helvetica-Bold is 26.676pt wide at 12pt, so "face" starts
    // exactly where it ends.
    const text = await loadText("touching", [
      { text: "Bold", x: 72, y: 700, font: "F2" },
      { text: "face type", x: 98.676, y: 700 },
    ]);

    expect(text).toBe("Boldface type");
  });

  it("does not add a second space when a run already ends with one", async () => {
    const text = await loadText("spaced", [
      { text: "Hello ", x: 72, y: 700 },
      { text: "world", x: 120, y: 700 },
    ]);

    expect(text).toBe("Hello world");
  });

  it("keeps one line per baseline", async () => {
    const text = await loadText("lines", [
      { text: "Line one", x: 72, y: 700 },
      { text: "Line two", x: 72, y: 680 },
    ]);

    expect(text).toBe("Line one\nLine two");
  });
});
