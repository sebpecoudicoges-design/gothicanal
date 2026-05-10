import './style.css'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'

type Visibility = 'public' | 'private'
type ViewKey = 'public' | 'private' | 'shared' | 'messages'

type VideoItem = {
  id: string
  title: string
  description: string | null
  category: string | null
  public_url: string | null
  storage_path: string
  storage_bucket: string
  visibility: Visibility
  owner_user_id: string | null
  owner_alias: string
  created_at: string
}

type Profile = {
  user_id: string
  display_name: string
}

type VideoShare = {
  id: string
  video_id: string
  owner_user_id: string
  shared_with_user_id: string
  created_at: string
}

type DirectThread = {
  id: string
  owner_user_id: string
  participant_user_id: string
  updated_at: string
}

type DirectMessage = {
  id: string
  thread_id: string
  sender_user_id: string
  body: string
  created_at: string
}

type SupabaseErrorLike = {
  code?: string
  message?: string
}

const CATEGORIES = ['Rituel', 'Nocturne', 'Archive', 'Velours', 'Obscur', 'Autre']
const PUBLIC_BUCKET = 'videos'
const PRIVATE_BUCKET = 'private-videos'
const MAX_VIDEO_SIZE = 250 * 1024 * 1024
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']
const ANON_ID_KEY = 'gothicanal:anonymous-id'
const ANON_ALIAS_KEY = 'gothicanal:anonymous-alias'

let session: Session | null = null
let displayName = ''
let activeView: ViewKey = 'public'
let selectedVideoId: string | null = null
let selectedThreadId: string | null = null
let isUploading = false

let publicVideos: VideoItem[] = []
let privateVideos: VideoItem[] = []
let sharedVideos: VideoItem[] = []
let shares: VideoShare[] = []
let profiles: Profile[] = []
let threads: DirectThread[] = []
let messages: DirectMessage[] = []
let signedUrls = new Map<string, string>()
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('App root not found')

function getOrCreateAnonymousId() {
  const existing = localStorage.getItem(ANON_ID_KEY)
  if (existing) return existing

  const next = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  localStorage.setItem(ANON_ID_KEY, next)
  return next
}

const anonymousId = getOrCreateAnonymousId()

function getAnonymousAlias() {
  return localStorage.getItem(ANON_ALIAS_KEY) || 'Visiteur nocturne'
}

