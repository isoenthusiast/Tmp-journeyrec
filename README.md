# Tmp-journeyrec

A small temporary journey tracker deployed on Railway.

## Local development

Requires Node.js 20+.

```sh
npm test
npm start
```

Open http://localhost:3000. The app exposes `GET /health`, `GET /api/journeys`, and `POST /api/journeys`.

Journey data is held in process memory and is intentionally non-persistent for this temporary app. Railway supplies the `PORT` environment variable at runtime.
