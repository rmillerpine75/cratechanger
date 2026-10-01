
// ════════════════════════════════════════════════════════════════
// THEME TOGGLE
// ════════════════════════════════════════════════════════════════
function toggleTheme(){
  const light = document.body.classList.toggle('light-theme');
  document.getElementById('themeBtn').textContent = light ? '🌙 DARK' : '☀ LIGHT';
  localStorage.setItem('cc_theme', light ? 'light' : 'dark');
}
// First visit follows the operating system's light/dark setting (live); once you click the theme button, your choice wins.
function applyInitialTheme(){
  const saved=localStorage.getItem('cc_theme');
  const sysLight=!!(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches);
  const light=saved==='light'||(saved!=='dark'&&sysLight);
  document.body.classList.toggle('light-theme',light);
  const b=document.getElementById('themeBtn');if(b)b.textContent=light?'🌙 DARK':'☀ LIGHT';
}
applyInitialTheme();
try{
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change',()=>{if(!localStorage.getItem('cc_theme'))applyInitialTheme()});
}catch(e){}
