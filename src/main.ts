import './style.css'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'

type VideoItem = {
  id: string
  title: string
  description: string | null
  category: string | null
  public_url: string
  storage_path: string
  owner_user_id: string | null
  owner_alias: string
  created_at: string
}

type VideoComment = {
  id: string
  body: string
  author_alias: string
  created_at: string
}

type VideoLike = {
  id: string
  identity_key: string
}

type ChatMessage = {
  id: string
  body: string
  author_alias: string
  created_at: string
}

type SupabaseErrorLike = {
  code?: string
  message?: string
}

type LegacyVideoItem = Omit<VideoItem, 'owner_user_id' | 'owner_alias'>

const CATEGORIES = ['Rituel', 'Nocturne', 'Archive', 'Velours', 'Obscur', 'Autre']
const BUCKET = 'videos'
const MAX_VIDEO_SIZE = 250 * 1024 * 1024
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']
const ANON_ID_KEY = 'gothicanal:anonymous-id'
const ANON_ALIAS_KEY = 'gothicanal:anonymous-alias'
const CACHE_CLEAN_VERSION = 'gothicanal-cache-clean-2026-05-10-v1'

let videos: VideoItem[] = []
let comments: VideoComment[] = []
let likes: VideoLike[] = []
let chatMessages: ChatMessage[] = []
let activeVideoId: string | null = null
let currentSearch = ''
let currentCategory = 'all'
let isUploading = false
let session: Session | null = null
let displayName = ''
let communityChannel: ReturnType<typeof supabase.channel> | null = null

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('App root not found')

async function cleanBrowserCaches() {
  const tasks: Promise<unknown>[] = []

  if ('caches' in window) {
    tasks.push(
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))),
    )
  }

  if ('serviceWorker' in navigator) {
    tasks.push(
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))),
    )
  }

  const results = await Promise.allSettled(tasks)
  const failed = results.filter((result) => result.status === 'rejected')
  if (failed.length) console.warn('Cache cleanup skipped partially.', failed)

  sessionStorage.setItem('gothicanal:last-cache-clean', CACHE_CLEAN_VERSION)
}

function getOrCreateAnonymousId() {
  const existing = localStorage.getItem(ANON_ID_KEY)
  if (existing) return existing

  const next = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  localStorage.setItem(ANON_ID_KEY, next)
  return next
}

function getAnonymousAlias() {
  return localStorage.getItem(ANON_ALIAS_KEY) || 'Visiteur nocturne'
}

const anonymousId = getOrCreateAnonymousId()