function clampName(value: string) {
  const next = value.trim().slice(0, 40)
  return next.length >= 2 ? next : 'Visiteur nocturne'
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function isMissingSchemaError(error: SupabaseErrorLike | null | undefined) {
  return error?.code === '42703' || error?.code === '42P01' || error?.code === 'PGRST205'
}

function getAuthorAlias() {
  return clampName(displayName || getAnonymousAlias())
}

function currentUserId() {
  return session?.user.id ?? null
}

function getAllVideos() {
  return [...publicVideos, ...privateVideos, ...sharedVideos]
}

function getVisibleVideos() {
  if (activeView === 'private') return privateVideos
  if (activeView === 'shared') return sharedVideos
  return publicVideos
}

function getSelectedVideo() {
  return getAllVideos().find((video) => video.id === selectedVideoId) ?? null
}

function profileName(userId: string | null) {
  if (!userId) return 'Anonyme'
  return profiles.find((profile) => profile.user_id === userId)?.display_name ?? userId.slice(0, 8)
}

function otherThreadUser(thread: DirectThread) {
  const userId = currentUserId()
  if (!userId) return thread.participant_user_id
  return thread.owner_user_id === userId ? thread.participant_user_id : thread.owner_user_id
}

app.innerHTML = `
  <main class="app-shell">
    <aside class="app-sidebar">
      <a href="#public" class="brandmark" aria-label="GothiCanal">
        <span class="brandmark__dot"></span>
        <span class="brandmark__text">GothiCanal</span>
      </a>

      <nav class="view-nav" aria-label="Navigation principale">
        <button class="view-nav__item view-nav__item--active" type="button" data-view="public">Archive publique</button>
        <button class="view-nav__item" type="button" data-view="private">Ma bibliothèque</button>
        <button class="view-nav__item" type="button" data-view="shared">Partagés avec moi</button>
        <button class="view-nav__item" type="button" data-view="messages">Messagerie</button>
      </nav>

      <section class="account-card" id="account">
        <span class="section-kicker">Compte</span>
        <h2 id="accountTitle">Présence anonyme</h2>
        <p id="accountSummary">Connecte-toi pour créer une bibliothèque privée et partager tes vidéos.</p>

        <form id="aliasForm" class="compact-form">
          <label for="anonymousAlias">Nom anonyme</label>
          <div class="inline-field">
            <input id="anonymousAlias" name="alias" type="text" maxlength="40" minlength="2" required />
            <button class="icon-button" type="submit" title="Enregistrer l'alias">OK</button>
          </div>
        </form>

        <form id="authForm" class="auth-form">
          <label for="displayName">Nom de compte</label>
          <input id="displayName" name="displayName" type="text" maxlength="40" minlength="2" placeholder="Ex. Sélène" />
          <label for="authEmail">Email</label>
          <input id="authEmail" name="email" type="email" autocomplete="email" />
          <label for="authPassword">Mot de passe</label>
          <input id="authPassword" name="password" type="password" minlength="6" autocomplete="current-password" />
          <div class="button-row">
            <button id="signInButton" class="primary-button" type="submit">Connexion</button>
            <button id="signUpButton" class="ghost-button" type="button">Créer</button>
            <button id="signOutButton" class="ghost-button hidden" type="button">Sortir</button>
          </div>
          <p id="authStatus" class="status-line" aria-live="polite"></p>
        </form>
      </section>
    </aside>

    <section class="main-workspace">
      <header class="workspace-header">
        <div>
          <span class="section-kicker">Bibliothèque vidéo</span>
          <h1 id="viewTitle">Archive publique</h1>
          <p id="viewSubtitle">Les vidéos visibles par tous restent ici. Les contenus privés vivent dans ton espace.</p>
        </div>
        <div class="workspace-metrics">
          <span><strong id="publicCount">0</strong> publiques</span>
          <span><strong id="privateCount">0</strong> privées</span>
          <span><strong id="sharedCount">0</strong> partagées</span>
        </div>
      </header>

      <section class="workspace-grid">
        <section class="panel library-panel">
          <div class="panel-toolbar">
            <div class="field">
              <label for="searchInput">Recherche</label>
              <input id="searchInput" type="search" placeholder="Titre, description, auteur ou catégorie" autocomplete="off" />
            </div>
            <div class="field">
              <label for="categoryFilter">Catégorie</label>
              <select id="categoryFilter">
                <option value="all">Toutes</option>
                ${CATEGORIES.map((category) => `<option value="${category}">${category}</option>`).join('')}
              </select>
            </div>
          </div>

          <form id="uploadForm" class="upload-console">
            <div class="upload-console__header">
              <div>
                <span class="section-kicker">Ajout</span>
                <h2>Nouvelle vidéo</h2>
              </div>
              <div class="segmented-control" role="group" aria-label="Visibilité">
                <label><input type="radio" name="visibility" value="public" checked /> Public</label>
                <label><input type="radio" name="visibility" value="private" /> Privé</label>
              </div>
            </div>
            <div class="upload-grid">
              <input id="videoTitle" name="title" type="text" maxlength="120" required placeholder="Titre" />
              <select id="videoCategory" name="category" required>
                ${CATEGORIES.map((category) => `<option value="${category}">${category}</option>`).join('')}
              </select>
              <input id="videoFile" name="file" type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v" required />
            </div>
            <textarea id="videoDescription" name="description" rows="3" maxlength="500" placeholder="Description"></textarea>
            <button id="uploadButton" class="primary-button" type="submit">Ajouter à la bibliothèque</button>
            <p id="formStatus" class="status-line" aria-live="polite"></p>
          </form>

          <div id="videoList" class="video-list"></div>
        </section>

        <aside class="detail-stack">
          <article class="panel player-panel" id="player">
            <div class="panel-heading">
              <span class="section-kicker">Lecture</span>
              <h2 id="playerTitle">Aucune sélection</h2>
              <p id="playerMeta">Choisis une vidéo dans une bibliothèque.</p>
            </div>
            <div class="player-frame" id="playerFrame">
              <span>Le projecteur attend.</span>
            </div>
            <p id="playerDescription" class="muted-text"></p>
          </article>

          <article class="panel share-panel">
            <div class="panel-heading">
              <span class="section-kicker">Partage privé</span>
              <h2>Partager avec un utilisateur</h2>
              <p>Le partage concerne uniquement tes vidéos privées.</p>
            </div>
            <form id="shareForm" class="compact-form">
              <select id="shareUserSelect" name="targetUser"></select>
              <button class="ghost-button" type="submit">Partager la sélection</button>
              <p id="shareStatus" class="status-line" aria-live="polite"></p>
            </form>
            <div id="shareList" class="share-list"></div>
          </article>

          <article class="panel messages-panel" id="messagesPanel">
            <div class="panel-heading">
              <span class="section-kicker">Interne</span>
              <h2>Messagerie utilisateur</h2>
              <p>Les messages internes demandent un compte.</p>
            </div>
            <form id="threadForm" class="message-tools">
              <select id="threadUserSelect" name="targetUser"></select>
              <button class="ghost-button" type="submit">Ouvrir</button>
            </form>
            <div id="threadList" class="thread-list"></div>
            <div id="messageList" class="message-list"></div>
            <form id="directMessageForm" class="message-form">
              <input id="directMessageInput" name="message" maxlength="1200" autocomplete="off" placeholder="Message privé..." />
              <button class="primary-button" type="submit">Envoyer</button>
            </form>
          </article>
        </aside>
      </section>
    </section>
  </main>
`

const viewButtons = document.querySelectorAll<HTMLButtonElement>('[data-view]')
const viewTitle = document.querySelector<HTMLHeadingElement>('#viewTitle')
const viewSubtitle = document.querySelector<HTMLParagraphElement>('#viewSubtitle')
const publicCount = document.querySelector<HTMLSpanElement>('#publicCount')
const privateCount = document.querySelector<HTMLSpanElement>('#privateCount')
const sharedCount = document.querySelector<HTMLSpanElement>('#sharedCount')
const searchInput = document.querySelector<HTMLInputElement>('#searchInput')
const categoryFilter = document.querySelector<HTMLSelectElement>('#categoryFilter')
const videoList = document.querySelector<HTMLDivElement>('#videoList')
const uploadForm = document.querySelector<HTMLFormElement>('#uploadForm')
const uploadButton = document.querySelector<HTMLButtonElement>('#uploadButton')
const formStatus = document.querySelector<HTMLParagraphElement>('#formStatus')
const playerTitle = document.querySelector<HTMLHeadingElement>('#playerTitle')
const playerMeta = document.querySelector<HTMLParagraphElement>('#playerMeta')
const playerDescription = document.querySelector<HTMLParagraphElement>('#playerDescription')
const playerFrame = document.querySelector<HTMLDivElement>('#playerFrame')
const aliasForm = document.querySelector<HTMLFormElement>('#aliasForm')
const anonymousAliasInput = document.querySelector<HTMLInputElement>('#anonymousAlias')
const accountTitle = document.querySelector<HTMLHeadingElement>('#accountTitle')
const accountSummary = document.querySelector<HTMLParagraphElement>('#accountSummary')
const authForm = document.querySelector<HTMLFormElement>('#authForm')
const displayNameInput = document.querySelector<HTMLInputElement>('#displayName')
const authEmailInput = document.querySelector<HTMLInputElement>('#authEmail')
const authPasswordInput = document.querySelector<HTMLInputElement>('#authPassword')
const signUpButton = document.querySelector<HTMLButtonElement>('#signUpButton')
const signOutButton = document.querySelector<HTMLButtonElement>('#signOutButton')
const authStatus = document.querySelector<HTMLParagraphElement>('#authStatus')
const shareForm = document.querySelector<HTMLFormElement>('#shareForm')
const shareUserSelect = document.querySelector<HTMLSelectElement>('#shareUserSelect')
const shareStatus = document.querySelector<HTMLParagraphElement>('#shareStatus')
const shareList = document.querySelector<HTMLDivElement>('#shareList')
const threadForm = document.querySelector<HTMLFormElement>('#threadForm')
const threadUserSelect = document.querySelector<HTMLSelectElement>('#threadUserSelect')
const threadList = document.querySelector<HTMLDivElement>('#threadList')
const messageList = document.querySelector<HTMLDivElement>('#messageList')
const directMessageForm = document.querySelector<HTMLFormElement>('#directMessageForm')
const directMessageInput = document.querySelector<HTMLInputElement>('#directMessageInput')

function setStatus(element: HTMLElement | null, message: string, tone: 'neutral' | 'success' | 'error' = 'neutral') {
  if (!element) return
  element.textContent = message
  element.dataset.tone = tone
}

function renderShell() {
  viewButtons.forEach((button) => {
    button.classList.toggle('view-nav__item--active', button.dataset.view === activeView)
  })

  const copy: Record<ViewKey, [string, string]> = {
    public: ['Archive publique', 'Toutes les vidéos partagées avec la communauté.'],
    private: ['Ma bibliothèque privée', 'Tes vidéos privées restent visibles seulement par toi et les utilisateurs invités.'],
    shared: ['Partagés avec moi', 'Les vidéos privées auxquelles d’autres utilisateurs t’ont donné accès.'],
    messages: ['Messagerie interne', 'Conversations privées entre comptes utilisateur.'],
  }

  if (viewTitle) viewTitle.textContent = copy[activeView][0]
  if (viewSubtitle) viewSubtitle.textContent = copy[activeView][1]
  if (publicCount) publicCount.textContent = String(publicVideos.length)
  if (privateCount) privateCount.textContent = String(privateVideos.length)
  if (sharedCount) sharedCount.textContent = String(sharedVideos.length)
}

function renderAccount() {
  if (anonymousAliasInput) anonymousAliasInput.value = getAnonymousAlias()

  if (!accountTitle || !accountSummary || !displayNameInput || !authEmailInput || !authPasswordInput || !signOutButton) return

  if (!session) {
    accountTitle.textContent = 'Présence anonyme'
    accountSummary.textContent = 'Connecte-toi pour créer une bibliothèque privée, partager des vidéos et envoyer des messages.'
    displayNameInput.disabled = false
    authEmailInput.disabled = false
    authPasswordInput.disabled = false
    signOutButton.classList.add('hidden')
    return
  }

  accountTitle.textContent = displayName || session.user.email || 'Compte'
  accountSummary.textContent = 'Bibliothèque privée, partages ciblés et messagerie interne sont actifs.'
  displayNameInput.value = displayName
  authEmailInput.value = session.user.email ?? ''
  authEmailInput.disabled = true
  authPasswordInput.disabled = true
  signOutButton.classList.remove('hidden')
}

function renderProfileSelectors() {
  const userId = currentUserId()
  const candidates = profiles.filter((profile) => profile.user_id !== userId)
  const options = candidates.length
    ? candidates.map((profile) => `<option value="${profile.user_id}">${escapeHtml(profile.display_name)}</option>`).join('')
    : '<option value="">Aucun autre utilisateur</option>'

  if (shareUserSelect) shareUserSelect.innerHTML = options
  if (threadUserSelect) threadUserSelect.innerHTML = options
}

function renderVideos() {
  renderShell()
  if (!videoList) return

  if (activeView === 'messages') {
    videoList.innerHTML = '<div class="empty-state"><h3>Messagerie ouverte</h3><p>Utilise le panneau de droite pour écrire à un utilisateur.</p></div>'
    return
  }

  const search = searchInput?.value.trim().toLowerCase() ?? ''
  const category = categoryFilter?.value ?? 'all'
  const videos = getVisibleVideos().filter((video) => {
    const haystack = `${video.title} ${video.description ?? ''} ${video.category ?? ''} ${video.owner_alias}`.toLowerCase()
    return (category === 'all' || video.category === category) && haystack.includes(search)
  })

  if (!videos.length) {
    videoList.innerHTML = '<div class="empty-state"><h3>Aucune vidéo</h3><p>Cette section est vide pour le moment.</p></div>'
    return
  }

  videoList.innerHTML = videos
    .map((video) => {
      const isSelected = video.id === selectedVideoId
      const badge = video.visibility === 'private' ? 'Privé' : 'Public'
      return `
        <button class="video-row ${isSelected ? 'video-row--active' : ''}" type="button" data-video-id="${video.id}">
          <span class="video-row__badge">${badge}</span>
          <span>
            <strong>${escapeHtml(video.title)}</strong>
            <small>${escapeHtml(video.category ?? 'Sans catégorie')} · ${escapeHtml(video.owner_alias)} · ${formatDate(video.created_at)}</small>
          </span>
        </button>
      `
    })
    .join('')

  videoList.querySelectorAll<HTMLButtonElement>('[data-video-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      selectedVideoId = button.dataset.videoId ?? null
      renderVideos()
      await renderPlayer()
      renderShares()
    })
  })
}

