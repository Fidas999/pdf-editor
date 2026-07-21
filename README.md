# PDF Editor

A browser-based PDF editor. Open a PDF and **edit its existing text**, erase
content (text, shapes, images), fill form fields, and add new overlays. When
you finish, export as **PDF, PNG, or JPEG** — each page becomes its own unique
file, and multi-page exports larger than **1MB** are packed into a ZIP.

**Live demo:** https://fidas999.github.io/pdf-editor/

**Repository:** https://github.com/Fidas999/pdf-editor

## Features

### Open & navigate
- Open any PDF (single or multi-page) — click **Open PDF** or drag & drop.
- Continuous scroll through all pages; each page keeps its own editable layer.
- Zoom in / out from the toolbar.

### Edit existing PDF content
- **Full text rebuild** — on open, original text is covered and replaced by
  editable text boxes so you can change the document for real (not only draw
  on top).
- **Style matching** — font size, bold, and italic are detected from the PDF
  font name when available; Bold/Italic toggles are in the Properties panel.
- **OCR fallback** — if the PDF uses broken/custom encodings (garbled extract),
  the app OCRs the rendered page (Portuguese + English) and estimates bold from
  ink density. First OCR on a page can take a few seconds.
- **Delete text** — removing a text box leaves a white cover so the original
  does not return.
- **Erase tool** — cover remaining background shapes, logos, barcodes or images.
- **Form fields** — AcroForm text fields become editable when present.
- **Add new content** — text, shapes, table, image.

### Editing tools
- **Select** — click and drag objects; multi-select with the selection box.
- **Text** — add new text boxes.
- **Square / Rounded / Circle** — shapes with fill, border, radius controls.
- **Table** — grid with configurable rows and columns.
- **Image** — import via toolbar or drop an image onto a page.
- **Erase** — paint white covers over original content you want removed.
- **Delete** — toolbar button or **Delete / Backspace**.
- Drag to move, corner handles to resize, top handle to rotate.
- Opacity control for selected objects.
- Escape / `V` returns to Select.

### Undo & redo
- Toolbar buttons, or **Ctrl+Z** / **Ctrl+Y** (or **Ctrl+Shift+Z**).
- History covers add, move, resize, erase, delete and property edits (up to 60
  steps).

### Properties panel
- Text / PDF text / form fields: font size, color
- Shapes: fill, border, width, corner radius
- Tables: rows, columns
- Erase regions: guidance to resize/move/delete
- All: opacity

### Export
| Format | Result |
|--------|--------|
| **PDF (per page)** | Each edited page saved as its own PDF (`name-edited-page-1.pdf`, …). |
| **PNG image** | One high-resolution PNG per page. |
| **JPEG image** | One high-resolution JPEG per page (white background). |

**ZIP rule:** more than one page **and** combined size **> 1MB** → single ZIP
(`name-edited-pages.zip`). Single-page documents download as one file.

Edits, erasures and overlays are baked into every exported page.

## Important limitations

- Logos, vector lines and barcodes stay on the PDF background until you
  **Erase** them — only text is fully rebuilt as editable objects.
- Style matching is heuristic (font names + ink density), not a generative AI
  model. You can still toggle Bold/Italic manually.
- OCR needs a network download of language data the first time (Tesseract).
- Scanned image-only pages rely entirely on OCR quality.
- Exported overlays are rasterized for WYSIWYG fidelity.

## Tech stack

- Vite + React + TypeScript
- pdf.js (`pdfjs-dist`) — render pages + extract text
- Fabric.js — interactive editing overlay
- pdf-lib — export PDFs + read form fields
- JSZip — pack multi-page exports over 1MB
- Tailwind CSS + Zustand

## Getting started

Requires Node.js 18+.

```bash
npm install
npm run dev
```

Open the printed local URL (default http://localhost:5173).

## Build

```bash
npm run build
npm run preview
```

## Deployment

Pushing to `main` runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
and publishes to GitHub Pages at `/pdf-editor/`.

Enable once: **Settings → Pages → Source → GitHub Actions**.

## How it works

1. pdf.js renders each page as a background canvas.
2. Text (and form fields) are extracted into a Fabric.js overlay.
3. Erase regions and new objects live on the same overlay.
4. Export stamps the overlay (erasures + edits) onto the original pages, then
   splits into one file per page (ZIP if total &gt; 1MB).
