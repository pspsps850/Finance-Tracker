# Finance Tracker

Multi-user personal finance tracker: MySQL + Express API + React SPA.

## Status

Scaffold only. Directories, manifests and tooling are in place; no application logic, schema or routes are implemented yet. `npm run dev` starts Vite but the API does nothing until `server/src/app.js` and `server/src/index.js` are implemented.

## Prerequisites

- Node >= 22 (developed on 24)
- npm >= 10
- MySQL >= 8.0.16 (needs `CHECK` constraints and window functions)

## Setup

```powershell
npm install
npm install --prefix server
npm install --prefix client
Copy-Item .env.example .env
```

Then create the database and user:

```sql
CREATE DATABASE finance CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'finance'@'localhost' IDENTIFIED BY 'your_mysql_password';
GRANT ALL PRIVILEGES ON finance.* TO 'finance'@'localhost';
```

Set `DB_PASSWORD` in `.env` to match. `.env` is gitignored; the server loads it with `node --env-file-if-exists=../.env`, so no `dotenv` dependency is needed.

## Scripts

| Command | Runs |
| --- | --- |
| `npm run dev` | API (port 4000) + Vite (port 5173) via `concurrently` |
| `npm run build` | Production client build |
| `npm test` | `node --test` in `server/` |
| `npm run lint` | ESLint in `server/` |
| `npm run db:migrate` | Migration runner (not implemented yet) |

## Layout

```
db/            migrations/, seed.dev.sql
server/src/    app.js, index.js, db/, middleware/, routes/, services/
server/test/   node:test suites
client/src/    pages/, components/, api.js
```

`client/src/pages/Debts.jsx` and `Subscriptions.jsx` belong to phase 2 and are not wired into navigation.

## Conventions

- Money is `DECIMAL(15,2)`, returned as strings by `mysql2`; all arithmetic happens in SQL, never in JS `Number`.
- Every resource query is scoped by `user_id` in the `WHERE` clause.
- Sessions are rows in a `sessions` table; the cookie holds a random 256-bit token, the database stores its SHA-256.
