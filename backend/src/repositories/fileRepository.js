const fs = require('node:fs/promises');
const path = require('node:path');

class FileRepository {
  constructor(storageDir) {
    this.storageDir = storageDir;
  }

  async ensureDirectory() {
    await fs.mkdir(this.storageDir, { recursive: true });
    return this.storageDir;
  }

  getPath(id) {
    return path.join(this.storageDir, id);
  }

  async remove(id) {
    await fs.unlink(this.getPath(id));
  }
}

module.exports = FileRepository;
