// Queue operations
export {
  sortQueue,
  generateId,
  createEntry,
  canJoinQueue,
  applyVote,
  advanceQueue,
  removeFromQueue,
  canRemoveEntry,
  canSkipCurrent,
  reorderEntry,
} from './queue.js'

// YouTube utilities
export {
  extractVideoId,
  buildYoutubeUrl,
  buildEmbedUrl,
  parseDuration,
  parseSearchResponse,
} from './youtube.js'

// Performance tracking
export {
  createPerformance,
  getPopularSongs,
  isFirstPerformance,
  getPerformanceHistory,
  calculateSingerStats,
} from './performances.js'

// Identity & PIN
export {
  generateSalt,
  hashPin,
  verifyPin,
  isValidPin,
  normalizeName,
} from './identity.js'
