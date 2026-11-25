# Meus Ingressos

PWA para gerenciar ingressos de eventos, com painel administrativo protegido por login, três papéis de acesso e dados compartilhados entre todos os aparelhos.

- **Evento e ingressos:** ficam no Upstash Redis (`app:data`) e são iguais em qualquer aparelho.
- **Cache local:** o `localStorage` guarda uma cópia para abrir offline e um backup do que já existia no aparelho.
- **Autenticação/sessões:** funções serverless (`/api`) + Upstash Redis.
- **Sessão:** deslizante de **30 minutos**, com teto de **12 horas** (a senha genérica tem 30 minutos fixos).
- **Dispositivos:** múltiplos simultâneos, com revogação e bloqueio.
- **Papéis:** `admin` edita e publica; `guest` e `generic` apenas visualizam.

## Requisitos

- Node.js 18+
- Conta na [Vercel](https://vercel.com) (para produção)
- Banco [Upstash Redis](https://console.upstash.com) (plano free serve)

## Configuração

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Gere os hashes das senhas:

   ```bash
   npm run hash-password -- "sua-senha-admin"
   npm run hash-password -- "sua-senha-guest"
   npm run hash-password -- "sua-senha-generic"
   ```

3. Copie `.env.example` para `.env.local` e preencha:

   ```env
   ADMIN_PASSWORD_HASH=scrypt$...
   GUEST_PASSWORD_HASH=scrypt$...
   GENERIC_PASSWORD_HASH=scrypt$...
   UPSTASH_REDIS_REST_URL=https://...
   UPSTASH_REDIS_REST_TOKEN=...
   ```

4. Rode o projeto com a Vercel CLI (necessário para servir `/api`):

   ```bash
   npx vercel dev
   ```

   > `npm run dev` (Vite puro) **não** serve as rotas `/api`; use apenas para trabalhar em HTML/CSS.

## Deploy

1. Suba o projeto na Vercel.
2. Configure as variáveis de ambiente:
   - `ADMIN_PASSWORD_HASH`
   - `GUEST_PASSWORD_HASH`
   - `GENERIC_PASSWORD_HASH`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. Build: `npm run build` → saída em `dist`.
4. Depois do deploy, recarregue o app uma vez para o service worker atualizar os arquivos.
5. Entre como **admin** no aparelho que já tem os ingressos editados. Na primeira abertura, o app publica automaticamente os dados desse aparelho no servidor.
6. Abra como `guest` ou `generic` em outro aparelho para confirmar que os dados publicados aparecem.

## Como os dados compartilhados funcionam

- `GET /api/data` devolve o evento e os ingressos publicados. Exige qualquer sessão válida (`admin`, `guest` ou `generic`).
- `PUT /api/data` publica uma nova versão. Exige sessão de **admin**.
- Antes de sobrescrever, o servidor guarda a versão anterior em `app:data:backup`.
- Os **ingressos fixos** são mesclados pelo servidor. Mesmo que alguém tente salvar sem eles, o servidor readiciona.
- O `localStorage` não é mais a fonte da verdade: ele é cache de leitura e backup local.
- O admin vê a versão do servidor ao abrir o painel. Se o servidor ainda estiver vazio, o que existir no aparelho é publicado uma única vez.
- Se outro dispositivo publicar antes, o servidor responde `409` e o painel pede para recarregar, evitando sobrescrever sem aviso.
- As páginas de visualização atualizam os dados quando o app volta ao foco/é reaberto.
- O service worker nunca cacheia `/api`.

### Imagens do evento

Imagens enviadas pelo dispositivo são comprimidas no navegador para cerca de **280 KB** (data URL). O servidor aceita no máximo **512 KB** por publicação; acima disso responde `413`. Para imagens maiores, use uma das imagens em `assets/` ou o Vercel Blob.

### Backup

- **Backup local:** o painel guarda a versão anterior do próprio aparelho antes de substituí-la pelo servidor.
- **Backup do servidor:** o servidor guarda a versão anterior publicada.
- **Exportar/Importar JSON:** continuam disponíveis e agora publicam no servidor ao importar.
- Os botões **Backup local** e **Backup do servidor** restauram a cópia escolhida e publicam para todos.

## Estrutura

| Caminho | Função |
|---|---|
| `index.html` | Home com abas Próximos/Anteriores e mês dinâmico |
| `ingresso.html` + `script.js` | Carrossel de ingressos, QR rotativo e modal "Mais informação" |
| `admin.html` + `admin.js` | Formulário de evento/ingressos e painel de dispositivos |
| `login.html` + `login.js` | Login por senha (admin/guest/generic) |
| `auth.js` | Cliente de sessão (guard, logout, heartbeat deslizante) |
| `defaults.js` | Dados padrão, ingressos fixos e cache/backup local |
| `data.js` | Cliente dos dados compartilhados (busca, publicação e migração) |
| `admin-devices.js` | Painel de dispositivos conectados/bloqueados |
| `api/` | Endpoints serverless de autenticação, dispositivos e dados |
| `server/` | Regras de sessão, Redis, dados compartilhados, cookies e rate limit |
| `scripts/hash-password.mjs` | Gera os hashes de senha |
| `public/sw.js` | Service Worker (nunca cacheia `/api`) |

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/login` | Autentica e cria sessão |
| POST | `/api/logout` | Encerra a sessão atual |
| GET | `/api/session` | Valida/renova a sessão (sliding) |
| GET | `/api/data` | Lê evento e ingressos publicados (qualquer sessão) |
| PUT | `/api/data` | Publica evento e ingressos (somente admin) |
| GET | `/api/data?backup=1` | Lê o backup anterior do servidor (somente admin) |
| GET | `/api/devices` | Lista sessões ativas e bloqueadas |
| POST | `/api/devices/revoke` | Revoga uma sessão específica |
| POST | `/api/devices/block` | Bloqueia um dispositivo |
| POST | `/api/devices/unblock` | Desbloqueia um dispositivo |

## Segurança

- Senhas nunca vão para o cliente: apenas hashes `scrypt` em variáveis de ambiente.
- Cookie `HttpOnly`, `SameSite=Lax` e `Secure` em produção.
- Token de sessão aleatório; no Redis só o SHA-256.
- Rate limit de login: 10 tentativas por 15 minutos por IP.
- Leitura de dados exige sessão; escrita exige admin e mesma origem.
- Bloqueio por `deviceId`. Limpar os dados do navegador gera um novo `deviceId` — limitação inerente a apps web.
- Como os dados agora ficam no servidor, guest/genérico não conseguem alterar ingressos nem pelo console do navegador.
