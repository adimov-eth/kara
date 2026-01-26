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
  updateSongStats,
  calculatePopularity,
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
