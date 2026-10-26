const { randomUUID } = require('node:crypto');
const express = require('express');
const multer = require('multer');
const loadConfig = require('../config');
const DocumentError = require('../documentError');
const DocumentRepository = require('../repositories/documentRepository');
const FileRepository = require('../repositories/fileRepository');
const DocumentService = require('../services/documentService');
const { createDocumentController } = require('../controllers/documentController');

function createDocumentRouter({
  config = loadConfig(),
  documentRepository = new DocumentRepository(),
  fileRepository = new FileRepository(config.storageDir),
} = {}) {
  const router = express.Router();
  const service = new DocumentService(documentRepository, fileRepository, config.owner);
  const controller = createDocumentController(service);
  const storage = multer.diskStorage({
    destination(req, file, callback) {
      fileRepository.ensureDirectory().then(
        (directory) => callback(null, directory),
        (error) => callback(error),
      );
    },
    filename(req, file, callback) {
      callback(null, randomUUID());
    },
  });
  const upload = multer({
    storage,
    // O Busboy emite "limit" ao atingir o valor, inclusive; aceite o limite exato.
    limits: { fileSize: config.maxFileSize + 1 },
    defParamCharset: 'utf8',
  }).single('file');

  router.post('/upload', (req, res, next) => {
    upload(req, res, (error) => {
      if (!error) return next();
      if (error.storageErrors?.length) {
        return next(new DocumentError('STORAGE_ERROR', 'Falha ao remover o upload inválido.', {
          cause: error,
        }));
      }
      if (error instanceof multer.MulterError) {
        const tooLarge = error.code === 'LIMIT_FILE_SIZE';
        return next(new DocumentError(
          tooLarge ? 'FILE_TOO_LARGE' : 'INVALID_MULTIPART',
          tooLarge ? 'O arquivo excede o tamanho máximo permitido.' : 'Envie apenas um arquivo no campo file.',
          { cause: error },
        ));
      }
      const invalidMultipart = /Multipart:|Unexpected end of (form|file)|Malformed (part header|content type)|Unsupported content type/.test(error.message);
      next(new DocumentError(
        invalidMultipart ? 'INVALID_MULTIPART' : 'STORAGE_ERROR',
        invalidMultipart ? 'O formulário multipart é inválido.' : 'Não foi possível gravar o arquivo.',
        { cause: error },
      ));
    });
  }, controller.upload);
  router.get('/documents', controller.list);
  router.get('/documents/:id/download', controller.download);

  return router;
}

module.exports = createDocumentRouter;
