class DocumentRepository {
  constructor() {
    this.documents = new Map();
  }

  save(document) {
    this.documents.set(document.id, { ...document });
    return { ...document };
  }

  findById(id) {
    const document = this.documents.get(id);
    return document ? { ...document } : undefined;
  }

  findAll() {
    return Array.from(this.documents.values(), (document) => ({ ...document }));
  }
}

module.exports = DocumentRepository;
