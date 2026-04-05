import './style.css'
import typescriptLogo from './assets/typescript.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import { setupCounter } from './counter.ts'
import { supabase } from './lib/supabase'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<section id="center">
  <div class="hero">
    <img src="${heroImg}" class="base" width="170" height="179">
    <img src="${typescriptLogo}" class="framework" alt="TypeScript logo"/>
    <img src=${viteLogo} class="vite" alt="Vite logo" />
  </div>
  <div>
    <h1>Get started</h1>
    <p>Edit <code>src/main.ts</code> and save to test <code>HMR</code></p>
  </div>
  <button id="counter" type="button" class="counter"></button>
</section>

<div class="ticks"></div>

<section id="next-steps">
  <div id="docs">
    <h2>Documentation</h2>
  </div>
</section>
`

setupCounter(document.querySelector<HTMLButtonElement>('#counter')!)

// ✅ TEST SUPABASE
async function testSupabase() {
  const { data, error } = await supabase
    .from('test_connection')
    .select('*')

  console.log('SUPABASE DATA:', data)
  console.log('SUPABASE ERROR:', error)
}

testSupabase()