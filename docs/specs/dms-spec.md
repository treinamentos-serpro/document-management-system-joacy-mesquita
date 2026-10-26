# Especificação - Document Management System

## 1. Objetivo

Permitir que o usuário envie, consulte e baixe documentos armazenados exclusivamente no filesystem local da aplicação.

## 2. Escopo

### Dentro do escopo

- Upload de um documento por requisição.
- Listagem dos documentos disponíveis na instância em execução.
- Download de um documento pelo identificador.
- Associação simples de cada documento a um identificador de owner configurado para a aplicação.
- Armazenamento dos arquivos localmente e dos metadados em memória.

### Fora do escopo

- Armazenamento externo, em nuvem ou em serviços de terceiros.
- Versionamento de documentos.
- Login, autenticação, autorização ou isolamento seguro entre usuários.
- Persistência durável dos metadados, busca, paginação e edição de documentos.
- Restrição de tipos MIME ou extensão de arquivo.

## 3. Requisitos funcionais

| ID | Requisito |
| --- | --- |
| RF-01 | O usuário pode enviar um arquivo usando `multipart/form-data`, no campo `file`. Uma requisição sem arquivo deve ser rejeitada. |
| RF-02 | O sistema deve gravar o conteúdo no filesystem local usando Multer com `diskStorage`. O nome físico deve ser gerado pelo sistema a partir de um identificador único, sem usar o nome original como caminho. |
| RF-03 | Após um upload bem-sucedido, o sistema deve criar e retornar metadados com identificador único, nome original, tamanho em bytes, data/hora ISO 8601 e owner. |
| RF-04 | O usuário pode listar os metadados dos documentos da instância. A lista deve vir ordenada do mais recente para o mais antigo; em caso de empate, ordenar pelo identificador. Uma lista vazia deve retornar `200` com `[]`. |
| RF-05 | O usuário pode baixar um documento pelo identificador. O conteúdo deve ser enviado como anexo, usando o nome original apenas como nome de download e sem revelar o caminho local. |
| RF-06 | Um identificador inexistente deve resultar em `404`. Se os metadados existirem, mas o arquivo local não puder ser encontrado, o sistema também deve retornar `404`. |
| RF-07 | Arquivos maiores que o limite configurado devem ser rejeitados com `413`; erros de validação devem seguir o formato de erro definido nesta especificação. |
| RF-08 | Se a gravação de metadados falhar após o arquivo ter sido gravado, o arquivo recém-criado deve ser removido para evitar um arquivo órfão. |

## 4. Requisitos não funcionais

| ID | Requisito |
| --- | --- |
| RNF-01 | Os arquivos devem ser gravados somente em filesystem local, com Multer `diskStorage`, no diretório configurado. O padrão é `backend/storage`. Não utilizar provedores externos. |
| RNF-02 | Os metadados devem permanecer em memória nesta fase. Eles são perdidos ao reiniciar o processo; arquivos remanescentes no disco não são considerados documentos disponíveis sem seus metadados. |
| RNF-03 | Configurações devem ser obtidas de variáveis de ambiente: `DMS_STORAGE_DIR` (padrão `backend/storage`), `DMS_MAX_FILE_SIZE_BYTES` (padrão `10485760`, equivalente a 10 MiB) e `DMS_OWNER_ID` (padrão `local-user`). |
| RNF-04 | O sistema deve aceitar qualquer tipo e extensão de arquivo, respeitando o limite máximo configurado. Arquivos vazios são permitidos. |
| RNF-05 | O nome físico do arquivo deve ser independente do nome original. O nome original não pode ser concatenado a caminhos do filesystem. Downloads devem usar `Content-Disposition: attachment`; o tipo de conteúdo pode ser `application/octet-stream`. |
| RNF-06 | A aplicação é de uso simples/local nesta fase. `owner` é apenas metadado e não representa autenticação, autorização ou garantia de isolamento entre usuários. |
| RNF-07 | O backend deve seguir a separação de responsabilidades indicada na arquitetura e usar o runner nativo `node:test` para testes. |