async function getPlaybackUrl(video: VideoItem) {
  if (video.visibility === 'public') return video.public_url
  const existing = signedUrls.get(video.id)
  if (existing) return existing

  const { data, error } = await supabase.storage
    .from(video.storage_bucket || PRIVATE_BUCKET)
    .createSignedUrl(video.storage_path, 60 * 60)

  if (error) {
    console.error(error)
    return null
  }

  signedUrls.set(video.id, data.signedUrl)
  return data.signedUrl
}

async function renderPlayer() {
  const video = getSelectedVideo()
  if (!playerTitle || !playerMeta || !playerDescription || !playerFrame) return

  if (!video) {
    playerTitle.textContent = 'Aucune sélection'
    playerMeta.textContent = 'Choisis une vidéo dans une bibliothèque.'
    playerDescription.textContent = ''
    playerFrame.innerHTML = '<span>Le projecteur attend.</span>'
    return
  }

  playerTitle.textContent = video.title
  playerMeta.textContent = `${video.visibility === 'private' ? 'Privé' : 'Public'} · ${video.category ?? 'Sans catégorie'} · ${formatDate(video.created_at)}`
  playerDescription.textContent = video.description ?? ''
  playerFrame.innerHTML = '<span>Chargement de la vidéo...</span>'

  const url = await getPlaybackUrl(video)
  if (!url) {
    playerFrame.innerHTML = '<span>Lecture indisponible pour cette vidéo.</span>'
    return
  }

  playerFrame.innerHTML = ''
  const element = document.createElement('video')
  element.controls = true
  element.playsInline = true
  element.preload = 'metadata'
  element.className = 'player-frame__video'
  element.src = url
  playerFrame.append(element)
}