app.innerHTML = `
  <main class="site-shell">
    <header class="topbar">
      <div class="topbar__inner">
        <a href="#top" class="brandmark" aria-label="GothiCanal">
          <span class="brandmark__dot"></span>
          <span class="brandmark__text">GothiCanal</span>
        </a>
        <nav class="topnav">
          <a href="#archive">Archive</a>
          <a href="#upload">Déposer</a>
          <a href="#player">Visionner</a>
          <a href="#community">Communauté</a>
        </nav>
      </div>
    </header>

    <section class="hero-v3" id="top">
      <div class="hero-v3__backdrop"></div>
      <div class="hero-v3__grain"></div>
      <div class="hero-v3__spotlight"></div>
      <div class="hero-v3__container">
        <div class="hero-v3__copy reveal-up">
          <span class="eyebrow">Répertoire privé d'images en mouvement</span>
          <h1>Collectionne, retrouve et rejoue les séquences qui suggèrent plus qu’elles ne disent.</h1>
          <p>
            Un lieu pensé pour trier des fragments, classer des ambiances, commenter les visions et rester présent sans forcément signer.
          </p>
          <div class="hero-v3__actions">
            <a class="primary-link" href="#archive">Explorer l’archive</a>
            <a class="secondary-link" href="#upload">Ajouter une séquence</a>
          </div>
          <div class="hero-v3__stats">
            <div class="stat-card">
              <span class="stat-card__value" id="heroCount">0</span>
              <span class="stat-card__label">séquences rangées</span>
            </div>
            <div class="stat-card">
              <span class="stat-card__value" id="heroLikeCount">0</span>
              <span class="stat-card__label">likes sur la sélection</span>
            </div>
            <div class="stat-card">
              <span class="stat-card__value" id="heroChatCount">0</span>
              <span class="stat-card__label">messages de salon</span>
            </div>
          </div>
        </div>

        <div class="hero-v3__visual reveal-up reveal-delay-1">
          <div class="hero-v3__frame">
            <img src="/gothicanal-banner.jpg" alt="Bandeau GothiCanal" class="hero-v3__image" />
          </div>
        </div>
      </div>
    </section>

    <section class="tease-band reveal-up reveal-delay-2">
      <div class="tease-band__inner">
        <span>Upload anonyme</span>
        <span>Espaces utilisateur</span>
        <span>Commentaires</span>
        <span>Salon instantané</span>
      </div>
    </section>

    <section class="toolbar reveal-up reveal-delay-2" id="archive">
      <div class="toolbar__search">
        <label for="searchInput">Recherche</label>
        <input id="searchInput" type="search" placeholder="Titre, description, auteur ou catégorie" autocomplete="off" />
      </div>
      <div class="toolbar__filter">
        <label for="categoryFilter">Catégorie</label>
        <select id="categoryFilter">
          <option value="all">Toutes</option>
          ${CATEGORIES.map((category) => `<option value="${category}">${category}</option>`).join('')}
        </select>
      </div>
      <button id="refreshButton" class="ghost-button" type="button">Actualiser</button>
    </section>

    <section class="layout-grid">
      <aside class="sidebar-stack reveal-up reveal-delay-2">
        <article class="panel panel--sticky-lite" id="account">
          <div class="panel__header panel__header--premium">
            <span class="panel__kicker">Espace</span>
            <h2>Profil et présence</h2>
            <p id="accountSummary">Tu peux participer en anonyme ou créer un compte.</p>
          </div>

          <form id="aliasForm" class="compact-form">
            <div class="field">
              <label for="anonymousAlias">Nom anonyme</label>
              <input id="anonymousAlias" name="alias" type="text" maxlength="40" minlength="2" required />
            </div>
            <button class="ghost-button" type="submit">Garder ce nom</button>
          </form>

          <form id="authForm" class="compact-form auth-box">
            <div class="field">
              <label for="displayName">Nom de compte</label>
              <input id="displayName" name="displayName" type="text" maxlength="40" minlength="2" placeholder="Ex. Sélène" />
            </div>
            <div class="field">
              <label for="authEmail">Email</label>
              <input id="authEmail" name="email" type="email" autocomplete="email" />
            </div>
            <div class="field">
              <label for="authPassword">Mot de passe</label>
              <input id="authPassword" name="password" type="password" minlength="6" autocomplete="current-password" />
            </div>
            <div class="button-row">
              <button id="signInButton" class="primary-button" type="submit" data-mode="signin">Connexion</button>
              <button id="signUpButton" class="ghost-button" type="button">Créer</button>
              <button id="signOutButton" class="ghost-button hidden" type="button">Sortir</button>
            </div>
            <p id="authStatus" class="form-status" aria-live="polite"></p>
          </form>
        </article>

        <article class="panel" id="upload">
          <div class="panel__header panel__header--premium">
            <span class="panel__kicker">Dépôt</span>
            <h2>Déposer une nouvelle séquence</h2>
            <p>L’ajout reste possible sans compte, avec ton nom anonyme.</p>
          </div>

          <form id="uploadForm" class="upload-form">
            <div class="field">
              <label for="videoTitle">Titre</label>
              <input id="videoTitle" name="title" type="text" maxlength="120" required placeholder="Ex. Théâtre de minuit" />
            </div>

            <div class="field">
              <label for="videoCategory">Catégorie</label>
              <select id="videoCategory" name="category" required>
                ${CATEGORIES.map((category) => `<option value="${category}">${category}</option>`).join('')}
              </select>
            </div>

            <div class="field">
              <label for="videoDescription">Description</label>
              <textarea id="videoDescription" name="description" rows="4" maxlength="500" placeholder="Quelques lignes, en gardant le mystère intact."></textarea>
            </div>

            <div class="field">
              <label for="videoFile">Fichier vidéo</label>
              <input id="videoFile" name="file" type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v" required />
              <small>MP4, WebM, MOV ou M4V. Taille conseillée: 250 Mo maximum.</small>
            </div>

            <button id="uploadButton" class="primary-button" type="submit">Publier dans l’archive</button>
            <p id="formStatus" class="form-status" aria-live="polite"></p>
          </form>
        </article>
      </aside>

      <section class="content-column">
        <article class="panel player-panel reveal-up reveal-delay-2" id="player">
          <div class="panel__header panel__header--inline panel__header--premium">
            <div>
              <span class="panel__kicker">Lecture</span>
              <h2 id="playerTitle">Aucune sélection</h2>
            </div>
            <span id="resultsCount" class="results-pill">0 vidéo</span>
          </div>
          <p id="playerMeta" class="player-meta">Choisis une vidéo dans l’archive pour lancer la lecture.</p>

          <div class="player-frame" id="playerFrame">
            <div class="player-frame__empty">
              <span>Le projecteur attend.</span>
            </div>
          </div>
          <p id="playerDescription" class="player-description"></p>

          <div class="engagement-bar">
            <button id="likeButton" class="like-button" type="button" disabled>♡ <span id="likeCount">0</span></button>
            <span id="selectedAuthor" class="player-meta">Publié par Anonyme</span>
          </div>

          <section class="comments-block" id="community">
            <div class="panel__header panel__header--inline">
              <div>
                <span class="panel__kicker">Commentaires</span>
                <h3>Réactions sous la vidéo</h3>
              </div>
              <span id="commentCount" class="results-pill">0</span>
            </div>
            <form id="commentForm" class="message-form">
              <textarea id="commentInput" name="comment" rows="3" maxlength="700" placeholder="Écrire un commentaire..." required></textarea>
              <button class="primary-button" type="submit">Envoyer</button>
            </form>
            <div id="commentsList" class="message-list"></div>
          </section>
        </article>

        <article class="panel reveal-up reveal-delay-3">
          <div class="panel__header panel__header--premium">
            <span class="panel__kicker">Archive</span>
            <h2>Répertoire vidéo</h2>
            <p>Recherche rapide, tri par catégorie, lecture instantanée.</p>
          </div>
          <div id="videoList" class="video-grid"></div>
        </article>

        <article class="panel chat-panel reveal-up reveal-delay-3">
          <div class="panel__header panel__header--inline panel__header--premium">
            <div>
              <span class="panel__kicker">Salon</span>
              <h2>Messagerie instantanée</h2>
              <p>Ouverte aux anonymes et aux comptes connectés.</p>
            </div>
            <span id="chatCount" class="results-pill">0</span>
          </div>
          <div id="chatList" class="message-list message-list--chat"></div>
          <form id="chatForm" class="message-form message-form--inline">
            <input id="chatInput" name="message" maxlength="700" placeholder="Message au salon..." autocomplete="off" required />
            <button class="primary-button" type="submit">Envoyer</button>
          </form>
        </article>
      </section>
    </section>
  </main>
`

