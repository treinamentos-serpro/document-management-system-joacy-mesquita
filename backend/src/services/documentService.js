const DocumentError = require('../documentError');

function compareDocuments(left, right) {
  if (left.uploadedAt !== right.uploadedAt) {
    return left.uploadedAt > right.uploadedAt ? -1 : 1;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

async function rollbackUpload(fileRepository, id, saveError) {
  try {
    await fileRepository.remove(id);
  } catch (cleanupError) {
    throw new DocumentError('STORAGE_ERROR', 'Não foi possível remover o arquivo após a falha.', {
      cause: new AggregateError([saveError, cleanupError]),
    });
  }
}

class DocumentService {
  constructor(documentRepository, fileRepository, owner) {
    this.documentRepository = documentRepository;
    this.fileRepository = fileRepository;
    this.owner = owner;
  }

  async create({ id, originalName, size }) {
    const document = {
      id,
      originalName,
      size,
      uploadedAt: new Date().toISOString(),
      owner: this.owner,
    };

    try {
      return await this.documentRepository.save(document);
    } catch (error) {
      await rollbackUpload(this.fileRepository, id, error);
      throw new DocumentError('INTERNAL_ERROR', 'Não foi possível registrar o documento.', {
        cause: error,
      });
    }
  }

  async list() {
    const documents = await this.documentRepository.findAll();
    return [...documents].sort(compareDocuments);
  }

  async getDownload(id) {
    const document = await this.documentRepository.findById(id);
    if (!document) {
      throw new DocumentError('DOCUMENT_NOT_FOUND', 'Documento não encontrado.');
    }
    return { document, filePath: this.fileRepository.getPath(document.id) };
  }
}

module.exports = DocumentService;