function renderShares() {
  if (!shareList) return
  const video = getSelectedVideo()
  const userId = currentUserId()

  if (!video || video.owner_user_id !== userId || video.visibility !== 'private') {
    shareList.innerHTML = '<p class="muted-text">Sélectionne une vidéo privée qui t’appartient.</p>'
    return
  }

  const videoShares = shares.filter((share) => share.video_id === video.id)
  shareList.innerHTML = videoShares.length
    ? videoShares.map((share) => `<span class="share-chip">${escapeHtml(profileName(share.shared_with_user_id))}</span>`).join('')
    : '<p class="muted-text">Pas encore partagée.</p>'
}

function renderThreads() {
  if (!threadList || !messageList) return

  if (!session) {
    threadList.innerHTML = '<div class="empty-state"><p>Connecte-toi pour utiliser la messagerie interne.</p></div>'
    messageList.innerHTML = ''
    return
  }

  threadList.innerHTML = threads.length
    ? threads.map((thread) => {
        const other = otherThreadUser(thread)
        return `
          <button class="thread-item ${thread.id === selectedThreadId ? 'thread-item--active' : ''}" type="button" data-thread-id="${thread.id}">
            ${escapeHtml(profileName(other))}
          </button>
        `
      }).join('')
    : '<div class="empty-state"><p>Aucune conversation.</p></div>'

  threadList.querySelectorAll<HTMLButtonElement>('[data-thread-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      selectedThreadId = button.dataset.threadId ?? null
      await loadMessages()
      renderThreads()
    })
  })

  const visibleMessages = selectedThreadId ? messages.filter((message) => message.thread_id === selectedThreadId) : []
  messageList.innerHTML = visibleMessages.length
    ? visibleMessages.map((message) => {
        const mine = message.sender_user_id === currentUserId()
        return `
          <article class="direct-message ${mine ? 'direct-message--mine' : ''}">
            <strong>${escapeHtml(profileName(message.sender_user_id))}</strong>
            <p>${escapeHtml(message.body)}</p>
            <small>${formatDate(message.created_at)}</small>
          </article>
        `
      }).join('')
    : '<div class="empty-state"><p>Sélectionne ou ouvre une conversation.</p></div>'
}

