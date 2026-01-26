import type { StoredState } from './types.js'

const statusDot = document.getElementById('statusDot')!
const statusText = document.getElementById('statusText')!
const nowPlayingCard = document.getElementById('nowPlayingCard')!
const emptyCard = document.getElementById('emptyCard')!
const nowPlayingTitle = document.getElementById('nowPlayingTitle')!
const nowPlayingSinger = document.getElementById('nowPlayingSinger')!
const queueCount = document.getElementById('queueCount')!

async function updateUI(): Promise<void> {
  const stored = (await chrome.storage.local.get(['connected', 'queueState'])) as Partial<StoredState>

  // Update connection status
  if (stored.connected) {
    statusDot.classList.remove('disconnected')
    statusDot.classList.add('connected')
    statusText.textContent = 'Connected'
  } else {
    statusDot.classList.remove('connected')
    statusDot.classList.add('disconnected')
    statusText.textContent = 'Disconnected'
  }

  // Update now playing
  if (stored.queueState?.nowPlaying) {
    nowPlayingCard.style.display = 'block'
    emptyCard.style.display = 'none'
    nowPlayingTitle.textContent = stored.queueState.nowPlaying.youtubeTitle
    nowPlayingSinger.textContent = stored.queueState.nowPlaying.name
  } else {
    nowPlayingCard.style.display = 'none'
    emptyCard.style.display = 'block'
  }

  // Update queue count
  const count = stored.queueState?.queue.length ?? 0
  queueCount.textContent = count === 1 ? '1 song in queue' : `${count} songs in queue`
}

// Listen for storage changes
chrome.storage.local.onChanged.addListener(() => {
  updateUI()
})

// Initial update
updateUI()
