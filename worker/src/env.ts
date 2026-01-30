export interface Env {
  KARAOKE_KV: KVNamespace
  ROOM: DurableObjectNamespace
  GITHUB_TOKEN: string         // PAT with repo:issues scope
  // Google OAuth
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  // Session signing
  SESSION_SECRET: string       // 32+ char hex string for JWT signing
}