async function loadProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, display_name')
    .order('display_name', { ascending: true })

  if (error && !isMissingSchemaError(error)) console.error(error)
  profiles = (data ?? []) as Profile[]
  renderProfileSelectors()
}

async function loadProfile() {
  if (!session) {
    displayName = ''
    renderAccount()
    return
  }

  const fallbackName = clampName(session.user.user_metadata.display_name ?? session.user.email?.split('@')[0] ?? '')
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (error) {
    console.error(error)
    displayName = fallbackName
    renderAccount()
    return
  }

  if (!data) {
    await supabase.from('profiles').insert({
      user_id: session.user.id,
      display_name: fallbackName,
    })
    displayName = fallbackName
  } else {
    displayName = data.display_name
  }

  await loadProfiles()
  renderAccount()
}

function normalizeVideo(item: Partial<VideoItem>): VideoItem {
  return {
    id: item.id ?? '',
    title: item.title ?? '',
    description: item.description ?? null,
    category: item.category ?? null,
    public_url: item.public_url ?? null,
    storage_path: item.storage_path ?? '',
    storage_bucket: item.storage_bucket ?? PUBLIC_BUCKET,
    visibility: (item.visibility ?? 'public') as Visibility,
    owner_user_id: item.owner_user_id ?? null,
    owner_alias: item.owner_alias ?? 'Anonyme',
    created_at: item.created_at ?? new Date().toISOString(),
  }
}

