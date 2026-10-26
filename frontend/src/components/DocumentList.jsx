import DownloadButton from './DownloadButton.jsx';

const numberFormatter = new Intl.NumberFormat('pt-BR');
const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

export default function DocumentList({ documents, loading, error }) {
  return (
    <div aria-busy={loading}>
      {loading && <p role="status">Carregando documentos…</p>}
      {error && <p role="alert">Não foi possível atualizar a lista: {error}</p>}
      {!loading && !error && documents.length === 0 && <p>Nenhum documento enviado.</p>}
      {documents.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', textAlign: 'left' }}>
            <caption>Documentos disponíveis na instância atual</caption>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Tamanho</th>
                <th scope="col">Data de envio</th>
                <th scope="col">Proprietário</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id}>
                  <td style={{ overflowWrap: 'anywhere' }}>{document.originalName}</td>
                  <td>{numberFormatter.format(document.size)} bytes</td>
                  <td>
                    <time dateTime={document.uploadedAt}>
                      {dateFormatter.format(new Date(document.uploadedAt))}
                    </time>
                  </td>
                  <td>{document.owner}</td>
                  <td><DownloadButton document={document} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
