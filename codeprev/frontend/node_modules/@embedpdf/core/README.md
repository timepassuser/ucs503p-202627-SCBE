# @embedpdf/core

Core package for CloudPDF.

## Installation

```bash
npm install @embedpdf/core
```

## Usage

```typescript
import { PDFCore } from '@embedpdf/core';
import { createPdfiumModule, PdfiumEngine } from '@embedpdf/engines';
import { NavigationPlugin } from '@embedpdf/plugin-navigation';

const wasmBinary = await loadWasmBinary();
const wasmModule = await createPdfiumModule({ wasmBinary });
const engine = new PdfiumEngine(wasmModule, new ConsoleLogger());

const core = new PDFCore(engine);

const navigationPlugin = new NavigationPlugin({
  initialPage: 1,
  defaultScrollMode: 'continuous',
});

core.registerPlugin(navigationPlugin);

core.loadDocument('https://cloudpdf.io/example.pdf');

core.on('document:loaded', ({ pageCount }) => {
  console.log(`Document loaded with ${pageCount} pages`);
});

core.on('navigation:pageChanged', ({ pageNumber }) => {
  console.log(`Navigated to page ${pageNumber}`);
});
```