const searchInput = document.querySelector<HTMLInputElement>('#searchInput')
const categoryFilter = document.querySelector<HTMLSelectElement>('#categoryFilter')
const refreshButton = document.querySelector<HTMLButtonElement>('#refreshButton')
const uploadForm = document.querySelector<HTMLFormElement>('#uploadForm')
const uploadButton = document.querySelector<HTMLButtonElement>('#uploadButton')
const formStatus = document.querySelector<HTMLParagraphElement>('#formStatus')
const resultsCount = document.querySelector<HTMLSpanElement>('#resultsCount')
const videoList = document.querySelector<HTMLDivElement>('#videoList')
const playerTitle = document.querySelector<HTMLHeadingElement>('#playerTitle')
const playerMeta = document.querySelector<HTMLParagraphElement>('#playerMeta')
const playerDescription = document.querySelector<HTMLParagraphElement>('#playerDescription')
const playerFrame = document.querySelector<HTMLDivElement>('#playerFrame')
const heroCount = document.querySelector<HTMLSpanElement>('#heroCount')
const heroLikeCount = document.querySelector<HTMLSpanElement>('#heroLikeCount')
const heroChatCount = document.querySelector<HTMLSpanElement>('#heroChatCount')
const aliasForm = document.querySelector<HTMLFormElement>('#aliasForm')
const anonymousAliasInput = document.querySelector<HTMLInputElement>('#anonymousAlias')
const authForm = document.querySelector<HTMLFormElement>('#authForm')
const signUpButton = document.querySelector<HTMLButtonElement>('#signUpButton')
const signOutButton = document.querySelector<HTMLButtonElement>('#signOutButton')
const authStatus = document.querySelector<HTMLParagraphElement>('#authStatus')
const accountSummary = document.querySelector<HTMLParagraphElement>('#accountSummary')
const displayNameInput = document.querySelector<HTMLInputElement>('#displayName')
const authEmailInput = document.querySelector<HTMLInputElement>('#authEmail')
const authPasswordInput = document.querySelector<HTMLInputElement>('#authPassword')
const likeButton = document.querySelector<HTMLButtonElement>('#likeButton')
const likeCount = document.querySelector<HTMLSpanElement>('#likeCount')
const selectedAuthor = document.querySelector<HTMLSpanElement>('#selectedAuthor')
const commentForm = document.querySelector<HTMLFormElement>('#commentForm')
const commentInput = document.querySelector<HTMLTextAreaElement>('#commentInput')
const commentsList = document.querySelector<HTMLDivElement>('#commentsList')
const commentCount = document.querySelector<HTMLSpanElement>('#commentCount')
const chatForm = document.querySelector<HTMLFormElement>('#chatForm')
const chatInput = document.querySelector<HTMLInputElement>('#chatInput')
const chatList = document.querySelector<HTMLDivElement>('#chatList')
const chatCount = document.querySelector<HTMLSpanElement>('#chatCount')

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function clampName(value: string) {
  const next = value.trim().slice(0, 40)
  return next.length >= 2 ? next : 'Visiteur nocturne'
}

