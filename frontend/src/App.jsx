import { useEffect, useState } from 'react';
import UploadComponent from './components/UploadComponent.jsx';
import DocumentList from './components/DocumentList.jsx';
import { listDocuments } from './services/documentApi.js';

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');

    async function loadDocuments() {
      try {
        const result = await listDocuments({ signal: controller.signal });
        if (!controller.signal.aborted) setDocuments(result);
      } catch (error) {
        if (!controller.signal.aborted) setError(error.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadDocuments();
    return () => controller.abort();
  }, [refresh]);

  function refreshDocuments() {
    setRefresh((value) => value + 1);
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: '64rem', margin: 'auto' }}>
      <h1>Document Management System</h1>
      <p>Envie, consulte e baixe documentos armazenados localmente.</p>
      <UploadComponent onUploaded={refreshDocuments} />
      <section aria-labelledby="documents-title">
        <h2 id="documents-title">Documentos</h2>
        <button type="button" onClick={refreshDocuments} disabled={loading}>
          Atualizar lista
        </button>
        <DocumentList documents={documents} loading={loading} error={error} />
      </section>
      <p>
        Os metadados são perdidos quando o backend é reiniciado.
        O proprietário é apenas informativo, sem autenticação ou isolamento entre usuários.
      </p>
    </main>
  );
}
