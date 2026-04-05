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

if (!app) {
  throw new Error('App root not found')
}

app.innerHTML = `
  <main class="site-shell">
    <section class="hero-banner">
      <img src="/gothicanal-banner.jpg" alt="Bandeau GothiCanal" class="hero-banner__image" />
      <div class="hero-banner__veil"></div>
      <div class="hero-banner__content reveal-up">
        <span class="eyebrow">GothiCanal</span>
        <h1>Archives mouvantes, visions nocturnes et fragments à revoir.</h1>
        <p>
          Un répertoire vidéo à l’esthétique feutrée, pensé pour classer, retrouver et revoir ce qui mérite un second regard.
        </p>
        <div class="hero-banner__chips">
          <span>Ambiance implicite</span>
          <span>Répertoire vidéo</span>
          <span>Lecture instantanée</span>
        </div>
      </div>
    </section>

    <section class="toolbar reveal-up reveal-delay-1">
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
      <aside class="panel panel--sticky reveal-up reveal-delay-2">
        <div class="panel__header">
          <span class="panel__kicker">Dépôt</span>
          <h2>Ajouter une vidéo</h2>
          <p>Dépose un fichier, choisis une catégorie et renseigne le minimum utile.</p>
        </div>

        <form id="uploadForm" class="upload-form">
          <div class="field">
            <label for="videoTitle">Titre</label>
            <input id="videoTitle" name="title" type="text" maxlength="120" required placeholder="Ex. Mouvement en velours" />
          </div>

          <div class="field">
            <label for="videoCategory">Catégorie</label>
            <select id="videoCategory" name="category" required>
              ${CATEGORIES.map((category) => `<option value="${category}">${category}</option>`).join('')}
            </select>
          </div>

          <div class="field">
            <label for="videoDescription">Description</label>
            <textarea id="videoDescription" name="description" rows="4" maxlength="500" placeholder="Quelques lignes, sans trop en dire."></textarea>
          </div>

          <div class="field">
            <label for="videoFile">Fichier vidéo</label>
            <input id="videoFile" name="file" type="file" accept="video/*" required />
            <small>MP4 conseillé. Le stockage passe par Supabase Storage.</small>
          </div>

          <button id="uploadButton" class="primary-button" type="submit">Publier dans l’archive</button>
          <p id="formStatus" class="form-status" aria-live="polite"></p>
        </form>
      </aside>

      <section class="content-column">
        <article class="panel player-panel reveal-up reveal-delay-2">
          <div class="panel__header">
            <span class="panel__kicker">Lecture</span>
            <h2 id="playerTitle">Aucune sélection</h2>
            <p id="playerMeta">Choisis une vidéo dans l’archive pour lancer la lecture.</p>
          </div>

          <div class="player-frame" id="playerFrame">
            <div class="player-frame__empty">
              <span>Le projecteur attend.</span>
            </div>
          </div>
          <p id="playerDescription" class="player-description"></p>
        </article>

        <article class="panel reveal-up reveal-delay-3">
          <div class="panel__header panel__header--inline">
            <div>
              <span class="panel__kicker">Archive</span>
              <h2>Répertoire vidéo</h2>
            </div>
            <span id="resultsCount" class="results-pill">0 vidéo</span>
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
  if (!videoList || !resultsCount) return

  const filtered = getFilteredVideos()
  resultsCount.textContent = `${filtered.length} vidéo${filtered.length > 1 ? 's' : ''}`

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

  videoList.querySelectorAll<HTMLButtonElement>('[data-video-id]').forEach((button) => {
    button.addEventListener('click', () => {
      activeVideoId = button.dataset.videoId ?? null
      renderPlayer()
      renderList()
      document.querySelector('.player-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
          <p>La table <code>videos</code> ou le bucket <code>${BUCKET}</code> n’est probablement pas encore initialisé.</p>
        </div>
      `
    }
    if (resultsCount) {
      resultsCount.textContent = '0 vidéo'
    }
    return
  }

  videos = (data ?? []) as VideoItem[]

  const stillExists = videos.some((video) => video.id === activeVideoId)
  if (!stillExists) {
    activeVideoId = videos[0]?.id ?? null
  }

  renderPlayer()
  renderList()
}

async function handleUpload(event: SubmitEvent) {
  event.preventDefault()
  if (!uploadForm || isUploading) return

  const formData = new FormData(uploadForm)
  const title = String(formData.get('title') ?? '').trim()
  const category = String(formData.get('category') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const file = formData.get('file')

  if (!(file instanceof File) || !file.size) {
    setStatus('Choisis un fichier vidéo valide.', 'error')
    return
  }

  if (!title) {
    setStatus('Le titre est obligatoire.', 'error')
    return
  }

  isUploading = true
  if (uploadButton) uploadButton.disabled = true
  setStatus('Envoi en cours…', 'neutral')

  const extension = file.name.includes('.') ? file.name.split('.').pop() : 'mp4'
  const path = `${Date.now()}-${slugify(title)}.${extension}`

  try {
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'video/mp4',
      })

    if (uploadError) {
      throw uploadError
    }

    const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path)
    const publicUrl = publicData.publicUrl

    const { data: inserted, error: insertError } = await supabase
      .from('videos')
      .insert({
        title,
        description: description || null,
        category,
        storage_path: path,
        public_url: publicUrl,
      })
      .select('id')
      .single()

    if (insertError) {
      await supabase.storage.from(BUCKET).remove([path])
      throw insertError
    }

    uploadForm.reset()
    activeVideoId = inserted.id
    setStatus('Vidéo publiée dans l’archive.', 'success')
    await loadVideos()
  } catch (error) {
    console.error(error)
    const message = error instanceof Error ? error.message : 'Erreur inconnue.'
    setStatus(`Échec de publication : ${message}`, 'error')
  } finally {
    isUploading = false
    if (uploadButton) uploadButton.disabled = false
  }
}

searchInput?.addEventListener('input', (event) => {
  currentSearch = (event.target as HTMLInputElement).value.trim()
  renderList()
})

categoryFilter?.addEventListener('change', (event) => {
  currentCategory = (event.target as HTMLSelectElement).value
  renderList()
})

refreshButton?.addEventListener('click', () => {
  void loadVideos()
})

uploadForm?.addEventListener('submit', (event) => {
  void handleUpload(event)
})

void loadVideos()
