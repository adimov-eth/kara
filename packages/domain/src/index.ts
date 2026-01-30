// Queue operations
export {
  sortQueue,
  sortByVotes,
  sortQueueByMode,
  generateId,
  createEntry,
  canJoinQueue,
  canAddToGeneralQueue,
  canAddToStack,
  createStackedSong,
  promoteFromStack,
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

// Validation
export {
  validateName,
  validateTitle,
  validateVideoId,
  sanitizeName,
  sanitizeTitle,
  type ValidationError,
} from './validation.js'
