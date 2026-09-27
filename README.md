# Platform Backend

Community voting rounds, raid telemetry, the shot grab-box production pipeline, the studio Discord bot and the web app.

## Getting started

```bash
npm ci
cp .env.example .env
npm run db:migrate
npm run dev # set LOG_FORMAT=pretty for readable logs
npm run dev:discord # the Discord bot
npm run dev:web # the web app
```

## Docker

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

## License

AGPL-3.0-only. See [LICENSE](LICENSE).
