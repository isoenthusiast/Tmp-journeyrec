# Tmp-journeyrec

A small temporary journey tracker deployed on Railway.

## Local development

Requires Node.js 20+.

```sh
npm test
npm start
```

Open http://localhost:3000. The app exposes `GET /health`, `GET /api/journeys`, `POST /api/journeys`, `GET /api/journeys/:id/milestones`, and `POST /api/journeys/:id/milestones`. Milestones accept `start`, `waypoint`, or `end` types. A milestone photo is OCR-read in the browser for dashboard readings; GPS is read only from the photo's EXIF metadata. All extracted values remain editable before saving.

Milestones also store `capturedAt`, the timestamp from the photo's EXIF metadata. The extractor reads `DateTimeOriginal`, then falls back to EXIF create/modify date; the value remains editable for correction. The save time remains separate as `createdAt`.

Journey and milestone data is stored in Railway PostgreSQL when `DATABASE_URL` is configured. The app keeps an in-memory fallback for local tests without a database. Railway supplies the `PORT` environment variable at runtime.