async function loadVideos() {
  const publicResponse = await supabase
    .from('videos')
    .select('id, title, description, category, public_url, storage_path, storage_bucket, visibility, owner_user_id, owner_alias, created_at')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })

  if (publicResponse.error) {
    const fallback = await supabase
      .from('videos')
      .select('id, title, description, category, public_url, storage_path, created_at')
      .order('created_at', { ascending: false })
    if (fallback.error) console.error(fallback.error)
    publicVideos = ((fallback.data ?? []) as Partial<VideoItem>[]).map(normalizeVideo)
  } else {
    publicVideos = ((publicResponse.data ?? []) as Partial<VideoItem>[]).map(normalizeVideo)
  }

  if (!session) {
    privateVideos = []
    sharedVideos = []
    shares = []
    if (!selectedVideoId && publicVideos.length) selectedVideoId = publicVideos[0].id
    renderVideos()
    await renderPlayer()
    return
  }

  const userId = session.user.id
  const [ownedResponse, sharesResponse] = await Promise.all([
    supabase
      .from('videos')
      .select('id, title, description, category, public_url, storage_path, storage_bucket, visibility, owner_user_id, owner_alias, created_at')
      .eq('owner_user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('video_shares')
      .select('id, video_id, owner_user_id, shared_with_user_id, created_at')
      .or(`owner_user_id.eq.${userId},shared_with_user_id.eq.${userId}`),
  ])

  if (ownedResponse.error && !isMissingSchemaError(ownedResponse.error)) console.error(ownedResponse.error)
  if (sharesResponse.error && !isMissingSchemaError(sharesResponse.error)) console.error(sharesResponse.error)

  privateVideos = ((ownedResponse.data ?? []) as Partial<VideoItem>[])
    .map(normalizeVideo)
    .filter((video) => video.visibility === 'private')
  shares = (sharesResponse.data ?? []) as VideoShare[]

  const sharedIds = shares
    .filter((share) => share.shared_with_user_id === userId)
    .map((share) => share.video_id)

  if (sharedIds.length) {
    const sharedResponse = await supabase
      .from('videos')
      .select('id, title, description, category, public_url, storage_path, storage_bucket, visibility, owner_user_id, owner_alias, created_at')
      .in('id', sharedIds)
      .order('created_at', { ascending: false })

    if (sharedResponse.error && !isMissingSchemaError(sharedResponse.error)) console.error(sharedResponse.error)
    sharedVideos = ((sharedResponse.data ?? []) as Partial<VideoItem>[]).map(normalizeVideo)
  } else {
    sharedVideos = []
  }

  if (!selectedVideoId && publicVideos.length) selectedVideoId = publicVideos[0].id
  renderVideos()
  await renderPlayer()
  renderShares()
}

async function loadThreads() {
  if (!session) {
    threads = []
    messages = []
    renderThreads()
    return
  }

  const userId = session.user.id
  const { data, error } = await supabase
    .from('direct_threads')
    .select('id, owner_user_id, participant_user_id, updated_at')
    .or(`owner_user_id.eq.${userId},participant_user_id.eq.${userId}`)
    .order('updated_at', { ascending: false })

  if (error && !isMissingSchemaError(error)) console.error(error)
  threads = (data ?? []) as DirectThread[]
  if (!selectedThreadId && threads.length) selectedThreadId = threads[0].id
  await loadMessages()
  renderThreads()
}

async function loadMessages() {
  if (!selectedThreadId) {
    messages = []
    renderThreads()
    return
  }

  const { data, error } = await supabase
    .from('direct_messages')
    .select('id, thread_id, sender_user_id, body, created_at')
    .eq('thread_id', selectedThreadId)
    .order('created_at', { ascending: true })

  if (error && !isMissingSchemaError(error)) console.error(error)
  messages = (data ?? []) as DirectMessage[]
}