function setStatus(message: string, tone: 'neutral' | 'success' | 'error' = 'neutral') {
  if (!formStatus) return
  formStatus.textContent = message
  formStatus.dataset.tone = tone
}

function setAuthStatus(message: string, tone: 'neutral' | 'success' | 'error' = 'neutral') {
  if (!authStatus) return
  authStatus.textContent = message
  authStatus.dataset.tone = tone
}

function getIdentityKey() {
  return session?.user.id ? `user:${session.user.id}` : `anon:${anonymousId}`
}

function getAuthorAlias() {
  return clampName(displayName || getAnonymousAlias())
}

function getSelectedVideo() {
  return videos.find((video) => video.id === activeVideoId) ?? null
}

function isMissingSchemaError(error: SupabaseErrorLike | null | undefined) {
  return error?.code === '42703' || error?.code === '42P01' || error?.code === 'PGRST205'
}

function normalizeLegacyVideos(items: LegacyVideoItem[]) {
  return items.map((video) => ({
    ...video,
    owner_user_id: null,
    owner_alias: 'Anonyme',
  }))
}

function getFilteredVideos() {
  return videos.filter((video) => {
    const matchesCategory = currentCategory === 'all' || video.category === currentCategory
    const haystack = `${video.title} ${video.description ?? ''} ${video.category ?? ''} ${video.owner_alias}`.toLowerCase()
    const matchesSearch = haystack.includes(currentSearch.toLowerCase())
    return matchesCategory && matchesSearch
  })
}

