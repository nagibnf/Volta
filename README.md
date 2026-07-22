# VOLTA Core

Nova fundação do VOLTA em Next.js e TypeScript.

## Funcionalidades

- mapa real com MapLibre;
- 23 estações curadas em São Paulo;
- catálogo inicial de veículos;
- filtros por potência, corrente e status;
- geolocalização e distância;
- compatibilidade por conector;
- estimativa de energia, tempo, custo e autonomia;
- navegação por Google Maps e Waze;
- validação de estação e registro de recarga no navegador;
- APIs de estações, veículos e saúde;
- esquema PostgreSQL preparado para evolução full-stack.

## Execução

```bash
npm install
npm run dev
```

A branch `agent/volta-core` deve ser validada pelo preview da Vercel antes de qualquer merge em `main`.
