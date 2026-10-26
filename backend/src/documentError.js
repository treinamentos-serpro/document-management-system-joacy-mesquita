class DocumentError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'DocumentError';
    this.code = code;
  }
}

module.exports = DocumentError;
