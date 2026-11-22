const fs = require("fs").promises;

class PDFLoader {
  constructor(filePath, { splitPages = true } = {}) {
    this.filePath = filePath;
    this.splitPages = splitPages;
  }

  async load() {
    const buffer = await fs.readFile(this.filePath);
    const { getDocument, version } = await this.getPdfJS();

    const pdf = await getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;

    const meta = await pdf.getMetadata().catch(() => null);
    const documents = [];

    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      if (content.items.length === 0) {
        continue;
      }

      let lastY;
      let lastEnd;
      const textItems = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const [, , c, d, x, y] = item.transform;
        if (lastY !== undefined && y !== lastY) {
          textItems.push("\n");
        } else if (
          lastEnd !== undefined &&
          x - lastEnd > Math.hypot(c, d) * 0.15 &&
          !/\s$/.test(textItems.at(-1) ?? "") &&
          !/^\s/.test(item.str)
        ) {
          // Runs on one baseline with a visible gap between them (table cells,
          // columns, tab stops) have no space character to separate them.
          // A gap under 0.15em is kerning inside a word, so it gets none.
          textItems.push(" ");
        }
        textItems.push(item.str);
        lastY = y;
        lastEnd = x + item.width;
      }

      const text = textItems.join("");
      documents.push({
        pageContent: text.trim(),
        metadata: {
          source: this.filePath,
          pdf: {
            version,
            info: meta?.info,
            metadata: meta?.metadata,
            totalPages: pdf.numPages,
          },
          loc: { pageNumber: i },
        },
      });
    }

    if (this.splitPages) {
      return documents;
    }

    if (documents.length === 0) {
      return [];
    }

    return [
      {
        pageContent: documents.map((doc) => doc.pageContent).join("\n\n"),
        metadata: {
          source: this.filePath,
          pdf: {
            version,
            info: meta?.info,
            metadata: meta?.metadata,
            totalPages: pdf.numPages,
          },
        },
      },
    ];
  }

  async getPdfJS() {
    try {
      const pdfjs = await import("pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js");
      return { getDocument: pdfjs.getDocument, version: pdfjs.version };
    } catch (e) {
      console.error(e);
      throw new Error(
        "Failed to load pdf-parse. Please install it with eg. `npm install pdf-parse`."
      );
    }
  }
}

module.exports = PDFLoader;
