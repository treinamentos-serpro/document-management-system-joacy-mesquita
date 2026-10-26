const path = require('node:path');

function loadConfig(env = process.env) {
  const rawLimit = env.DMS_MAX_FILE_SIZE_BYTES ?? '10485760';
  const maxFileSize = Number(rawLimit);

  if (!/^\d+$/.test(rawLimit) || !Number.isSafeInteger(maxFileSize) ||
      maxFileSize < 1 || maxFileSize >= Number.MAX_SAFE_INTEGER) {
    throw new Error('DMS_MAX_FILE_SIZE_BYTES deve ser um inteiro positivo seguro.');
  }

  return {
    storageDir: env.DMS_STORAGE_DIR
      ? path.resolve(env.DMS_STORAGE_DIR)
      : path.resolve(__dirname, '../storage'),
    maxFileSize,
    owner: env.DMS_OWNER_ID || 'local-user',
  };
}

module.exports = loadConfig;