function renderAccount() {
  if (anonymousAliasInput) anonymousAliasInput.value = getAnonymousAlias()

  if (!accountSummary || !displayNameInput || !authEmailInput || !authPasswordInput || !signOutButton) return

  if (session) {
    accountSummary.textContent = `Connecté comme ${getAuthorAlias()}. Tu peux commenter, liker et écrire au salon avec ce compte.`
    displayNameInput.value = displayName
    authEmailInput.value = session.user.email ?? ''
    authEmailInput.disabled = true
    authPasswordInput.disabled = true
    signOutButton.classList.remove('hidden')
  } else {
    accountSummary.textContent = `Présence anonyme active: ${getAnonymousAlias()}.`
    displayNameInput.disabled = false
    authEmailInput.disabled = false
    authPasswordInput.disabled = false
    signOutButton.classList.add('hidden')
  }
}

function renderPlayer() {
  if (!playerTitle || !playerMeta || !playerFrame || !playerDescription || !selectedAuthor || !likeButton) return

  const selected = getSelectedVideo()

  if (!selected) {
    playerTitle.textContent = 'Aucune sélection'
    playerMeta.textContent = 'Choisis une vidéo dans l’archive pour lancer la lecture.'
    playerDescription.textContent = ''
    selectedAuthor.textContent = 'Publié par Anonyme'
    likeButton.disabled = true
    playerFrame.innerHTML = `
      <div class="player-frame__empty">
        <span>Le projecteur attend.</span>
      </div>
    `
    return
  }

  playerTitle.textContent = selected.title
  playerMeta.textContent = `${selected.category ?? 'Sans catégorie'} · ${formatDate(selected.created_at)}`
  playerDescription.textContent = selected.description ?? ''
  selectedAuthor.textContent = `Publié par ${selected.owner_alias}`
  likeButton.disabled = false
  playerFrame.innerHTML = ''

  const video = document.createElement('video')
  video.controls = true
  video.playsInline = true
  video.preload = 'metadata'
  video.src = selected.public_url
  video.className = 'player-frame__video'
  playerFrame.append(video)
}

function renderEngagement() {
  const liked = likes.some((like) => like.identity_key === getIdentityKey())
  if (likeButton) {
    likeButton.classList.toggle('like-button--active', liked)
    likeButton.disabled = !activeVideoId
  }
  if (likeCount) likeCount.textContent = String(likes.length)
  if (heroLikeCount) heroLikeCount.textContent = String(likes.length)
  if (commentCount) commentCount.textContent = String(comments.length)

  if (!commentsList) return

  if (!activeVideoId) {
    commentsList.innerHTML = '<div class="empty-state"><p>Sélectionne une vidéo pour ouvrir les commentaires.</p></div>'
    return
  }

  if (!comments.length) {
    commentsList.innerHTML = '<div class="empty-state"><p>Aucun commentaire pour le moment.</p></div>'
    return
  }

  commentsList.innerHTML = comments
    .map(
      (comment) => `
        <article class="message-card">
          <div class="message-card__meta">
            <strong>${escapeHtml(comment.author_alias)}</strong>
            <span>${formatDate(comment.created_at)}</span>
          </div>
          <p>${escapeHtml(comment.body)}</p>
        </article>
      `,
    )
    .join('')
}

function renderChat() {
  if (chatCount) chatCount.textContent = String(chatMessages.length)
  if (heroChatCount) heroChatCount.textContent = String(chatMessages.length)
  if (!chatList) return

  if (!chatMessages.length) {
    chatList.innerHTML = '<div class="empty-state"><p>Le salon est calme pour le moment.</p></div>'
    return
  }

  chatList.innerHTML = chatMessages
    .map(
      (message) => `
        <article class="message-card">
          <div class="message-card__meta">
            <strong>${escapeHtml(message.author_alias)}</strong>
            <span>${formatDate(message.created_at)}</span>
          </div>
          <p>${escapeHtml(message.body)}</p>
        </article>
      `,
    )
    .join('')
}

