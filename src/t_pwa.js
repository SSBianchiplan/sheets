/* ================= PWA e celular ================= */
const MOBQ=matchMedia('(max-width:760px),(max-height:500px) and (max-width:1024px)');
function ribbonMin(rb,on){rb.classList.toggle('rmin',on);const b=rb.querySelector('.rbmin');if(b)b.setAttribute('aria-expanded',on?'false':'true')}
function pwaInit(){
  // faixa de ferramentas: recolhida no celular; tocar numa aba expande, tocar na aba ativa (ou na seta) recolhe
  for(const rb of $$('.ribbon')){if(MOBQ.matches)ribbonMin(rb,true);
    rb.querySelector('.rbmin').addEventListener('click',()=>ribbonMin(rb,!rb.classList.contains('rmin')));
    rb.querySelector('.rtabs').addEventListener('click',e=>{const t=e.target.closest('.rtab');if(!t||!MOBQ.matches)return;
      if(rb.classList.contains('rmin'))ribbonMin(rb,false);else if(t.getAttribute('aria-selected')==='true')ribbonMin(rb,true)},true)}
  MOBQ.addEventListener('change',()=>{for(const rb of $$('.ribbon'))ribbonMin(rb,MOBQ.matches)});
  // a grade e os gráficos acompanham quando a faixa recolhe ou expande
  new ResizeObserver(()=>{if(APP.mode==='sheet')drawNow()}).observe($('#gridHost'));
  // no toque, selecionar célula não abre o teclado; editar com toque duplo ou na barra de fórmulas
  if(matchMedia('(pointer:coarse)').matches&&!matchMedia('(any-pointer:fine)').matches)$('#kbd').setAttribute('inputmode','none');
}
// service worker (só quando servido por http/https; o arquivo offline abre como file:)
if('serviceWorker' in navigator&&!SRV.local&&/^https?:$/.test(location.protocol))
  addEventListener('load',()=>navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(e=>console.warn('Service worker não registrado:',e&&e.message)));
