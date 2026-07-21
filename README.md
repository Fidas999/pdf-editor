# PDF Editor

Editor de PDF no browser: importa o PDF para um **documento editável único**
(sem layer por cima do PDF original). No fim exporta um **PDF novo e plano**,
PNG ou JPEG.

**Live demo:** https://fidas999.github.io/pdf-editor/

**Repositório:** https://github.com/Fidas999/pdf-editor

## Ideia do produto

Não convertas para Word. Abre o PDF, edita o conteúdo na própria superfície do
documento e guarda o resultado. O export **não** carimba uma camada em cima do
PDF antigo — gera um ficheiro novo a partir do que estás a ver no editor.

## Funcionalidades

### Abrir e navegar
- Abrir PDF (clique ou drag & drop), multi-página
- Zoom

### Edição (documento único)
- Ao abrir, o PDF é **importado** para o editor (pdf.js só é usado off-screen)
- Texto, linhas e imagens tornam-se objetos selecionáveis
- Se a tipografia do PDF tiver codificação partida, o texto aparece como recorte
  visual fiel — **duplo-clique** converte essa zona em texto editável (OCR local)
- Ferramentas: texto, formas, tabela, imagem, apagar
- Undo / redo (Ctrl+Z / Ctrl+Y)
- Negrito / itálico / tamanho no painel de propriedades

### Exportar
| Formato | Resultado |
|--------|-----------|
| **PDF** | PDF **novo e plano**, uma página por ficheiro |
| **PNG / JPEG** | Uma imagem por página |

Se houver várias páginas e o total &gt; 1MB → ZIP.

## Limitações

- Em PDFs com fontes proprietárias, o texto editável após duplo-clique usa fontes
  standard (Helvetica/Arial), não a fonte embutida original do PDF.
- Reescrever o *content stream* interno do PDF original (como o Acrobat) não é
  fiável no browser; por isso o fluxo é: **importar → editar documento → exportar PDF novo**.

## Stack

- Vite + React + TypeScript
- pdf.js (importação off-screen)
- Fabric.js (documento editável)
- pdf-lib (PDF plano de saída)
- JSZip, Tesseract.js (OCR pontual), Tailwind, Zustand

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