async function uploadVideo(form: HTMLFormElement) {
  if (isUploading || !uploadButton) return

  const formData = new FormData(form)
  const title = String(formData.get('title') ?? '').trim()
  const category = String(formData.get('category') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const visibility = String(formData.get('visibility') ?? 'public') as Visibility
  const file = formData.get('file')

  if (!title || !category || !(file instanceof File) || !file.size) {
    setStatus(formStatus, 'Complète le titre, la catégorie et le fichier vidéo.', 'error')
    return
  }

  if (visibility === 'private' && !session) {
    setStatus(formStatus, 'Connecte-toi pour ajouter une vidéo privée.', 'error')
    return
  }

  if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
    setStatus(formStatus, 'Format refusé. Utilise MP4, WebM, MOV ou M4V.', 'error')
    return
  }

  if (file.size > MAX_VIDEO_SIZE) {
    setStatus(formStatus, 'Fichier trop lourd pour ce MVP. Vise 250 Mo maximum.', 'error')
    return
  }

  isUploading = true
  uploadButton.disabled = true
  uploadButton.textContent = 'Ajout en cours...'
  setStatus(formStatus, 'Envoi vers le stockage...')

  const extension = file.name.split('.').pop()?.toLowerCase() || 'mp4'
  const fileName = `${Date.now()}-${slugify(title) || 'video'}.${extension}`
  const bucket = visibility === 'private' ? PRIVATE_BUCKET : PUBLIC_BUCKET
  const ownerSegment = session?.user.id ?? `anonymous-${anonymousId}`
  const storagePath = `${ownerSegment}/${slugify(category) || 'autre'}/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    console.error(uploadError)
    setStatus(formStatus, `Upload impossible: ${uploadError.message}`, 'error')
    isUploading = false
    uploadButton.disabled = false
    uploadButton.textContent = 'Ajouter à la bibliothèque'
    return
  }

  const publicUrl = visibility === 'public'
    ? supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl
    : null

  const { data, error } = await supabase
    .from('videos')
    .insert({
      title,
      category,
      description: description || null,
      storage_path: storagePath,
      storage_bucket: bucket,
      public_url: publicUrl,
      visibility,
      owner_user_id: session?.user.id ?? null,
      owner_alias: getAuthorAlias(),
    })
    .select('id, title, description, category, public_url, storage_path, storage_bucket, visibility, owner_user_id, owner_alias, created_at')
    .single()

  if (error) {
    console.error(error)
    setStatus(formStatus, `Métadonnées non enregistrées: ${error.message}`, 'error')
    isUploading = false
    uploadButton.disabled = false
    uploadButton.textContent = 'Ajouter à la bibliothèque'
    return
  }

  const inserted = normalizeVideo(data as Partial<VideoItem>)
  selectedVideoId = inserted.id
  if (inserted.visibility === 'private') {
    activeView = 'private'
    privateVideos = [inserted, ...privateVideos]
  } else {
    activeView = 'public'
    publicVideos = [inserted, ...publicVideos]
  }

  form.reset()
  setStatus(formStatus, 'Vidéo ajoutée.', 'success')
  isUploading = false
  uploadButton.disabled = false
  uploadButton.textContent = 'Ajouter à la bibliothèque'
  renderVideos()
  await renderPlayer()
}

async function shareSelectedVideo(form: HTMLFormElement) {
  const video = getSelectedVideo()
  const target = String(new FormData(form).get('targetUser') ?? '')
  const userId = currentUserId()

  if (!session || !userId) {
    setStatus(shareStatus, 'Connecte-toi pour partager une vidéo.', 'error')
    return
  }

  if (!video || video.owner_user_id !== userId || video.visibility !== 'private') {
    setStatus(shareStatus, 'Sélectionne une vidéo privée qui t’appartient.', 'error')
    return
  }

  if (!target) {
    setStatus(shareStatus, 'Choisis un utilisateur.', 'error')
    return
  }

  const { data, error } = await supabase
    .from('video_shares')
    .insert({
      video_id: video.id,
      owner_user_id: userId,
      shared_with_user_id: target,
    })
    .select('id, video_id, owner_user_id, shared_with_user_id, created_at')
    .single()

  if (error) {
    setStatus(shareStatus, error.message, 'error')
    return
  }

  shares = [data as VideoShare, ...shares]
  setStatus(shareStatus, 'Vidéo partagée.', 'success')
  renderShares()
}

async function openThread(form: HTMLFormElement) {
  if (!session) return
  const target = String(new FormData(form).get('targetUser') ?? '')
  const userId = session.user.id
  if (!target || target === userId) return

  const existing = threads.find((thread) => {
    return (thread.owner_user_id === userId && thread.participant_user_id === target)
      || (thread.owner_user_id === target && thread.participant_user_id === userId)
  })

  if (existing) {
    selectedThreadId = existing.id
    await loadMessages()
    renderThreads()
    return
  }

  const { data, error } = await supabase
    .from('direct_threads')
    .insert({ owner_user_id: userId, participant_user_id: target })
    .select('id, owner_user_id, participant_user_id, updated_at')
    .single()

  if (error) {
    console.error(error)
    return
  }

  threads = [data as DirectThread, ...threads]
  selectedThreadId = (data as DirectThread).id
  messages = []
  renderThreads()
}

async function sendDirectMessage(form: HTMLFormElement) {
  if (!session || !selectedThreadId || !directMessageInput) return
  const body = String(new FormData(form).get('message') ?? '').trim()
  if (!body) return

  const { data, error } = await supabase
    .from('direct_messages')
    .insert({
      thread_id: selectedThreadId,
      sender_user_id: session.user.id,
      body,
    })
    .select('id, thread_id, sender_user_id, body, created_at')
    .single()

  if (error) {
    console.error(error)
    return
  }

  messages = [...messages, data as DirectMessage]
  directMessageInput.value = ''
  renderThreads()
}

async function handleAuth(mode: 'signin' | 'signup') {
  if (!authEmailInput || !authPasswordInput || !displayNameInput) return
  const email = authEmailInput.value.trim()
  const password = authPasswordInput.value
  const name = clampName(displayNameInput.value || getAnonymousAlias())

  if (!email || !password) {
    setStatus(authStatus, 'Renseigne email et mot de passe.', 'error')
    return
  }

  if (mode === 'signup') {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name } },
    })

    if (error) {
      setStatus(authStatus, error.message, 'error')
      return
    }

    if (data.user) {
      await supabase.from('profiles').upsert({ user_id: data.user.id, display_name: name })
    }
    setStatus(authStatus, 'Compte créé. Vérifie ton email si Supabase le demande.', 'success')
    return
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    setStatus(authStatus, error.message, 'error')
    return
  }

  setStatus(authStatus, 'Connexion ouverte.', 'success')
}

function subscribeRealtime() {
  realtimeChannel?.unsubscribe()
  realtimeChannel = supabase
    .channel('gothicanal-private-library')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'video_shares' }, () => {
      loadVideos()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages' }, () => {
      loadMessages().then(renderThreads)
    })
    .subscribe()
}

viewButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activeView = (button.dataset.view ?? 'public') as ViewKey
    renderVideos()
    renderThreads()
  })
})

searchInput?.addEventListener('input', renderVideos)
categoryFilter?.addEventListener('change', renderVideos)

aliasForm?.addEventListener('submit', (event) => {
  event.preventDefault()
  if (!anonymousAliasInput) return
  localStorage.setItem(ANON_ALIAS_KEY, clampName(anonymousAliasInput.value))
  renderAccount()
})

authForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  await handleAuth('signin')
})

signUpButton?.addEventListener('click', () => {
  handleAuth('signup')
})

signOutButton?.addEventListener('click', async () => {
  await supabase.auth.signOut()
  setStatus(authStatus, 'Session fermée. Retour en présence anonyme.', 'success')
})

uploadForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  await uploadVideo(uploadForm)
})

shareForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  await shareSelectedVideo(shareForm)
})

threadForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  await openThread(threadForm)
})

directMessageForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  await sendDirectMessage(directMessageForm)
})

supabase.auth.onAuthStateChange(async (_event, nextSession) => {
  session = nextSession
  await loadProfile()
  await loadVideos()
  await loadThreads()
})

async function init() {
  renderShell()
  renderAccount()
  renderVideos()
  renderThreads()
  subscribeRealtime()

  const { data } = await supabase.auth.getSession()
  session = data.session
  await loadProfile()
  await loadVideos()
  await loadThreads()
}

init()
