import { useId, useRef, useState } from 'react';
import { uploadDocument } from '../services/documentApi.js';

export default function UploadComponent({ onUploaded }) {
  const inputId = useId();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    if (uploading) return;
    setError('');
    setMessage('');

    if (!file) {
      setError('Selecione um arquivo para enviar.');
      return;
    }

    setUploading(true);
    try {
      await uploadDocument(file);
    } catch (error) {
      setError(error.message);
      return;
    } finally {
      setUploading(false);
    }

    setFile(null);
    inputRef.current.value = '';
    setMessage('Documento enviado com sucesso.');
    onUploaded();
  }

  return (
    <section aria-labelledby={`${inputId}-title`}>
      <h2 id={`${inputId}-title`}>Enviar documento</h2>
      <form onSubmit={handleSubmit} aria-busy={uploading}>
        <label htmlFor={inputId}>Arquivo </label>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          name="file"
          required
          disabled={uploading}
          onChange={(event) => {
            setFile(event.target.files[0] || null);
            setError('');
            setMessage('');
          }}
        />
        <button type="submit" disabled={uploading || !file}>
          {uploading ? 'Enviando…' : 'Enviar'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
