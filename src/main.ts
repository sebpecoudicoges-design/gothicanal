import './style.css'
import { supabase } from './lib/supabase'

type VideoItem = {
  id: string
  title: string
  description: string | null
  category: string | null
  public_url: string
  storage_path: string
  created_at: string
}

const CATEGORIES = ['Rituel', 'Nocturne', 'Archive', 'Velours', 'Obscur', 'Autre']
const BUCKET = 'videos'

let videos: VideoItem[] = []
let activeVideoId: string | null = null
let currentSearch = ''
let currentCategory = 'all'
let isUploading = false

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('App root not found')

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
            Un lieu pensé pour trier des fragments, classer des ambiances et laisser parler l’esthétique sans jamais tout expliquer.
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
              <span class="stat-card__value">6</span>
              <span class="stat-card__label">catégories d’ambiance</span>
            </div>
            <div class="stat-card">
              <span class="stat-card__value">∞</span>
              <span class="stat-card__label">relectures possibles</span>
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
        <span>Velours sombre</span>
        <span>Présences obliques</span>
        <span>Archives nocturnes</span>
        <span>Fragments à revoir</span>
      </div>
    </section>

    <section class="toolbar reveal-up reveal-delay-2" id="archive">
      <div class="toolbar__search">
        <label for="searchInput">Recherche</label>
        <input id="searchInput" type="search" placeholder="Titre, description ou catégorie" autocomplete="off" />
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
      <aside class="panel panel--sticky reveal-up reveal-delay-2" id="upload">
        <div class="panel__header panel__header--premium">
          <span class="panel__kicker">Dépôt</span>
          <h2>Déposer une nouvelle séquence</h2>
          <p>Renseigne l’essentiel. Le reste pourra rester entre les lignes.</p>
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
            <input id="videoFile" name="file" type="file" accept="video/*" required />
            <small>Format MP4 conseillé. Hébergement via Supabase Storage.</small>
          </div>

          <button id="uploadButton" class="primary-button" type="submit">Publier dans l’archive</button>
          <p id="formStatus" class="form-status" aria-live="polite"></p>
        </form>
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
        </article>

        <article class="panel reveal-up reveal-delay-3">
          <div class="panel__header panel__header--premium">
            <span class="panel__kicker">Archive</span>
            <h2>Répertoire vidéo</h2>
            <p>Recherche rapide, tri par catégorie, lecture instantanée.</p>
          </div>
          <div id="videoList" class="video-grid"></div>
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

function setStatus(message: string, tone: 'neutral' | 'success' | 'error' = 'neutral') {
  if (!formStatus) return
  formStatus.textContent = message
  formStatus.dataset.tone = tone
}

function getFilteredVideos() {
  return videos.filter((video) => {
    const matchesCategory = currentCategory === 'all' || video.category === currentCategory
    const haystack = `${video.title} ${video.description ?? ''} ${video.category ?? ''}`.toLowerCase()
    const matchesSearch = haystack.includes(currentSearch.toLowerCase())
    return matchesCategory && matchesSearch
  })
}

function renderPlayer() {
  if (!playerTitle || !playerMeta || !playerFrame || !playerDescription) return

  const selected = videos.find((video) => video.id === activeVideoId) ?? null

  if (!selected) {
    playerTitle.textContent = 'Aucune sélection'
    playerMeta.textContent = 'Choisis une vidéo dans l’archive pour lancer la lecture.'
    playerDescription.textContent = ''
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
  playerFrame.innerHTML = `
    <video controls playsinline preload="metadata" src="${selected.public_url}" class="player-frame__video"></video>
  `
}

function renderList() {
  if (!videoList || !resultsCount || !heroCount) return

  const filtered = getFilteredVideos()
  resultsCount.textContent = `${filtered.length} vidéo${filtered.length > 1 ? 's' : ''}`
  heroCount.textContent = String(videos.length)

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
            <span>${formatDate(video.created_at)}</span>
            <span>Voir</span>
          </div>
        </button>
      `
    })
    .join('')

  videoList.querySelectorAll<HTMLButtonElement>('.video-card').forEach((button) => {
    button.addEventListener('click', () => {
      activeVideoId = button.dataset.videoId ?? null
      renderPlayer()
      renderList()
      document.querySelector('#player')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  })
}

async function loadVideos() {
  const { data, error } = await supabase
    .from('videos')
    .select('id, title, description, category, public_url, storage_path, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error(error)
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

  videos = (data ?? []) as VideoItem[]
  if (!activeVideoId && videos.length) activeVideoId = videos[0].id
  renderPlayer()
  renderList()
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

  isUploading = true
  uploadButton.disabled = true
  uploadButton.textContent = 'Publication en cours…'
  setStatus('Envoi vers le stockage…')

  const extension = file.name.split('.').pop()?.toLowerCase() || 'mp4'
  const fileName = `${Date.now()}-${slugify(title) || 'video'}.${extension}`
  const storagePath = `${category.toLowerCase()}/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
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

  const { data: inserted, error: insertError } = await supabase
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

  if (insertError) {
    console.error(insertError)
    setStatus(`Métadonnées non enregistrées: ${insertError.message}`, 'error')
    isUploading = false
    uploadButton.disabled = false
    uploadButton.textContent = 'Publier dans l’archive'
    return
  }

  setStatus('Vidéo publiée dans l’archive.', 'success')
  form.reset()
  videos = [inserted as VideoItem, ...videos]
  activeVideoId = (inserted as VideoItem).id
  renderPlayer()
  renderList()
  isUploading = false
  uploadButton.disabled = false
  uploadButton.textContent = 'Publier dans l’archive'
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
})

uploadForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  await uploadVideo(uploadForm)
})

loadVideos()
