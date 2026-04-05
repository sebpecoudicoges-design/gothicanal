import './style.css'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('App container not found')
}

app.innerHTML = `
  <main class="page-shell">
    <section class="hero-banner" aria-label="Bandeau GothiCanal">
      <img src="/gothicanal-banner.jpg" alt="Bandeau GothiCanal avec logo, portrait punk et palmier" />
      <div class="hero-overlay"></div>
    </section>

    <section class="hero-copy section section-intro">
      <p class="eyebrow">Gothicanal.com</p>
      <h1>Le canal gothique, solaire et décalé.</h1>
      <p class="lead">
        Une première page d'accueil pour poser l'univers : une identité visuelle forte,
        une base propre sur Vite, Netlify et Supabase, et un site prêt à évoluer.
      </p>
      <div class="hero-actions">
        <a class="button button-primary" href="#univers">Découvrir l'univers</a>
        <a class="button button-secondary" href="#prochainement">Voir la suite</a>
      </div>
    </section>

    <section id="univers" class="section content-grid">
      <article class="panel panel-featured">
        <p class="panel-kicker">Direction artistique</p>
        <h2>Une ambiance gothique qui ne se prend pas pour un musée.</h2>
        <p>
          Le bandeau devient la pièce centrale du site : rouge saturé, silhouette punk,
          énergie frontale, et un contraste volontairement pop avec le palmier.
        </p>
      </article>

      <article class="panel">
        <p class="panel-kicker">Base technique</p>
        <h3>Stack déjà en place</h3>
        <ul>
          <li>Vite + TypeScript pour le front</li>
          <li>Supabase prêt pour la donnée et l'auth</li>
          <li>Netlify prêt pour le déploiement</li>
        </ul>
      </article>

      <article class="panel">
        <p class="panel-kicker">Intention</p>
        <h3>Landing page claire</h3>
        <p>
          Cette première version sert de socle : visuel principal, ton éditorial,
          sections réutilisables et structure simple à enrichir ensuite.
        </p>
      </article>
    </section>

    <section id="prochainement" class="section roadmap">
      <div class="roadmap-header">
        <p class="eyebrow">Prochainement</p>
        <h2>Ce qu'on pourra brancher ensuite</h2>
      </div>
      <div class="roadmap-grid">
        <article class="roadmap-card">
          <span>01</span>
          <h3>Pages éditoriales</h3>
          <p>Accueil, manifeste, galerie, événements, contact.</p>
        </article>
        <article class="roadmap-card">
          <span>02</span>
          <h3>Back-office léger</h3>
          <p>Contenus dynamiques, formulaire, mailing ou actualités.</p>
        </article>
        <article class="roadmap-card">
          <span>03</span>
          <h3>Version production</h3>
          <p>Nom de domaine final, DNS propre, SSL validé et contenu réel.</p>
        </article>
      </div>
    </section>
  </main>
`
