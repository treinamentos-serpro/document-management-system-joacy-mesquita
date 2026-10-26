# Document Management System com GitHub Copilot

<img src="https://octodex.github.com/images/Professortocat_v2.png" align="right" height="200px" />

Hey Joacy!

Mona here. I'm done preparing your exercise. Hope you enjoy! 💚

Remember, it's self-paced so feel free to take a break! ☕️

[![](https://img.shields.io/badge/Go%20to%20Exercise-%E2%86%92-1f883d?style=for-the-badge&logo=github&labelColor=197935)](https://github.com/treinamentos-serpro/document-management-system-joacy-mesquita/issues/1)

---

## Backend DMS

Execute `npm start` em `backend` (após `npm install`). Para executar os testes,
use `npm test` no mesmo diretório.

- `POST /upload`: envie exatamente um arquivo no campo `file` de um formulário
  `multipart/form-data`. Retorna `201` com `id`, `originalName`, `size`,
  `uploadedAt` e `owner`.
- `GET /documents`: retorna os metadados, do mais recente para o mais antigo,
  com desempate por identificador em ordem crescente.
- `GET /documents/:id/download`: retorna o arquivo como anexo ou `404` quando
  o documento ou seu arquivo não existir.
- `GET /health`: verificação de saúde.

Configuração por variáveis de ambiente:

| Variável | Padrão |
| --- | --- |
| `PORT` | `3000` |
| `DMS_STORAGE_DIR` | `backend/storage`, independente do diretório de execução |
| `DMS_MAX_FILE_SIZE_BYTES` | `10485760` (10 MiB, inclusive) |
| `DMS_OWNER_ID` | `local-user` |

Um `DMS_STORAGE_DIR` relativo é resolvido a partir do diretório de execução.
O diretório é criado no primeiro upload. O limite deve ser um inteiro positivo
menor que `Number.MAX_SAFE_INTEGER`; configuração inválida impede a inicialização.
Qualquer tipo de arquivo é aceito, inclusive arquivos vazios.

```sh
curl -F 'file=@./relatorio.pdf' http://localhost:3000/upload
curl http://localhost:3000/documents
curl -OJ http://localhost:3000/documents/ID_RETORNADO/download
```

Erros seguem `{ "error": { "code": "...", "message": "..." } }`, com status
`400` para upload inválido, `413` para tamanho excedido, `404` para documento
ausente e `500` para falhas internas. Caminhos locais não são expostos.

Os arquivos ficam exclusivamente no filesystem local, com nomes UUID gerados
pelo sistema. Os metadados ficam em memória e são perdidos ao reiniciar o
processo; arquivos remanescentes não reaparecem na listagem. O campo `owner`
é apenas um metadado, **não** autenticação ou isolamento entre usuários.
O frontend acessa essas rotas pelo proxy `/api` do Vite.

## Frontend DMS

Com o backend em execução na porta `3000`, execute `npm run dev` em `frontend`
(após `npm install`) e acesse `http://localhost:5173`.
A interface permite selecionar um arquivo, enviá-lo, consultar os metadados e
baixar documentos. A lista é carregada ao abrir a página, atualizada após cada
upload e pode ser recarregada pelo botão **Atualizar lista**.
Falhas de conexão e erros da API são apresentados na interface.

Os componentes compartilham um cliente `fetch` que usa o prefixo `/api`.
O proxy de desenvolvimento do Vite remove esse prefixo e encaminha as chamadas
ao backend. Para produção, configure o servidor para encaminhar `/api` ao backend
da mesma forma; `vite preview` não substitui essa configuração.

Execute `npm run build` em `frontend` para gerar a versão de produção e
`npm test` para testar o cliente de API com o runner nativo do Node.

&copy; 2025 GitHub &bull; [Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/code_of_conduct.md) &bull; [MIT License](https://gh.io/mit)
