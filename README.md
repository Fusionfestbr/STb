# Meus Ingressos

PWA estático para gerenciar ingressos de eventos, com painel administrativo protegido por login e gestão de dispositivos.

- **Ingressos:** ficam no `localStorage` do navegador (`meus-ingressos-data`).
- **Autenticação/sessões:** funções serverless (`/api`) + Upstash Redis.
- **Sessão:** deslizante de **30 minutos**, com teto de **12 horas**.
- **Dispositivos:** múltiplos simultâneos, com revogação e bloqueio.

## Requisitos

- Node.js 18+
- Conta na [Vercel](https://vercel.com) (para produção)
- Banco [Upstash Redis](https://console.upstash.com) (plano free serve)

## Configuração

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Gere o hash da senha do admin:

   ```bash
   npm run hash-password -- "sua-senha-forte"
   ```

3. Copie `.env.example` para `.env.local` e preencha:

   ```env
   ADMIN_PASSWORD_HASH=scrypt$...
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
2. Configure as mesmas variáveis de ambiente (`ADMIN_PASSWORD_HASH`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`).
3. Build: `npm run build` → saída em `dist`.

## Estrutura

| Caminho | Função |
|---|---|
| `index.html` | Home com abas Próximos/Anteriores e mês dinâmico |
| `ingresso.html` + `script.js` | Carrossel de ingressos, QR rotativo e modal "Mais informação" |
| `admin.html` + `admin.js` | Formulário de evento/ingressos e painel de dispositivos |
| `login.html` + `login.js` | Login do administrador |
| `auth.js` | Cliente de sessão (guard, logout, heartbeat deslizante) |
| `admin-devices.js` | Painel de dispositivos conectados/bloqueados |
| `api/` | Endpoints serverless de autenticação e dispositivos |
| `server/` | Regras de sessão, Redis, cookies e rate limit |
| `scripts/hash-password.mjs` | Gera `ADMIN_PASSWORD_HASH` |
| `public/sw.js` | Service Worker (nunca cacheia `/api`) |

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/login` | Autentica e cria sessão |
| POST | `/api/logout` | Encerra a sessão atual |
| GET | `/api/session` | Valida/renova a sessão (sliding) |
| GET | `/api/devices` | Lista sessões ativas e bloqueadas |
| POST | `/api/devices/revoke` | Revoga uma sessão específica |
| POST | `/api/devices/block` | Bloqueia um dispositivo |
| POST | `/api/devices/unblock` | Desbloqueia um dispositivo |

## Segurança

- Senha nunca vai para o cliente: apenas o hash `scrypt` em variável de ambiente.
- Cookie `HttpOnly`, `SameSite=Lax` e `Secure` em produção.
- Token de sessão aleatório; no Redis só o SHA-256.
- Rate limit de login: 10 tentativas por 15 minutos por IP.
- Bloqueio por `deviceId`. Limpar os dados do navegador gera um novo `deviceId` — limitação inerente a apps web.
- Como os ingressos ficam no `localStorage`, o login protege o painel e as sessões, não os dados locais contra quem tem acesso ao próprio navegador.
