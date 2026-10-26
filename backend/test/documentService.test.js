const { test } = require('node:test');
const assert = require('node:assert/strict');
const DocumentService = require('../src/services/documentService');

test('criação associa somente os metadados públicos e não remove arquivos no sucesso', async (t) => {
  const repository = { save: t.mock.fn(async (document) => document) };
  const files = { remove: t.mock.fn() };
  const service = new DocumentService(repository, files, 'test-owner');
  const document = await service.create({
    id: 'a', originalName: 'arquivo.txt', size: 0, path: '/internal',
  });

  assert.deepEqual(document, {
    id: 'a',
    originalName: 'arquivo.txt',
    size: 0,
    uploadedAt: new Date(document.uploadedAt).toISOString(),
    owner: 'test-owner',
  });
  assert.equal(repository.save.mock.callCount(), 1);
  assert.equal(files.remove.mock.callCount(), 0);
});

test('falha ao salvar aguarda a compensação e preserva a causa original', async (t) => {
  const cause = new Error('falha de metadados');
  let removed = false;
  const files = {
    remove: t.mock.fn(async () => {
      await Promise.resolve();
      removed = true;
    }),
  };
  const service = new DocumentService({
    save: async () => { throw cause; },
  }, files, 'local-user');

  await assert.rejects(service.create({ id: 'a', originalName: 'a.txt', size: 1 }), (error) => {
    assert.equal(error.code, 'INTERNAL_ERROR');
    assert.equal(error.cause, cause);
    assert.equal(removed, true);
    return true;
  });
  assert.deepEqual(files.remove.mock.calls[0].arguments, ['a']);
  assert.equal(files.remove.mock.callCount(), 1);
});

test('listagem ordena sem alterar o array retornado pelo repositório', async () => {
  const older = { id: 'c', uploadedAt: '2026-01-01T00:00:00.000Z' };
  const newerB = { id: 'b', uploadedAt: '2026-01-02T00:00:00.000Z' };
  const newerA = { id: 'a', uploadedAt: '2026-01-02T00:00:00.000Z' };
  const documents = Object.freeze([older, newerB, newerA]);
  const service = new DocumentService({ findAll: async () => documents });

  assert.deepEqual(await service.list(), [newerA, newerB, older]);
  assert.deepEqual(documents, [older, newerB, newerA]);
});

test('download usa o identificador dos metadados para resolver o arquivo', async (t) => {
  const document = { id: 'stored-id', originalName: 'arquivo.txt' };
  const repository = { findById: t.mock.fn(async () => document) };
  const files = { getPath: t.mock.fn(() => '/storage/stored-id') };
  const service = new DocumentService(repository, files, 'local-user');

  assert.deepEqual(await service.getDownload('requested-id'), {
    document, filePath: '/storage/stored-id',
  });
  assert.deepEqual(repository.findById.mock.calls[0].arguments, ['requested-id']);
  assert.deepEqual(files.getPath.mock.calls[0].arguments, ['stored-id']);
});

test('download inexistente não consulta o filesystem', async (t) => {
  const files = { getPath: t.mock.fn() };
  const service = new DocumentService({ findById: async () => undefined }, files);
  await assert.rejects(service.getDownload('missing'), { code: 'DOCUMENT_NOT_FOUND' });
  assert.equal(files.getPath.mock.callCount(), 0);
});