function renderList() {
  if (!videoList) return

  const filtered = getFilteredVideos()
  if (resultsCount) resultsCount.textContent = `${filtered.length} vidéo${filtered.length > 1 ? 's' : ''}`
  if (heroCount) heroCount.textContent = String(videos.length)

  if (!filtered.length) {
    videoList.innerHTML = `
      <div class="empty-state">
        <h3>Aucun résultat</h3>
        <p>Essaie une autre recherche, ou alimente l’archive avec une première séquence.</p>
      </div>
    `
    return
  }

  videoList.innerHTML = filtered
    .map((video) => {
      const isActive = video.id === activeVideoId
      return `
        <button class="video-card ${isActive ? 'video-card--active' : ''}" data-video-id="${video.id}" type="button">
          <span class="video-card__badge">${escapeHtml(video.category ?? 'Sans catégorie')}</span>
          <h3>${escapeHtml(video.title)}</h3>
          <p>${escapeHtml(video.description ?? 'Aucune description fournie.')}</p>
          <div class="video-card__meta">
            <span>${escapeHtml(video.owner_alias)}</span>
            <span>${formatDate(video.created_at)}</span>
          </div>
        </button>
      `
    })
    .join('')

  videoList.querySelectorAll<HTMLButtonElement>('.video-card').forEach((button) => {
    button.addEventListener('click', async () => {
      activeVideoId = button.dataset.videoId ?? null
      renderPlayer()
      renderList()
      await loadEngagement()
      document.querySelector('#player')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  })
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
    const { error: upsertError } = await supabase.from('profiles').insert({
      user_id: session.user.id,
      display_name: fallbackName,
    })
    if (upsertError) console.error(upsertError)
    displayName = fallbackName
    renderAccount()
    return
  }

  displayName = data.display_name
  renderAccount()
}

async function loadVideos() {
  const legacyResponse = await supabase
    .from('videos')
    .select('id, title, description, category, public_url, storage_path, created_at')
    .order('created_at', { ascending: false })

  if (legacyResponse.error) {
    console.error(legacyResponse.error)
    if (videoList) {
      videoList.innerHTML = `
        <div class="empty-state empty-state--error">
          <h3>Archive indisponible</h3>
          <p>Impossible de charger les vidéos pour l’instant.</p>
        </div>
      `
    }
    return
  }

  videos = normalizeLegacyVideos((legacyResponse.data ?? []) as LegacyVideoItem[])
  if (!activeVideoId && videos.length) activeVideoId = videos[0].id
  renderPlayer()
  renderList()

  const communityResponse = await supabase
    .from('videos')
    .select('id, title, description, category, public_url, storage_path, owner_user_id, owner_alias, created_at')
    .order('created_at', { ascending: false })

  if (!communityResponse.error) {
    videos = (communityResponse.data ?? []) as VideoItem[]
    renderPlayer()
    renderList()
  } else if (!isMissingSchemaError(communityResponse.error)) {
    console.error(communityResponse.error)
  } else {
    console.warn('Community columns missing, using legacy video schema.', communityResponse.error)
  }

  await loadEngagement()
}

async function loadEngagement() {
  if (!activeVideoId) {
    comments = []
    likes = []
    renderEngagement()
    return
  }

  const [commentsResponse, likesResponse] = await Promise.all([
    supabase
      .from('video_comments')
      .select('id, body, author_alias, created_at')
      .eq('video_id', activeVideoId)
      .order('created_at', { ascending: true }),
    supabase.from('video_likes').select('id, identity_key').eq('video_id', activeVideoId),
  ])

  if (commentsResponse.error) console.error(commentsResponse.error)
  if (likesResponse.error) console.error(likesResponse.error)

  comments = commentsResponse.error && isMissingSchemaError(commentsResponse.error)
    ? []
    : (commentsResponse.data ?? []) as VideoComment[]
  likes = likesResponse.error && isMissingSchemaError(likesResponse.error)
    ? []
    : (likesResponse.data ?? []) as VideoLike[]
  renderEngagement()
}

async function loadChat() {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, body, author_alias, created_at')
    .order('created_at', { ascending: false })
    .limit(60)

  if (error) {
    if (!isMissingSchemaError(error)) console.error(error)
    chatMessages = []
    renderChat()
    return
  }

  chatMessages = ((data ?? []) as ChatMessage[]).reverse()
  renderChat()
}

async function uploadVideo(form: HTMLFormElement) {
  if (isUploading || !uploadButton) return

  const formData = new FormData(form)
  const title = String(formData.get('title') ?? '').trim()
  const category = String(formData.get('category') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const file = formData.get('file')

  if (!title || !category || !(file instanceof File) || !file.size) {
    setStatus('Complète le titre, la catégorie et le fichier vidéo.', 'error')
    return
  }

  if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
    setStatus('Format refusé. Utilise MP4, WebM, MOV ou M4V.', 'error')
    return
  }

  if (file.size > MAX_VIDEO_SIZE) {
    setStatus('Fichier trop lourd pour ce MVP. Vise 250 Mo maximum.', 'error')
    return
  }

  isUploading = true
  uploadButton.disabled = true
  uploadButton.textContent = 'Publication en cours...'
  setStatus('Envoi vers le stockage...')

  const extension = file.name.split('.').pop()?.toLowerCase() || 'mp4'
  const fileName = `${Date.now()}-${slugify(title) || 'video'}.${extension}`
  const ownerSegment = session?.user.id ? `users/${session.user.id}` : `anonymous/${anonymousId}`
  const storagePath = `${ownerSegment}/${slugify(category) || 'autre'}/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    console.error(uploadError)
    setStatus(`Upload impossible: ${uploadError.message}`, 'error')
    isUploading = false
    uploadButton.disabled = false
    uploadButton.textContent = 'Publier dans l’archive'
    return
  }

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)

  const communityInsert = await supabase
    .from('videos')
    .insert({
      title,
      category,
      description: description || null,
      storage_path: storagePath,
      public_url: publicUrlData.publicUrl,
      owner_user_id: session?.user.id ?? null,
      owner_alias: getAuthorAlias(),
    })
    .select('id, title, description, category, public_url, storage_path, owner_user_id, owner_alias, created_at')
    .single()

  let inserted: VideoItem | null = null
  let insertError = communityInsert.error

  if (communityInsert.error && isMissingSchemaError(communityInsert.error)) {
    console.warn('Community columns missing, inserting video with legacy schema.', communityInsert.error)
    const legacyInsert = await supabase
      .from('videos')
      .insert({
        title,
        category,
        description: description || null,
        storage_path: storagePath,
        public_url: publicUrlData.publicUrl,
      })
      .select('id, title, description, category, public_url, storage_path, created_at')
      .single()

    insertError = legacyInsert.error
    inserted = legacyInsert.data
      ? normalizeLegacyVideos([legacyInsert.data as LegacyVideoItem])[0]
      : null
  } else {
    inserted = communityInsert.data as VideoItem | null
  }

  if (insertError) {
    console.error(insertError)
    setStatus(`Métadonnées non enregistrées: ${insertError.message}`, 'error')
    isUploading = false
    uploadButton.disabled = false
    uploadButton.textContent = 'Publier dans l’archive'
    return
  }

  if (!inserted) {
    setStatus('Métadonnées non enregistrées: réponse vide de Supabase.', 'error')
    isUploading = false
    uploadButton.disabled = false
    uploadButton.textContent = 'Publier dans l’archive'
    return
  }

  setStatus('Vidéo publiée dans l’archive.', 'success')
  form.reset()
  videos = [inserted, ...videos]
  activeVideoId = inserted.id
  comments = []
  likes = []
  renderPlayer()
  renderList()
  renderEngagement()
  isUploading = false
  uploadButton.disabled = false
  uploadButton.textContent = 'Publier dans l’archive'
}

async function toggleLike() {
  if (!activeVideoId) return

  const identityKey = getIdentityKey()
  const existing = likes.find((like) => like.identity_key === identityKey)

  if (existing) {
    const { error } = await supabase
      .from('video_likes')
      .delete()
      .eq('video_id', activeVideoId)
      .eq('identity_key', identityKey)
    if (error) console.error(error)
  } else {
    const { error } = await supabase.from('video_likes').insert({
      video_id: activeVideoId,
      author_user_id: session?.user.id ?? null,
      author_alias: getAuthorAlias(),
      identity_key: identityKey,
    })
    if (error) console.error(error)
  }

  await loadEngagement()
}

async function submitComment(form: HTMLFormElement) {
  if (!activeVideoId || !commentInput) return

  const body = String(new FormData(form).get('comment') ?? '').trim()
  if (!body) return

  const { error } = await supabase.from('video_comments').insert({
    video_id: activeVideoId,
    body,
    author_user_id: session?.user.id ?? null,
    author_alias: getAuthorAlias(),
    identity_key: getIdentityKey(),
  })

  if (error) {
    console.error(error)
    return
  }

  commentInput.value = ''
  await loadEngagement()
}

async function submitChatMessage(form: HTMLFormElement) {
  if (!chatInput) return

  const body = String(new FormData(form).get('message') ?? '').trim()
  if (!body) return

  const { error } = await supabase.from('chat_messages').insert({
    body,
    author_user_id: session?.user.id ?? null,
    author_alias: getAuthorAlias(),
    identity_key: getIdentityKey(),
  })

  if (error) {
    console.error(error)
    return
  }

  chatInput.value = ''
  await loadChat()
}

async function handleAuth(mode: 'signin' | 'signup') {
  if (!authEmailInput || !authPasswordInput || !displayNameInput) return

  const email = authEmailInput.value.trim()
  const password = authPasswordInput.value
  const name = clampName(displayNameInput.value || getAnonymousAlias())

  if (!email || !password) {
    setAuthStatus('Renseigne email et mot de passe.', 'error')
    return
  }

  if (mode === 'signup') {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name } },
    })
    if (error) {
      setAuthStatus(error.message, 'error')
      return
    }

    if (data.user) {
      await supabase.from('profiles').upsert({ user_id: data.user.id, display_name: name })
    }
    setAuthStatus('Compte créé. Vérifie ton email si Supabase le demande.', 'success')
    return
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    setAuthStatus(error.message, 'error')
    return
  }

  setAuthStatus('Connexion ouverte.', 'success')
}

function subscribeRealtime() {
  communityChannel?.unsubscribe()

  communityChannel = supabase
    .channel('gothicanal-community')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'video_comments' }, () => {
      loadEngagement()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'video_likes' }, () => {
      loadEngagement()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => {
      loadChat()
    })
    .subscribe()
}

searchInput?.addEventListener('input', (event) => {
  currentSearch = (event.target as HTMLInputElement).value
  renderList()
})

categoryFilter?.addEventListener('change', (event) => {
  currentCategory = (event.target as HTMLSelectElement).value
  renderList()
})

refreshButton?.addEventListener('click', () => {
  loadVideos()
  loadChat()
})

uploadForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  await uploadVideo(uploadForm)
})

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
  setAuthStatus('Session fermée. Retour en présence anonyme.', 'success')
})

likeButton?.addEventListener('click', () => {
  toggleLike()
})

commentForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  await submitComment(commentForm)
})

chatForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  await submitChatMessage(chatForm)
})

supabase.auth.onAuthStateChange(async (_event, nextSession) => {
  session = nextSession
  await loadProfile()
  renderEngagement()
})

async function init() {
  cleanBrowserCaches().catch((error: unknown) => {
    console.warn('Cache cleanup skipped.', error)
  })
  const { data } = await supabase.auth.getSession()
  session = data.session
  subscribeRealtime()
  await loadProfile()
  await loadVideos()
  await loadChat()
}

init()
