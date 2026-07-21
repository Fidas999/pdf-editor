# PDF Editor

A browser-based PDF editor. Open a PDF, then add, drag, resize, rotate and
delete **text, shapes (square, rounded square, circle), tables and images** on
top of any page. When you finish editing, export as **PDF, PNG, or JPEG** —
each page becomes its own unique file, and multi-page exports larger than
**1MB** are packed into a ZIP.

Existing PDF content is preserved as a background layer; everything you add
lives on an editable overlay, so nothing in the original document is destroyed.

**Live demo:** https://fidas999.github.io/pdf-editor/

**Repository:** https://github.com/Fidas999/pdf-editor

## Features

### Open & navigate
- Open any PDF (single or multi-page) — click **Open PDF** or drag & drop a
  file onto the workspace.
- Continuous scroll through all pages; each page keeps its own editable overlay.
- Zoom in / out from the toolbar.

### Editing tools
- **Select** — click and drag objects; multi-select with the selection box.
- **Text** — add editable text boxes; change font size and color in the
  properties panel.
- **Square** — rectangles with adjustable fill, border color and width.
- **Rounded square** — same as square, plus corner radius control.
- **Circle / ellipse** — resizable elliptical shapes.
- **Table** — grid with configurable rows and columns.
- **Image** — import via the toolbar button or by dropping an image file onto
  a page; resize and reposition freely.
- **Delete** — remove selected objects with the toolbar button or
  **Delete / Backspace**.
- Drag to move, corner handles to resize, top handle to rotate.
- Opacity control for any selected object.
- Escape / `V` returns to the Select tool.

### Undo & redo
- Toolbar **Undo** / **Redo** buttons.
- Keyboard: **Ctrl+Z** (undo), **Ctrl+Y** or **Ctrl+Shift+Z** (redo).
- History covers add, move, resize, rotate, delete and property edits across
  all pages (up to 60 steps).

### Properties panel
- Shows controls for the currently selected object:
  - Text: font size, color
  - Shapes: fill, border color, border width, corner radius (rounded)
  - Tables: rows, columns
  - All: opacity

### Export
Choose **Export** and pick a format:

| Format | Result |
|--------|--------|
| **PDF (per page)** | Each page of the edited document is saved as its own unique PDF (`name-edited-page-1.pdf`, …). |
| **PNG image** | One high-resolution PNG per page. |
| **JPEG image** | One high-resolution JPEG per page (white background). |

**ZIP rule:** if there is more than one page **and** the combined size of those
files exceeds **1MB**, they are downloaded as a single ZIP
(`name-edited-pages.zip`) instead of many separate downloads. A single-page
document always downloads as one file.

Edits (text, shapes, tables, images) are baked into every exported page.

## Tech stack

- [Vite](https://vitejs.dev/) + React + TypeScript
- [pdf.js](https://mozilla.github.io/pdf.js/) (`pdfjs-dist`) to render pages
- [Fabric.js](http://fabricjs.com/) for the interactive overlay
- [pdf-lib](https://pdf-lib.js.org/) to generate exported PDFs
- [JSZip](https://stuk.github.io/jszip/) to pack multi-page exports over 1MB
- Tailwind CSS for the UI
- Zustand for editor state

## Getting started

Requires Node.js 18+.

```bash
npm install
npm run dev
```

Then open the printed local URL (default http://localhost:5173).

## Build

```bash
npm run build      # type-check + production build into dist/
npm run preview    # preview the production build locally
```

## Deployment

Pushing to `main` triggers the GitHub Actions workflow in
[.github/workflows/deploy.yml](.github/workflows/deploy.yml), which builds the
app and publishes `dist/` to GitHub Pages. The Vite `base` is set to
`/pdf-editor/` for the Pages URL.

To enable it once: in the repository, go to **Settings → Pages → Build and
deployment → Source** and select **GitHub Actions**.

## How editing / export works

1. Each page is rendered by pdf.js into a background canvas.
2. A transparent Fabric.js canvas of the same size sits on top and holds your
   editable objects.
3. On **PDF** export, overlays are stamped onto the original PDF with pdf-lib,
   then the result is **split into one PDF per page**.
4. On **PNG / JPEG** export, each page background is re-rendered with pdf.js
   and the overlay is composited on top.
5. If multiple page files total more than **1MB**, JSZip packs them into one
   ZIP download.

## Notes

- Editing is overlay-based: you add / move / delete new elements on top of
  pages. The tool does not reflow or re-type the original embedded text.
- Exported overlays are rasterized at 2× for crisp output; added text is drawn
  as an image rather than selectable text in the PDF.
