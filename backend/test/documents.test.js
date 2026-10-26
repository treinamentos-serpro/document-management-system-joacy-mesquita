const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const express = require('express');
const createDocumentRouter = require('../src/routes/documentRoutes');
const { handleError } = require('../src/controllers/documentController');
const DocumentRepository = require('../src/repositories/documentRepository');
const FileRepository = require('../src/repositories/fileRepository');
const DocumentService = require('../src/services/documentService');
const loadConfig = require('../src/config');
const app = require('../src/app');

async function listen(t, application) {
  const server = application.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

async function setup(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dms-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const config = {
    storageDir: path.join(directory, 'storage'),
    maxFileSize: 16,
    owner: 'test-owner',
    ...options.config,
  };
  const documentRepository = options.documentRepository || new DocumentRepository();
  const fileRepository = options.fileRepository || new FileRepository(config.storageDir);
  const application = express();
  application.use(express.json());
  application.use(createDocumentRouter({ config, documentRepository, fileRepository }));
  application.use(handleError);
  const url = await listen(t, application);
  return { url, config, directory, documentRepository };
}

function upload(url, content = 'conteudo', filename = 'relatorio.txt', field = 'file') {
  const form = new FormData();
  form.append(field, new Blob([content], { type: 'application/x-custom' }), filename);
  return fetch(`${url}/upload`, { method: 'POST', body: form });
}

async function expectError(response, status, code) {
  assert.equal(response.status, status);
  assert.match(response.headers.get('content-type'), /application\/json/);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['error']);
  assert.deepEqual(Object.keys(body.error).sort(), ['code', 'message']);
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, 'string');
  assert.ok(body.error.message.length > 0);
  return body;
}

test('o app registra as rotas e preserva a verificação de saúde', async (t) => {
  const url = await listen(t, app);
  assert.deepEqual(await (await fetch(`${url}/health`)).json(), { status: 'ok' });
  assert.deepEqual(await (await fetch(`${url}/documents`)).json(), []);
  await expectError(await fetch(`${url}/upload`, { method: 'POST' }), 400, 'FILE_REQUIRED');
  await expectError(await fetch(`${url}/documents/missing/download`), 404, 'DOCUMENT_NOT_FOUND');
});

test('upload grava bytes locais, retorna somente metadados e permite download', async (t) => {
  const { url, config } = await setup(t);
  const content = Buffer.from([0, 1, 2, 128, 255]);
  const response = await upload(url, content, 'relatório.bin');
  assert.equal(response.status, 201);
  assert.match(response.headers.get('content-type'), /application\/json/);
  const document = await response.json();
  assert.deepEqual(Object.keys(document).sort(), ['id', 'originalName', 'owner', 'size', 'uploadedAt']);
  assert.match(document.id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(document.originalName, 'relatório.bin');
  assert.equal(document.size, content.length);
  assert.equal(document.owner, 'test-owner');
  assert.equal(new Date(document.uploadedAt).toISOString(), document.uploadedAt);
  assert.deepEqual(await fs.readdir(config.storageDir), [document.id]);
  assert.deepEqual(await fs.readFile(path.join(config.storageDir, document.id)), content);
  assert.deepEqual(await (await fetch(`${url}/documents`)).json(), [document]);

  const download = await fetch(`${url}/documents/${document.id}/download`);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-type'), 'application/octet-stream');
  assert.match(download.headers.get('content-disposition'), /^attachment;/);
  assert.match(download.headers.get('content-disposition'), /relat/);
  assert.ok(!download.headers.get('content-disposition').includes(config.storageDir));
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), content);
});

test('arquivos vazios e arquivos com tamanho exatamente igual ao limite são aceitos', async (t) => {
  const { url } = await setup(t);
  for (const size of [0, 16]) {
    const response = await upload(url, Buffer.alloc(size), `arquivo-${size}`);
    assert.equal(response.status, 201);
    const document = await response.json();
    assert.equal(document.size, size);
    const download = await fetch(`${url}/documents/${document.id}/download`);
    assert.equal(download.status, 200);
    assert.equal((await download.arrayBuffer()).byteLength, size);
  }
});

test('listagem vazia retorna 200 e um array JSON sem criar o diretório de arquivos', async (t) => {
  const { url, config } = await setup(t);
  const response = await fetch(`${url}/documents`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await response.json(), []);
  await assert.rejects(fs.stat(config.storageDir), { code: 'ENOENT' });
});

