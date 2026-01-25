# 🎤 Karaoke Queue

A simple, real-time karaoke queue manager built as a Cloudflare Worker with Durable Objects for persistent state.

## Features

- **Join the queue** — Enter your name to get in line
- **One song rule** — You can only rejoin after you've sung (prevents queue hogging)
- **Real-time updates** — Queue refreshes automatically every 3 seconds
- **Mobile-friendly** — Designed for phones at a karaoke party
- **Persistent state** — Queue survives page refreshes and reconnections
- **Admin controls** — "Song Complete" button advances the queue

## Deployment

### Prerequisites

1. A Cloudflare account
2. [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed

```bash
npm install -g wrangler
```

3. Login to Cloudflare:

```bash
wrangler login
```

### Deploy

```bash
cd karaoke-queue
wrangler deploy
```

That's it! Wrangler will output your worker URL like:
```
https://karaoke-queue.<your-subdomain>.workers.dev
```

Share this link with your friends at the party.

## How It Works

- **Cloudflare Worker** serves the HTML/CSS/JS interface
- **Durable Object** (`KaraokeQueue`) maintains the queue state
- State persists across requests and even worker restarts
- Polling every 3 seconds keeps everyone in sync

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/queue` | Get current queue and completed list |
| POST | `/api/join` | Join queue (body: `{ "name": "..." }`) |
| POST | `/api/done` | Mark current singer as done, advance queue |
| POST | `/api/remove` | Remove someone (body: `{ "index": N }`) |

## Customization

Edit the `HTML` constant in `worker.js` to customize:
- Colors (CSS variables at the top)
- Branding/title
- Polling interval (default 3000ms)

## Cost

Cloudflare Workers free tier includes:
- 100,000 requests/day
- Durable Objects: 1 million requests/month

More than enough for a karaoke party!

---

Have fun singing! 🎵
