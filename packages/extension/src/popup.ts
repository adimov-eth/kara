import type { StoredState, ExtensionConfig } from './types.js'

const CONFIG_KEY = 'extensionConfig'

const statusDot = document.getElementById('statusDot') as HTMLDivElement
const statusText = document.getElementById('statusText') as HTMLSpanElement
const nowPlayingCard = document.getElementById('nowPlayingCard') as HTMLDivElement
const emptyCard = document.getElementById('emptyCard') as HTMLDivElement
const nowPlayingTitle = document.getElementById('nowPlayingTitle') as HTMLDivElement
const nowPlayingSinger = document.getElementById('nowPlayingSinger') as HTMLDivElement
const queueCount = document.getElementById('queueCount') as HTMLParagraphElement
const errorText = document.getElementById('errorText') as HTMLDivElement

const serverOriginInput = document.getElementById('serverOrigin') as HTMLInputElement
const roomIdInput = document.getElementById('roomId') as HTMLInputElement
const playerTokenInput = document.getElementById('playerToken') as HTMLInputElement
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement
const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement
const openTabBtn = document.getElementById('openTabBtn') as HTMLButtonElement

async function saveConfig(): Promise<void> {
  const config: ExtensionConfig = {
    serverOrigin: serverOriginInput.value.trim(),
    roomId: roomIdInput.value.trim() || 'default',
    playerToken: playerTokenInput.value.trim(),
  }

  await chrome.storage.local.set({ [CONFIG_KEY]: config })
  chrome.runtime.sendMessage({ type: 'saveConfig', config }).catch(() => {})
}

async function updateUI(): Promise<void> {
  const stored = (await chrome.storage.local.get([
    'connected',
    'queueState',
    'connectionError',
    CONFIG_KEY,
  ])) as Partial<StoredState> & { [CONFIG_KEY]?: ExtensionConfig }

  const connected = Boolean(stored.connected)

  if (connected) {
    statusDot.classList.remove('disconnected')
    statusDot.classList.add('connected')
    statusText.textContent = 'Connected'
    connectBtn.textContent = 'Disconnect'
  } else {
    statusDot.classList.remove('connected')
    statusDot.classList.add('disconnected')
    statusText.textContent = 'Disconnected'
    connectBtn.textContent = 'Connect'
  }

  const config = stored[CONFIG_KEY]
  if (config) {
    serverOriginInput.value = config.serverOrigin ?? ''
    roomIdInput.value = config.roomId ?? ''
    playerTokenInput.value = config.playerToken ?? ''
  }

  if (stored.queueState?.nowPlaying) {
    nowPlayingCard.style.display = 'block'
    emptyCard.style.display = 'none'
    nowPlayingTitle.textContent = stored.queueState.nowPlaying.title
    nowPlayingSinger.textContent = stored.queueState.nowPlaying.name
  } else {
    nowPlayingCard.style.display = 'none'
    emptyCard.style.display = 'block'
  }

  const count = stored.queueState?.queue.length ?? 0
  queueCount.textContent = count === 1 ? '1 song in queue' : `${count} songs in queue`

  if (stored.connectionError) {
    errorText.style.display = 'block'
    errorText.textContent = stored.connectionError
  } else {
    errorText.style.display = 'none'
  }
}

saveBtn.addEventListener('click', async () => {
  await saveConfig()
  updateUI()
})

connectBtn.addEventListener('click', () => {
  if (connectBtn.textContent === 'Disconnect') {
    chrome.runtime.sendMessage({ type: 'disconnect' }).catch(() => {})
  } else {
    chrome.runtime.sendMessage({ type: 'connect' }).catch(() => {})
  }
})

openTabBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'openTab' }).catch(() => {})
})

chrome.storage.local.onChanged.addListener(() => {
  updateUI()
})

updateUI()