test('uploads com o mesmo nome mantêm IDs e conteúdos independentes no download', async (t) => {
  const { url, config } = await setup(t);
  const documents = [];
  const contents = ['primeiro', 'segundo'];
  for (const content of contents) {
    const response = await upload(url, content, 'repetido.txt');
    assert.equal(response.status, 201);
    documents.push(await response.json());
  }
  assert.notEqual(documents[0].id, documents[1].id);
  assert.deepEqual((await fs.readdir(config.storageDir)).sort(), documents.map(({ id }) => id).sort());

  const response = await fetch(`${url}/documents`);
  assert.equal(response.status, 200);
  const listed = await response.json();
  assert.equal(listed.length, 2);
  for (const [index, document] of documents.entries()) {
    assert.deepEqual(listed.find(({ id }) => id === document.id), document);
    const download = await fetch(`${url}/documents/${document.id}/download`);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('content-type'), 'application/octet-stream');
    assert.equal(download.headers.get('content-disposition'), 'attachment; filename="repetido.txt"');
    assert.equal(await download.text(), contents[index]);
  }
});

test('upload usa o owner configurado e ignora metadados enviados pelo cliente', async (t) => {
  const { url } = await setup(t);
  const form = new FormData();
  form.append('file', new Blob(['abc']), 'arquivo.txt');
  form.append('owner', 'client-owner');
  form.append('id', 'client-id');
  form.append('size', '999');
  form.append('uploadedAt', '2000-01-01T00:00:00.000Z');
  const response = await fetch(`${url}/upload`, { method: 'POST', body: form });
  assert.equal(response.status, 201);
  const document = await response.json();
  assert.equal(document.owner, 'test-owner');
  assert.notEqual(document.id, 'client-id');
  assert.equal(document.size, 3);
  assert.notEqual(document.uploadedAt, '2000-01-01T00:00:00.000Z');
  assert.deepEqual(await (await fetch(`${url}/documents`)).json(), [document]);
});

test('arquivos acima do limite retornam 413 e são removidos', async (t) => {
  const { url, config } = await setup(t);
  for (const size of [17, 100]) {
    await expectError(await upload(url, Buffer.alloc(size)), 413, 'FILE_TOO_LARGE');
    assert.deepEqual(await fs.readdir(config.storageDir), []);
    assert.deepEqual(await (await fetch(`${url}/documents`)).json(), []);
  }
});

test('arquivo ausente retorna 400', async (t) => {
  const { url } = await setup(t);
  const form = new FormData();
  form.append('owner', 'ignored');
  await expectError(await fetch(`${url}/upload`, { method: 'POST', body: form }), 400, 'FILE_REQUIRED');
});

test('campo de arquivo incorreto e múltiplos arquivos são rejeitados sem deixar arquivos', async (t) => {
  const { url, config } = await setup(t);
  await expectError(await upload(url, 'abc', 'a.txt', 'other'), 400, 'INVALID_MULTIPART');
  const form = new FormData();
  form.append('file', new Blob(['abc']), 'a.txt');
  form.append('file', new Blob(['def']), 'b.txt');
  await expectError(await fetch(`${url}/upload`, { method: 'POST', body: form }), 400, 'INVALID_MULTIPART');
  assert.deepEqual(await fs.readdir(config.storageDir), []);
  assert.deepEqual(await (await fetch(`${url}/documents`)).json(), []);
});

test('multipart sem boundary, truncado ou com tipo inválido retorna 400', async (t) => {
  const { url, config } = await setup(t);
  for (const [type, body] of [
    ['multipart/form-data', 'invalid'],
    ['multipart/mixed; boundary=test', 'invalid'],
    ['multipart/form-data; boundary=test', '--test\r\n'],
    ['multipart/form-data; boundary=test', '--test\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\n\r\nabc'],
  ]) {
    await expectError(await fetch(`${url}/upload`, {
      method: 'POST', headers: { 'Content-Type': type }, body,
    }), 400, 'INVALID_MULTIPART');
  }
  assert.deepEqual(await fs.readdir(config.storageDir), []);
  assert.deepEqual(await (await fetch(`${url}/documents`)).json(), []);
});

test('listagem ordena por data decrescente e id crescente nos empates', async (t) => {
  const { url, documentRepository } = await setup(t);
  const documents = [
    { id: 'b', uploadedAt: '2026-01-02T00:00:00.000Z' },
    { id: 'c', uploadedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'a', uploadedAt: '2026-01-02T00:00:00.000Z' },
  ];
  for (const document of documents) {
    documentRepository.save({ ...document, originalName: 'a.txt', size: 1, owner: 'test-owner' });
  }
  assert.deepEqual((await (await fetch(`${url}/documents`)).json()).map(({ id }) => id), ['a', 'b', 'c']);
});

test('documento desconhecido e arquivo removido retornam 404', async (t) => {
  const { url, config } = await setup(t);
  await expectError(await fetch(`${url}/documents/unknown/download`), 404, 'DOCUMENT_NOT_FOUND');
  const document = await (await upload(url)).json();
  await fs.unlink(path.join(config.storageDir, document.id));
  await expectError(await fetch(`${url}/documents/${document.id}/download`), 404, 'DOCUMENT_NOT_FOUND');
});

