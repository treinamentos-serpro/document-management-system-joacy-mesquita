import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listDocuments, uploadDocument, downloadDocument } from '../src/services/documentApi.js';

test('lista documentos via /api e encaminha o signal', async (t) => {
  const documents = [{ id: 'a', originalName: 'a.txt' }];
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json(documents));
  const { signal } = new AbortController();
  assert.deepEqual(await listDocuments({ signal }), documents);
  assert.deepEqual(fetchMock.mock.calls[0].arguments, ['/api/documents', { signal }]);
});

test('envia exatamente um arquivo com FormData sem definir Content-Type manualmente', async (t) => {
  const file = new File(['conteudo'], 'relatório.txt');
  const metadata = { id: 'a', originalName: file.name, size: file.size };
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json(metadata, { status: 201 }));
  assert.deepEqual(await uploadDocument(file), metadata);
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, '/api/upload');
  assert.equal(options.method, 'POST');
  assert.equal(options.headers, undefined);
  assert.deepEqual([...options.body.keys()], ['file']);
  assert.equal(options.body.get('file').name, file.name);
  assert.equal(await options.body.get('file').text(), 'conteudo');
});

test('rejeita upload sem arquivo antes de chamar o backend', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => assert.fail('fetch não deveria ser chamado'));
  await assert.rejects(uploadDocument(null), /Selecione um arquivo/);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('aceita arquivos vazios', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ size: 0 }));
  assert.deepEqual(await uploadDocument(new File([], 'vazio')), { size: 0 });
  assert.equal(fetchMock.mock.calls[0].arguments[1].body.get('file').size, 0);
});

test('download codifica o identificador e retorna os bytes binários', async (t) => {
  const content = Uint8Array.from([0, 128, 255]);
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(content));
  const blob = await downloadDocument('a/b ?');
  assert.equal(fetchMock.mock.calls[0].arguments[0], '/api/documents/a%2Fb%20%3F/download');
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), content);
});

test('expõe mensagens padronizadas da API em todas as operações', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    error: { code: 'FILE_TOO_LARGE', message: 'O arquivo excede o tamanho máximo permitido.' },
  }, { status: 413 }));
  for (const operation of [
    () => listDocuments(),
    () => uploadDocument(new File(['a'], 'a.txt')),
    () => downloadDocument('a'),
  ]) {
    await assert.rejects(operation(), /O arquivo excede o tamanho máximo permitido/);
  }
});

test('erro não JSON inclui status HTTP sem expor corpo HTML', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>proxy error</html>', { status: 502 }));
  await assert.rejects(listDocuments(), { message: 'Não foi possível concluir a operação (HTTP 502).' });
});

test('erro JSON sem mensagem mantém o status HTTP', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({}, { status: 500 }));
  await assert.rejects(listDocuments(), /HTTP 500/);
});

test('falha de rede é traduzida e preserva a causa', async (t) => {
  const cause = new TypeError('Failed to fetch');
  t.mock.method(globalThis, 'fetch', async () => { throw cause; });
  await assert.rejects(listDocuments(), (error) => {
    assert.match(error.message, /Não foi possível conectar ao servidor/);
    assert.equal(error.cause, cause);
    return true;
  });
});

test('cancelamento é propagado para o ciclo de vida do componente', async (t) => {
  const controller = new AbortController();
  controller.abort();
  t.mock.method(globalThis, 'fetch', async () => { throw controller.signal.reason; });
  await assert.rejects(listDocuments({ signal: controller.signal }), { name: 'AbortError' });
});
