import { useState } from 'react';
import { downloadDocument } from '../services/documentApi.js';

export default function DownloadButton({ document: item }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    setError('');

    try {
      const blob = await downloadDocument(item.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      try {
        link.href = url;
        link.download = item.originalName.replace(/[/\\\x00-\x1f\x7f]/g, '_');
        document.body.appendChild(link);
        link.click();
      } finally {
        link.remove();
        // Aguarde o navegador iniciar o download antes de liberar o blob.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        aria-label={`Baixar ${item.originalName}`}
      >
        {downloading ? 'Baixando…' : 'Baixar'}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