test('nomes de download não são usados como caminhos locais', async (t) => {
  const { url, config } = await setup(t);
  const document = await (await upload(url, 'abc', '../../relatorio.txt')).json();
  assert.deepEqual(await fs.readdir(config.storageDir), [document.id]);
  const response = await fetch(`${url}/documents/${document.id}/download`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="relatorio.txt"');
  assert.equal(await response.text(), 'abc');
  await expectError(await fetch(`${url}/documents/..%2F..%2Fetc%2Fpasswd/download`), 404, 'DOCUMENT_NOT_FOUND');
});

test('falha de metadados remove o arquivo recém-gravado e retorna erro sem detalhes internos', async (t) => {
  const log = t.mock.method(console, 'error', () => {});
  const repository = new DocumentRepository();
  repository.save = () => { throw new Error('segredo interno'); };
  const { url, config } = await setup(t, { documentRepository: repository });
  const body = await expectError(await upload(url), 500, 'INTERNAL_ERROR');
  assert.ok(!JSON.stringify(body).includes('segredo'));
  assert.deepEqual(await fs.readdir(config.storageDir), []);
  assert.deepEqual(await (await fetch(`${url}/documents`)).json(), []);
  assert.equal(log.mock.callCount(), 1);
});

test('falha ao consultar metadados retorna 500 e é registrada', async (t) => {
  const log = t.mock.method(console, 'error', () => {});
  const repository = new DocumentRepository();
  repository.findAll = () => { throw new Error('falha interna'); };
  const { url } = await setup(t, { documentRepository: repository });
  await expectError(await fetch(`${url}/documents`), 500, 'INTERNAL_ERROR');
  assert.equal(log.mock.callCount(), 1);
});

test('falha ao criar diretório retorna STORAGE_ERROR sem expor caminhos', async (t) => {
  const log = t.mock.method(console, 'error', () => {});
  const { url, config, directory } = await setup(t);
  await fs.writeFile(config.storageDir, 'não é um diretório');
  const body = await expectError(await upload(url), 500, 'STORAGE_ERROR');
  assert.ok(!JSON.stringify(body).includes(directory));
  assert.equal(log.mock.callCount(), 1);
});

test('falha de leitura diferente de arquivo ausente retorna STORAGE_ERROR', async (t) => {
  const log = t.mock.method(console, 'error', () => {});
  const { url, config } = await setup(t);
  const document = await (await upload(url)).json();
  const filePath = path.join(config.storageDir, document.id);
  await fs.unlink(filePath);
  await fs.mkdir(filePath);
  await expectError(await fetch(`${url}/documents/${document.id}/download`), 500, 'STORAGE_ERROR');
  assert.equal(log.mock.callCount(), 1);
});

test('falha no rollback preserva as duas causas e é sinalizada', async () => {
  const saveError = new Error('falha ao salvar');
  const removeError = new Error('falha ao remover');
  const service = new DocumentService(
    { save: async () => { throw saveError; } },
    { remove: async () => { throw removeError; } },
    'local-user',
  );
  await assert.rejects(service.create({ id: 'id', originalName: 'a', size: 1 }), (error) => {
    assert.equal(error.code, 'STORAGE_ERROR');
    assert.deepEqual(error.cause.errors, [saveError, removeError]);
    return true;
  });
});

test('instâncias do repositório são isoladas e não recuperam arquivos remanescentes', async (t) => {
  const { url, config } = await setup(t);
  await upload(url);
  const { url: otherUrl } = await setup(t, { config });
  assert.deepEqual(await (await fetch(`${otherUrl}/documents`)).json(), []);
});

test('repositório não expõe referências mutáveis dos metadados', () => {
  const repository = new DocumentRepository();
  const document = { id: 'a', owner: 'original' };
  const saved = repository.save(document);
  document.owner = 'changed';
  saved.owner = 'changed';
  repository.findAll()[0].owner = 'changed';
  repository.findById('a').owner = 'changed';
  assert.equal(repository.findById('a').owner, 'original');
});

test('configuração respeita ambiente, padrões e rejeita limites inválidos', () => {
  const defaults = loadConfig({});
  assert.equal(defaults.storageDir, path.resolve(__dirname, '../storage'));
  assert.equal(defaults.maxFileSize, 10485760);
  assert.equal(defaults.owner, 'local-user');
  assert.deepEqual(loadConfig({
    DMS_STORAGE_DIR: './custom',
    DMS_MAX_FILE_SIZE_BYTES: '42',
    DMS_OWNER_ID: 'owner',
  }), { storageDir: path.resolve('custom'), maxFileSize: 42, owner: 'owner' });
  for (const value of ['', '0', '-1', '1.5', 'Infinity', 'NaN', '1e3', '9007199254740991']) {
    assert.throws(() => loadConfig({ DMS_MAX_FILE_SIZE_BYTES: value }), /DMS_MAX_FILE_SIZE_BYTES/);
  }
});
