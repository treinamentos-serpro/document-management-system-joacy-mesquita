const path = require('node:path');
const DocumentError = require('../documentError');

function createDocumentController(service) {
  return {
    async upload(req, res) {
      if (!req.file) {
        throw new DocumentError('FILE_REQUIRED', 'Envie um arquivo no campo file.');
      }
      const document = await service.create({
        id: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
      });
      res.status(201).json(document);
    },

    async list(req, res) {
      res.json(await service.list());
    },

    async download(req, res, next) {
      const { document, filePath } = await service.getDownload(req.params.id);
      const downloadName = path.posix.basename(path.win32.basename(document.originalName))
        .replace(/[\x00-\x1f\x7f]/g, '_') || 'document';

      res.download(filePath, downloadName, {
        headers: { 'Content-Type': 'application/octet-stream' },
      }, (error) => {
        if (!error) return;
        const missing = error.code === 'ENOENT' || error.code === 'ENOTDIR';
        next(new DocumentError(
          missing ? 'DOCUMENT_NOT_FOUND' : 'STORAGE_ERROR',
          missing ? 'Documento não encontrado.' : 'Não foi possível ler o documento.',
          { cause: error },
        ));
      });
    },
  };
}

function handleError(error, req, res, next) {
  if (res.headersSent) return next(error);

  const statuses = {
    FILE_REQUIRED: 400,
    INVALID_MULTIPART: 400,
    FILE_TOO_LARGE: 413,
    DOCUMENT_NOT_FOUND: 404,
    STORAGE_ERROR: 500,
    INTERNAL_ERROR: 500,
  };
  const known = error instanceof DocumentError && Object.hasOwn(statuses, error.code);
  const code = known ? error.code : 'INTERNAL_ERROR';
  const status = statuses[code];

  if (status === 500) console.error('Falha na API de documentos:', error);

  res.status(status).json({
    error: {
      code,
      message: status === 500
        ? 'Não foi possível concluir a operação.'
        : error.message,
    },
  });
}

module.exports = { createDocumentController, handleError };
