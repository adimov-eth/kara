/**
 * YouTube IFrame Player API type definitions
 * @see https://developers.google.com/youtube/iframe_api_reference
 */

declare namespace YT {
  /** Player state constants */
  const PlayerState: {
    UNSTARTED: -1
    ENDED: 0
    PLAYING: 1
    PAUSED: 2
    BUFFERING: 3
    CUED: 5
  }

  interface PlayerOptions {
    height?: string | number
    width?: string | number
    videoId?: string
    playerVars?: PlayerVars
    events?: PlayerEvents
  }

  interface PlayerVars {
    autoplay?: 0 | 1
    cc_lang_pref?: string
    cc_load_policy?: 0 | 1
    color?: 'red' | 'white'
    controls?: 0 | 1 | 2
    disablekb?: 0 | 1
    enablejsapi?: 0 | 1
    end?: number
    fs?: 0 | 1
    hl?: string
    iv_load_policy?: 1 | 3
    list?: string
    listType?: 'playlist' | 'search' | 'user_uploads'
    loop?: 0 | 1
    modestbranding?: 0 | 1
    origin?: string
    playlist?: string
    playsinline?: 0 | 1
    rel?: 0 | 1
    showinfo?: 0 | 1
    start?: number
    widget_referrer?: string
  }

  interface PlayerEvents {
    onReady?: (event: PlayerEvent) => void
    onStateChange?: (event: OnStateChangeEvent) => void
    onPlaybackQualityChange?: (event: OnPlaybackQualityChangeEvent) => void
    onPlaybackRateChange?: (event: OnPlaybackRateChangeEvent) => void
    onError?: (event: OnErrorEvent) => void
    onApiChange?: (event: PlayerEvent) => void
  }

  interface PlayerEvent {
    target: Player
  }

  interface OnStateChangeEvent extends PlayerEvent {
    data: number
  }

  interface OnPlaybackQualityChangeEvent extends PlayerEvent {
    data: string
  }

  interface OnPlaybackRateChangeEvent extends PlayerEvent {
    data: number
  }

  interface OnErrorEvent extends PlayerEvent {
    data: number
  }

  interface VideoData {
    video_id: string
    title: string
    author: string
  }

  class Player {
    constructor(elementId: string | HTMLElement, options: PlayerOptions)

    // Playback controls
    playVideo(): void
    pauseVideo(): void
    stopVideo(): void
    seekTo(seconds: number, allowSeekAhead?: boolean): void

    // Video info
    getDuration(): number
    getCurrentTime(): number
    getVideoData(): VideoData
    getVideoUrl(): string
    getVideoEmbedCode(): string

    // Player state
    getPlayerState(): number
    getPlaybackRate(): number
    setPlaybackRate(suggestedRate: number): void
    getAvailablePlaybackRates(): number[]

    // Volume
    mute(): void
    unMute(): void
    isMuted(): boolean
    setVolume(volume: number): void
    getVolume(): number

    // Size
    setSize(width: number, height: number): void

    // Playlist
    getPlaylist(): string[]
    getPlaylistIndex(): number
    nextVideo(): void
    previousVideo(): void
    playVideoAt(index: number): void

    // Load
    loadVideoById(videoId: string, startSeconds?: number, suggestedQuality?: string): void
    loadVideoByUrl(mediaContentUrl: string, startSeconds?: number, suggestedQuality?: string): void
    cueVideoById(videoId: string, startSeconds?: number, suggestedQuality?: string): void
    cueVideoByUrl(mediaContentUrl: string, startSeconds?: number, suggestedQuality?: string): void

    // Quality
    getPlaybackQuality(): string
    setPlaybackQuality(suggestedQuality: string): void
    getAvailableQualityLevels(): string[]

    // Iframe
    getIframe(): HTMLIFrameElement

    // Destroy
    destroy(): void

    // Event handling
    addEventListener<T extends keyof PlayerEvents>(
      event: T,
      listener: PlayerEvents[T]
    ): void
    removeEventListener<T extends keyof PlayerEvents>(
      event: T,
      listener: PlayerEvents[T]
    ): void
  }
}

interface Window {
  YT?: typeof YT
  onYouTubeIframeAPIReady?: () => void
}