## 5. Modelo de dados (metadados do documento)

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `id` | string | Identificador único, gerado pelo sistema (UUID). |
| `originalName` | string | Nome original informado no upload; usado como nome sugerido no download. |
| `size` | number | Tamanho do arquivo em bytes. Deve corresponder ao arquivo gravado. |
| `uploadedAt` | string | Data e hora de criação dos metadados, em ISO 8601. |
| `owner` | string | Identificador configurado em `DMS_OWNER_ID`; não é uma credencial nem uma identidade autenticada. |

O nome físico e o caminho de armazenamento são detalhes internos. Não devem fazer parte da resposta da API nem do modelo público de metadados.

## 6. Contratos de API

As rotas do backend são `/upload`, `/documents` e `/documents/:id/download`. O frontend acessa a API pelo prefixo `/api` disponibilizado pelo proxy do Vite.

### `POST /upload`

- Entrada: `multipart/form-data` com exatamente um arquivo no campo `file`.
- Validação: o campo é obrigatório; tamanho máximo definido por `DMS_MAX_FILE_SIZE_BYTES`; qualquer tipo de arquivo é aceito.
- Sucesso: `201 Created`, `Content-Type: application/json` e metadados do documento criado.

```json
{
  "id": "uuid",
  "originalName": "relatorio.pdf",
  "size": 24576,
  "uploadedAt": "2026-10-26T12:00:00.000Z",
  "owner": "local-user"
}
```

- Erros: `400 Bad Request` para arquivo ausente ou multipart inválido; `413 Payload Too Large` para arquivo acima do limite; `500 Internal Server Error` para falha inesperada de armazenamento.

### `GET /documents`

- Entrada: sem parâmetros obrigatórios.
- Sucesso: `200 OK`, `Content-Type: application/json`, com uma lista de metadados no formato acima, ordenada conforme RF-04.
- Lista vazia: `200 OK` com `[]`.
- Erro: `500 Internal Server Error` para falha inesperada ao consultar os metadados.

### `GET /documents/:id/download`

- Entrada: identificador do documento no segmento `:id`.
- Sucesso: `200 OK` com o conteúdo binário, `Content-Type: application/octet-stream` e `Content-Disposition: attachment` com o nome original sanitizado como nome de download.
- Erro: `404 Not Found` quando o documento ou seu arquivo local não existir; `500 Internal Server Error` para outra falha de leitura.

### Formato de erro

Respostas de erro da API devem usar `Content-Type: application/json` e o formato abaixo. Mensagens não devem expor stack trace, caminhos locais ou detalhes internos.

```json
{
  "error": {
    "code": "FILE_REQUIRED",
    "message": "Envie um arquivo no campo file."
  }
}
```

Códigos previstos: `FILE_REQUIRED`, `INVALID_MULTIPART`, `FILE_TOO_LARGE`, `DOCUMENT_NOT_FOUND`, `STORAGE_ERROR` e `INTERNAL_ERROR`.

## 7. Decisões arquiteturais

- Backend em Node.js e Express, com separação simples: `routes` recebem a requisição e encaminham ao controller; `controllers` tratam entrada, validação HTTP e resposta; `services` concentram regras de negócio; `repositories` consultam e mantêm os metadados em memória.
- Multer com `diskStorage` atua como middleware de entrada da rota de upload e grava os arquivos no diretório local configurado. O fluxo deve delegar a criação e associação dos metadados às camadas internas.
- O identificador gerado pelo sistema é usado para localizar o arquivo armazenado. Nome original e caminho local não são usados como identificador de armazenamento.
- A implementação não pode depender de armazenamento externo. O diretório padrão é `backend/storage`.
- Frontend em React com componentes funcionais e Hooks. A comunicação usa `fetch` pelo prefixo `/api`, encaminhado pelo proxy do Vite.
- A ausência de autenticação é uma limitação explícita desta fase; `owner` não pode ser tratado como mecanismo de autorização.

## 8. Plano de execução

Etapas de produto em alto nível; este plano não especifica alterações ou execução de arquivos de backend e frontend.

1. Confirmar as configurações padrão e os critérios de aceite para armazenamento local, owner e limite de upload.
2. Entregar o fluxo de upload local e a criação dos metadados em memória.
3. Entregar a listagem e o download por identificador, incluindo os casos de documento inexistente.
4. Integrar os fluxos de envio, listagem e download à experiência do usuário por meio da API existente.
5. Validar os fluxos completos, limites, erros, reinício do processo e a ausência de dependências de armazenamento externo.
