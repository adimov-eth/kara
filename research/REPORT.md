# Karaoke Queue Research Report
Date: 2026-01-30

## Scope & Method
This report surveys comparable karaoke queue solutions (open-source projects, hosted services,
and remote-control extensions). The goal is to extract architecture patterns, UX best practices,
and pitfalls to avoid, then translate them into actionable design guidance for Karaoke Queue.

## Landscape Summary (Selected)
| Project | Type | Notable Ideas |
| --- | --- | --- |
| PiKaraoke | Open-source KTV server | QR join, web remote, YouTube + local library, admin controls, pitch/tempo/volume tools |
| OpenHomeKaraoke | Open-source (PiKaraoke fork) | WebSocket updates, QR join, vocal splitter, speech recognition scoring, queue/admin tools |
| Syng.Rocks | Hosted + self-host | No-login, privacy-friendly, admin mode, multi-source media (YouTube/S3/local) |
| Karaoke Eternal | Web app | Multi-room sessions, QR join, queue management, host controls |
| SongUp | Hosted web app | Ultra-simple join, per-user queue cap (2 songs), central display |
| OpenKJ + Songbook | Desktop host + web submit | Traditional host software paired with web search/submit |
| YouTube Karaoke Extension | Chrome extension | YouTube overlay controls, singer rotation, dual-screen support |
| KaraFun Remote | Commercial | QR remote, permissions, admin grant flow |
| Youka Remote | Commercial | Session code + QR join, web remote controls |
| Karanote | Hosted requests tool | QR requests + real-time host messaging |

## Deep Dives (Promising Cases)
### 1) PiKaraoke (open-source KTV system)
**Why it matters**: A widely adopted DIY baseline. It blends “TV host” playback with guest
queue management and a web remote.

**Key takeaways**
- QR-based web remote lowers friction for guests.
- Supports both YouTube and local media, reducing dependency on a single provider.
- Includes host-grade controls (key/tempo/volume) that improve the venue experience.
- Runs as a self-contained server, which maps well to a single Worker deployment model.

**Design inspiration**
- Add a “host tools” panel in the player view for quick control.
- Make multi-source media (YouTube + optional local or S3) a roadmap priority.

### 2) OpenHomeKaraoke (feature-rich fork)
**Why it matters**: Extends PiKaraoke with more “professional” controls and
real-time infrastructure (WebSockets), which aligns with your WS-first design.

**Key takeaways**
- WebSocket updates are called out explicitly as a bandwidth/realtime improvement.
- Includes advanced features (speech recognition scoring, vocal splitter),
  suggesting strong demand for host‑side performance tools.
- Recommends QR join and phone-based queue interaction.

**Design inspiration**
- Keep WS as the default, with polling fallback (already true).
- Consider adding host overlays (key/pitch controls) as a paid/pro feature later.

### 3) Syng.Rocks (privacy-friendly, multi-source)
**Why it matters**: Shows that “no login + privacy” can be a core differentiator.
Also showcases multi-source ingestion (YouTube + S3/local), which is a resilience
play against provider changes.

**Key takeaways**
- No-login is a market expectation for parties.
- Multi-source media reduces platform risk.
- Admin mode is a first-class UX element, not a hidden panel.

**Design inspiration**
- Make “no login” and privacy a prominent UX promise.
- Add an explicit admin mode entry with a clear PIN flow.

### 4) Karaoke Eternal (multi-room web app)
**Why it matters**: Strong example of room/session lifecycle and multi-room UX.

**Key takeaways**
- Rooms are a core concept; QR entry is expected.
- A single web interface can serve guest + host flows with clear separation.

**Design inspiration**
- Enhance “room lifecycle” UX: open/close session, share QR, “room ended”.

### 5) SongUp (simplicity + queue caps)
**Why it matters**: The minimal UX and strict queue limits fight spam
and keep waiting times reasonable.

**Key takeaways**
- Hard caps (e.g., 2 songs per user) are an accepted tradeoff.
- Guests value “just scan, add, done” more than feature depth.

**Design inspiration**
- Add per-user queue caps (configurable per room).

## Patterns & Best Practices
1) **QR-first entry**: The default for most products; reduces typing and boosts adoption.
2) **Queue caps**: Many systems limit songs per user to prevent spam and long waits.
3) **Admin control + permissions**: Commercial apps emphasize role/permission flows.
4) **Multi-source media**: Supports reliability and resilience beyond YouTube alone.
5) **Multi-room lifecycle**: Rooms are treated as sessions with shareable entry codes.
6) **Realtime + fallback**: WebSocket is ideal, but polling fallback is critical.

## Pitfalls to Avoid
- **Trusting client-side claims** (e.g., PIN verification without server token).
- **YouTube lock-in** without a fallback ingestion strategy.
- **Weak moderation** in public rooms (spam, offensive names, duplicate entries).
- **Confusing room lifecycle** (old QR codes, stale sessions).

## Recommendations for Karaoke Queue
**Short term**
- Add per-user queue caps and server-side enforcement.
- Match WS and HTTP validation logic.
- Use a server-issued verification token for claimed names.

**Mid term**
- Room settings: max queue size, max song length, allow/disallow voting.
- Persist admin sessions with clear expiry.
- Extension room selection and pinning.

**Long term**
- Multi-source support (local library, S3, Spotify).
- Host-grade playback controls (key, tempo, volume).
- Analytics: popular songs, singer stats, room activity trends.

## Source Links
```
PiKaraoke: https://github.com/vicwomg/pikaraoke
OpenHomeKaraoke: https://github.com/xuancong84/OpenHomeKaraoke
Syng.Rocks: https://site.syng.rocks/
Karaoke Eternal: https://www.karaoke-eternal.com/docs/karaoke-eternal-app/
SongUp: https://songup.tv/
OpenKJ: https://www.openkj.org/software
Songbook (OpenKJ submit): https://sourceforge.net/projects/openkj-songbook/
YouTube Karaoke Extension: https://chromewebstore.google.com/detail/youtube-karaoke-extension/nephnenkcakiaiejolafiiiefcdikjaj
KaraFun Remote: https://www.karafun.com/help/general-questions-iphone_454.html
Youka Remote: https://youka.info/en/article/5526
Karanote: https://karanote.io/
KaraokeTube: https://github.com/jyr/KaraokeTube
```
