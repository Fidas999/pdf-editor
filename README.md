# PDF Editor

A browser-based PDF editor. Open a PDF, then add, drag, resize, rotate and
delete **text, shapes (square, rounded square, circle), tables and images** on
top of any page, and export a new PDF with your edits baked in.

Existing PDF content is preserved as a background layer; everything you add
lives on an editable overlay, so nothing in the original document is destroyed.

**Live demo:** https://fidas999.github.io/pdf-editor/

## Features

- Open any PDF (multi-page) — click to browse or drag & drop.
- Add elements: text, square, rounded square, circle/ellipse, table, image.
- Drag to move, corner handles to resize, top handle to rotate.
- Multi-select and delete (Delete/Backspace or the toolbar button).
- Undo / redo (toolbar buttons or Ctrl+Z / Ctrl+Y, Ctrl+Shift+Z to redo).
- Edit properties: fill, border color, border width, corner radius, font
  size/color, table rows & columns, and opacity.
- Import images via the toolbar or by dropping an image file onto a page.
- Per-page overlays for multi-page documents.
- Zoom in/out and export as **PDF, PNG, or JPEG** (one image file per page for
  multi-page documents).

## Tech stack

- [Vite](https://vitejs.dev/) + React + TypeScript
- [pdf.js](https://mozilla.github.io/pdf.js/) (`pdfjs-dist`) to render pages
- [Fabric.js](http://fabricjs.com/) for the interactive overlay
- [pdf-lib](https://pdf-lib.js.org/) to generate the exported PDF
- Tailwind CSS for the UI

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

To enable it once: in the repository, go to **Settings -> Pages -> Build and
deployment -> Source** and select **GitHub Actions**.

## How editing/export works

Each page is rendered by pdf.js into a background canvas. A transparent
Fabric.js canvas of the same size sits on top and holds your editable objects.
On export, every page's overlay is rendered at high resolution and stamped over
the corresponding page of the original PDF with pdf-lib, producing a faithful,
WYSIWYG result for shapes, tables, images and text. PNG/JPEG export instead
re-renders each page background with pdf.js and composites the overlay on top,
downloading one image per page.

## Notes

- Editing is overlay-based: you add/move/delete new elements on top of pages.
  The tool does not reflow or re-type the original embedded text.
- Exported overlays are rasterized at 2x for crisp output; added text is drawn
  as an image rather than selectable text.
