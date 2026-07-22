/**
 * Catalog of web-safe / open-source fonts used for matching PDF typefaces
 * and for Fabric + pdf-lib embedding.
 */

export type FontCategory = "sans" | "serif" | "mono";

export type PdfStandardFont = "Helvetica" | "TimesRoman" | "Courier";

export interface CatalogFont {
  id: string;
  label: string;
  /** CSS font-family value used in Fabric / the editor. */
  cssFamily: string;
  category: FontCategory;
  /** Patterns matched against PDF font names (pdf.js). */
  aliases: RegExp[];
  /** Base confidence when an alias matches (0–1). */
  aliasConfidence: number;
  /** Google Fonts family name for CSS loading, if any. */
  googleFamily?: string;
  /**
   * TTF URL for pdf-lib embedding (latin 400). Prefer jsDelivr fontsource.
   * Omit when using a PDF standard font only.
   */
  embedUrl?: string;
  /** Map to a pdf-lib standard font when embedding custom bytes isn't needed. */
  pdfStandard?: PdfStandardFont;
}

export const FONT_CATALOG: CatalogFont[] = [
  {
    id: "helvetica",
    label: "Helvetica",
    cssFamily: "Helvetica, Arial, sans-serif",
    category: "sans",
    aliases: [/helvetica/i, /arialmt\b/i],
    aliasConfidence: 0.92,
    pdfStandard: "Helvetica",
  },
  {
    id: "arial",
    label: "Arial",
    cssFamily: "Arial, Helvetica, sans-serif",
    category: "sans",
    aliases: [/\barial\b/i],
    aliasConfidence: 0.9,
    pdfStandard: "Helvetica",
  },
  {
    id: "inter",
    label: "Inter",
    cssFamily: '"Inter", Helvetica, Arial, sans-serif',
    category: "sans",
    aliases: [/\binter\b/i],
    aliasConfidence: 0.88,
    googleFamily: "Inter",
    embedUrl:
      "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf",
  },
  {
    id: "roboto",
    label: "Roboto",
    cssFamily: '"Roboto", Helvetica, Arial, sans-serif',
    category: "sans",
    aliases: [/\broboto\b/i],
    aliasConfidence: 0.9,
    googleFamily: "Roboto",
    embedUrl:
      "https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-400-normal.ttf",
  },
  {
    id: "open-sans",
    label: "Open Sans",
    cssFamily: '"Open Sans", Helvetica, Arial, sans-serif',
    category: "sans",
    aliases: [/open\s*sans/i],
    aliasConfidence: 0.9,
    googleFamily: "Open Sans",
    embedUrl:
      "https://cdn.jsdelivr.net/fontsource/fonts/open-sans@latest/latin-400-normal.ttf",
  },
  {
    id: "lato",
    label: "Lato",
    cssFamily: '"Lato", Helvetica, Arial, sans-serif',
    category: "sans",
    aliases: [/\blato\b/i],
    aliasConfidence: 0.88,
    googleFamily: "Lato",
    embedUrl:
      "https://cdn.jsdelivr.net/fontsource/fonts/lato@latest/latin-400-normal.ttf",
  },
  {
    id: "montserrat",
    label: "Montserrat",
    cssFamily: '"Montserrat", Helvetica, Arial, sans-serif',
    category: "sans",
    aliases: [/montserrat/i],
    aliasConfidence: 0.88,
    googleFamily: "Montserrat",
    embedUrl:
      "https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-400-normal.ttf",
  },
  {
    id: "carlito",
    label: "Carlito",
    cssFamily: '"Carlito", Calibri, sans-serif',
    category: "sans",
    aliases: [/calibri/i, /carlito/i],
    aliasConfidence: 0.86,
    googleFamily: "Carlito",
    embedUrl:
      "https://cdn.jsdelivr.net/fontsource/fonts/carlito@latest/latin-400-normal.ttf",
  },
  {
    id: "liberation-sans",
    label: "Liberation Sans",
    cssFamily: '"Liberation Sans", Arial, Helvetica, sans-serif',
    category: "sans",
    aliases: [/liberation\s*sans/i],
    aliasConfidence: 0.85,
    // Prefer Arial/Helvetica standard when Liberation isn't embedded
    pdfStandard: "Helvetica",
  },
  {
    id: "verdana",
    label: "Verdana",
    cssFamily: "Verdana, Geneva, sans-serif",
    category: "sans",
    aliases: [/verdana/i],
    aliasConfidence: 0.88,
    pdfStandard: "Helvetica",
  },
  {
    id: "times",
    label: "Times New Roman",
    cssFamily: '"Times New Roman", Times, serif',
    category: "serif",
    aliases: [/times/i, /timesnewroman/i, /tinos/i],
    aliasConfidence: 0.9,
    pdfStandard: "TimesRoman",
  },
  {
    id: "georgia",
    label: "Georgia",
    cssFamily: "Georgia, Times, serif",
    category: "serif",
    aliases: [/georgia/i],
    aliasConfidence: 0.88,
    pdfStandard: "TimesRoman",
  },
  {
    id: "merriweather",
    label: "Merriweather",
    cssFamily: '"Merriweather", Georgia, serif',
    category: "serif",
    aliases: [/merriweather/i],
    aliasConfidence: 0.86,
    googleFamily: "Merriweather",
    embedUrl:
      "https://cdn.jsdelivr.net/fontsource/fonts/merriweather@latest/latin-400-normal.ttf",
  },
  {
    id: "libre-baskerville",
    label: "Libre Baskerville",
    cssFamily: '"Libre Baskerville", Georgia, serif',
    category: "serif",
    aliases: [/baskerville/i, /libre\s*baskerville/i],
    aliasConfidence: 0.84,
    googleFamily: "Libre Baskerville",
    embedUrl:
      "https://cdn.jsdelivr.net/fontsource/fonts/libre-baskerville@latest/latin-400-normal.ttf",
  },
  {
    id: "courier",
    label: "Courier New",
    cssFamily: '"Courier New", Courier, monospace',
    category: "mono",
    aliases: [/courier/i, /consolas/i, /menlo/i],
    aliasConfidence: 0.9,
    pdfStandard: "Courier",
  },
  {
    id: "roboto-mono",
    label: "Roboto Mono",
    cssFamily: '"Roboto Mono", "Courier New", monospace',
    category: "mono",
    aliases: [/roboto\s*mono/i],
    aliasConfidence: 0.88,
    googleFamily: "Roboto Mono",
    embedUrl:
      "https://cdn.jsdelivr.net/fontsource/fonts/roboto-mono@latest/latin-400-normal.ttf",
  },
  {
    id: "source-code-pro",
    label: "Source Code Pro",
    cssFamily: '"Source Code Pro", "Courier New", monospace',
    category: "mono",
    aliases: [/source\s*code/i, /sourcecodepro/i],
    aliasConfidence: 0.86,
    googleFamily: "Source Code Pro",
    embedUrl:
      "https://cdn.jsdelivr.net/fontsource/fonts/source-code-pro@latest/latin-400-normal.ttf",
  },
];

/** Default fallback when nothing matches. */
export const DEFAULT_FONT = FONT_CATALOG[0];

export function findFontById(id: string): CatalogFont | undefined {
  return FONT_CATALOG.find((f) => f.id === id);
}

export function findFontByCssFamily(cssFamily: string): CatalogFont | undefined {
  const norm = cssFamily.toLowerCase();
  return FONT_CATALOG.find(
    (f) =>
      f.cssFamily.toLowerCase() === norm ||
      norm.includes(f.label.toLowerCase()) ||
      (f.googleFamily && norm.includes(f.googleFamily.toLowerCase()))
  );
}

/** Google Fonts CSS URL for all catalog entries that need web fonts. */
export function googleFontsStylesheetUrl(): string {
  const families = FONT_CATALOG.filter((f) => f.googleFamily).map((f) => {
    const name = (f.googleFamily as string).replace(/ /g, "+");
    return `family=${name}:ital,wght@0,400;0,700;1,400;1,700`;
  });
  const unique = [...new Set(families)];
  return `https://fonts.googleapis.com/css2?${unique.join("&")}&display=swap`;
}
