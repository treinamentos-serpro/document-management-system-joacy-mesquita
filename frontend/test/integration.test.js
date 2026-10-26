import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { listDocuments, uploadDocument, downloadDocument } from '../src/services/documentApi.js';

const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const express = requireBackend('express');
const createDocumentRouter = requireBackend('./src/routes/documentRoutes');
const { handleError } = requireBackend('./src/controllers/documentController');

test('cliente integra upload, listagem e download pelo proxy /api do Vite', async (t) => {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dms-frontend-test-'));
  t.after(() => fs.rm(storageDir, { recursive: true, force: true }));

  const backend = express();
  backend.use(createDocumentRouter({
    config: { storageDir, maxFileSize: 16, owner: 'integration-owner' },
  }));
  backend.use(handleError);
  const server = backend.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  await once(server, 'listening');

  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {
      host: '127.0.0.1',
      port: 0,
      proxy: {
        '/api': { target: `http://127.0.0.1:${server.address().port}` },
      },
    },
  });
  t.after(() => vite.close());
  await vite.listen();
  const baseUrl = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', (url, options) => realFetch(new URL(url, baseUrl), options));

  const index = await fetch('/');
  assert.equal(index.status, 200);
  assert.match(await index.text(), /src\/main.jsx/);
  assert.deepEqual(await listDocuments(), []);

  const file = new File([Uint8Array.from([0, 128, 255])], 'relatório.bin');
  const document = await uploadDocument(file);
  assert.equal(document.originalName, file.name);
  assert.equal(document.owner, 'integration-owner');
  assert.deepEqual(await listDocuments(), [document]);
  assert.deepEqual(new Uint8Array(await (await downloadDocument(document.id)).arrayBuffer()),
    new Uint8Array(await file.arrayBuffer()));

  await assert.rejects(
    uploadDocument(new File([new Uint8Array(17)], 'grande')),
    /O arquivo excede o tamanho máximo permitido/,
  );
  await fs.unlink(path.join(storageDir, document.id));
  await assert.rejects(downloadDocument(document.id), /Documento não encontrado/);

  const { default: DocumentList } = await vite.ssrLoadModule('/src/components/DocumentList.jsx');
  const html = renderToStaticMarkup(createElement(DocumentList, {
    documents: [document], loading: false, error: '',
  }));
  assert.match(html, /relatório.bin/);
  assert.match(html, /integration-owner/);
  assert.match(html, /3 bytes/);
  assert.match(html, /Baixar relatório.bin/);
  for (const [props, message] of [
    [{ loading: true }, /Carregando documentos/],
    [{ loading: false }, /Nenhum documento enviado/],
    [{ loading: false, error: 'Falha de conexão' }, /Falha de conexão/],
  ]) {
    assert.match(renderToStaticMarkup(createElement(DocumentList, {
      documents: [], error: '', ...props,
    })), message);
  }

  const { default: UploadComponent } = await vite.ssrLoadModule('/src/components/UploadComponent.jsx');
  const uploadHtml = renderToStaticMarkup(createElement(UploadComponent, { onUploaded() {} }));
  assert.match(uploadHtml, /type="file"/);
  assert.match(uploadHtml, /name="file"/);
  assert.match(uploadHtml, /disabled/);
});
