# PDF Editor

Editor de PDF no browser: importa o PDF para um **documento editável**
com layout de páginas fixo (UX tipo Word). No fim exporta um **PDF novo**
com fundo raster + **texto vetorial**.

**Live demo:** https://fidas999.github.io/pdf-editor/

**Repositório:** https://github.com/Fidas999/pdf-editor

## Ideia do produto

Não convertas para Word com reflow. Abre o PDF, edita o conteúdo na própria
superfície do documento (posições fixas) e guarda o resultado. O export
gera um ficheiro novo a partir do que estás a ver no editor.

## Fluxo

1. **Upload** — escolhe ou arrasta um PDF
2. **Editor** — tipografia, ferramentas, propriedades (vista separada no mesmo SPA)
3. **Exportar** — PDF (texto vetorial), PNG ou JPEG

## Funcionalidades

### Abrir e navegar
- Abrir PDF (clique ou drag & drop), multi-página
- Zoom, undo / redo

### Tipografia (tipo Word)
- Ribbon: família, tamanho, negrito, itálico, cor, alinhamento
- Matching local de fontes do PDF → catálogo (Inter, Roboto, Times, …)
- Botão **Sugerir fonte** (local; AI se `VITE_FONT_AI_URL` estiver definida)
- OCR local (Tesseract) em zonas com codificação partida

### Edição
- Texto, formas, tabela, imagem, apagar
- Layout das páginas mantém-se

### Exportar
| Formato | Resultado |
|--------|-----------|
| **PDF** | Fundo raster + texto vetorial embutido |
| **PNG / JPEG** | Uma imagem por página |

## Font AI (opcional)

Define no `.env`:

```
VITE_FONT_AI_URL=https://seu-endpoint/match-font
VITE_FONT_AI_KEY=opcional
```

O endpoint deve aceitar POST JSON `{ fontName, imageDataUrl, catalog, localHint }`
e devolver `{ suggestions: [{ id, confidence, reason? }] }` com `id` do catálogo.

## Limitações

- Fontes proprietárias são **aproximadas** pelo catálogo (nunca 100% iguais sem a fonte original).
- Reescrever o content stream interno do PDF original não é fiável no browser.

## Stack

- Vite + React + TypeScript
- pdf.js, Fabric.js, pdf-lib, Tesseract.js, Zustand, Tailwind

## Desenvolvimento

```bash
npm install
npm run dev
```

```bash
npm run build
npm run preview
```

## Deploy

Push a `main` → GitHub Actions → Pages em `/pdf-editor/`.
Ativar uma vez: **Settings → Pages → Source → GitHub Actions**.
