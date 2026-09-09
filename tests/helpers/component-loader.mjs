// Compile real TSX components in the Node test worker without a browser or server.
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    let url;
    if (specifier.startsWith('@/')) url = new URL(specifier.slice(2), root);
    else if (
      specifier.startsWith('.') &&
      context.parentURL?.startsWith(root.href) &&
      !context.parentURL.includes('/node_modules/')
    )
      url = new URL(specifier, context.parentURL);
    if (url) {
      const path = fileURLToPath(url);
      for (const extension of ['', '.ts', '.tsx', '.json']) {
        if (existsSync(path + extension))
          return nextResolve(pathToFileURL(path + extension).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith(root.href) && url.endsWith('.json'))
      return nextLoad(url, { ...context, importAttributes: { type: 'json' } });
    if (url.startsWith(root.href) && url.endsWith('.tsx')) {
      const source = ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
        },
        fileName: fileURLToPath(url),
      }).outputText;
      return { format: 'module', source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
