// home.js — LOOKTURA landing orchestration
// Lenis smooth scroll + GSAP ScrollTrigger pin/scrub driving the phone ring,
// synced captions + dots, nav, FAQ, waitlist, scroll reveals.
// Graceful fallback when reduced-motion is set or WebGL is unavailable.

import { createPhoneCarousel } from './phone.js?v=115';

const SCREENS = [
  { url: 'assets/screens/swipe.jpg',   focus: 'center', t: 'Лента вещей',          s: 'Всё в наличии, всё рядом' },
  { url: 'assets/screens/matches.jpg', focus: 'center', t: 'Твои мэтчи',           s: 'Что зацепило, то не потеряется' },
  { url: 'assets/screens/booking.jpg', focus: 'center', t: 'Бронь примерки',       s: 'Возвратные 5%, и вещь отложена' },
  { url: 'assets/screens/catalog.jpg', focus: 'center', t: 'Каталог магазина',     s: 'Размеры, цены, наличие: без звонков' },
  { url: 'assets/screens/route.jpg',   focus: 'center', t: 'Маршрут по бутикам',   s: 'Город вместо пункта выдачи', glow: true },
  { url: 'assets/screens/home.jpg',    focus: 'center', t: 'Всё в одном',          s: 'Лента, мэтчи, брони и маршруты' },
];

// 7th stop: the first phone re-skins to wishlists while it is turned away,
// so finishing the scroll reveals a new screen instead of repeating screen 1.
const WISHLISTS = { url: 'assets/screens/wishlists.jpg', focus: 'center', t: 'Твои вишлисты', s: 'Собирай подборки, делись с друзьями' };
const CAPS = [...SCREENS.map((s) => ({ t: s.t, s: s.s, glow: s.glow })), { t: WISHLISTS.t, s: WISHLISTS.s }];

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasWebGL = (() => {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
})();

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ---------------------------------------------------------------- nav */
function initNav() {
  const nav = $('#nav');
  const burger = $('#burger');
  const menu = $('#menu');
  let open = false;
  nav.classList.add('is-hidden');           // stay hidden until scrolled past the hero

  burger.addEventListener('click', () => {
    open = !open;
    menu.classList.toggle('open', open);
    nav.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
    if (window.__lenis) open ? window.__lenis.stop() : window.__lenis.start();
  });
  $$('#menu a').forEach((a) => a.addEventListener('click', () => {
    open = false; menu.classList.remove('open'); nav.classList.remove('menu-open');
    burger.setAttribute('aria-expanded', 'false'); document.body.style.overflow = '';
    if (window.__lenis) window.__lenis.start();
  }));

  return (y) => {
    if (open) return;
    const st = window.__heroST;
    const heroEnd = (st && st.end) ? st.end : window.innerHeight;
    nav.classList.toggle('is-hidden', y < heroEnd - 40);   // shows only below the hero
  };
}

/* --------------------------------------------------------------- faq */
function initFaq() {
  $$('.faq__item').forEach((item) => {
    const q = $('.faq__q', item);
    q.addEventListener('click', () => {
      const isOpen = item.classList.toggle('open');
      q.setAttribute('aria-expanded', String(isOpen));
    });
  });
}

/* ----------------------------------------------------------- waitlist */
function initWaitlist() {
  const form = $('#waitlist');
  if (!form) return;
  const input = $('#email', form);
  const msg = $('#waitMsg', form);
  const cfg = window.LK_CONFIG || {};
  const valid = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = input.value.trim();
    msg.classList.remove('err');
    if (!valid(email)) { msg.textContent = 'Похоже, в почте опечатка — проверь ещё раз.'; msg.classList.add('err'); input.focus(); return; }
    if (cfg.endpoint) {
      try {
        msg.textContent = 'Отправляем…';
        const r = await fetch(cfg.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
        if (!r.ok) throw new Error('bad');
        msg.textContent = 'Готово! Напишем за пару недель до старта.';
        form.reset();
      } catch (_) {
        msg.textContent = 'Не получилось отправить. Напишем вручную — открываем почту…';
        location.href = `mailto:${cfg.email}?subject=Ранний доступ LOOKTURA&body=Запишите меня: ${encodeURIComponent(email)}`;
      }
    } else {
      msg.textContent = 'Готово! Открываем почту, чтобы подтвердить.';
      location.href = `mailto:${cfg.email}?subject=Ранний доступ LOOKTURA&body=Запишите меня в ранний доступ: ${encodeURIComponent(email)}`;
      form.reset();
    }
  });
}

/* -------------------------------------------------- line-reveal titles */
// Wrap each <br>-separated line of the big section titles in a masked span:
// the existing .rv observer then slides the lines up from under the mask.
function initLineReveal() {
  if (reduce) return;
  $$('.lenta .sec__title, .boutiques .sec__title, .why .sec__title, .start .sec__title').forEach((h) => {
    const parts = h.innerHTML.split(/<br\s*\/?>/i).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    h.innerHTML = parts.map((p) => `<span class="line"><span class="line__in">${p}</span></span>`).join('');
  });
}

/* -------------------------------------- scroll-scrubbed section motion */
// Needs gsap + ScrollTrigger — called only from the Lenis branch of init3D.
function initSectionMotion() {
  const gsap = window.gsap;
  if (!gsap || !window.ScrollTrigger) return;

  // the define manifesto reads itself word by word as you scroll past it
  const t = $('.define__t');
  if (t) {
    const words = t.textContent.trim().split(/\s+/);
    t.setAttribute('aria-label', t.textContent.trim());
    t.innerHTML = words.map((w) => `<span class="w" aria-hidden="true">${w}</span>`).join(' ');
    gsap.fromTo('.define__t .w', { opacity: 0.16 }, {
      opacity: 1, ease: 'none', stagger: 0.35,
      scrollTrigger: { trigger: '.define', start: 'top 78%', end: 'top 32%', scrub: 0.5 },
    });
  }

  // the final CTA card "docks" into place, tied to the scroll
  if ($('.final__card')) {
    gsap.fromTo('.final__card', { y: 36, scale: 0.97, opacity: 0 }, {
      y: 0, scale: 1, opacity: 1, ease: 'none',
      scrollTrigger: { trigger: '.final', start: 'top 88%', end: 'top 45%', scrub: 0.6 },
    });
  }
}

/* --------------------------------------- lookbook rail: drag + cursor */
function initFeedDrag() {
  const feed = $('.feed');
  if (!feed || !matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  $$('img', feed).forEach((i) => { i.draggable = false; });   // no ghost-image on grab
  let down = false, startX = 0, startScroll = 0, vel = 0, lastX = 0, lastT = 0, raf = 0;
  feed.addEventListener('pointerdown', (e) => {
    down = true; feed.classList.add('is-drag');
    startX = e.clientX; startScroll = feed.scrollLeft; lastX = e.clientX; lastT = performance.now();
    cancelAnimationFrame(raf);
    feed.setPointerCapture(e.pointerId);
  });
  feed.addEventListener('pointermove', (e) => {
    if (!down) return;
    feed.scrollLeft = startScroll - (e.clientX - startX);
    const now = performance.now();
    vel = (e.clientX - lastX) / Math.max(now - lastT, 1) * 16;
    lastX = e.clientX; lastT = now;
  });
  const end = () => {
    if (!down) return;
    down = false;
    const step = () => {                       // let go — coast on inertia
      vel *= 0.94; feed.scrollLeft -= vel;
      if (Math.abs(vel) > 0.3) raf = requestAnimationFrame(step);
      else feed.classList.remove('is-drag');
    };
    raf = requestAnimationFrame(step);
  };
  feed.addEventListener('pointerup', end);
  feed.addEventListener('pointercancel', end);
}

// a glass "drag me" pill that floats after the cursor over the rail
function initFeedCursor() {
  if (reduce || !matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  const gsap = window.gsap;
  const feed = $('.feed');
  if (!feed || !gsap) return;
  const tip = document.createElement('div');
  tip.className = 'ctip glass';
  tip.setAttribute('aria-hidden', 'true');
  tip.innerHTML = '<span>←</span>тяни<span>→</span>';
  document.body.appendChild(tip);
  gsap.set(tip, { xPercent: -50, yPercent: -120, scale: 0.6 });
  const qx = gsap.quickTo(tip, 'x', { duration: 0.35, ease: 'power3' });
  const qy = gsap.quickTo(tip, 'y', { duration: 0.35, ease: 'power3' });
  feed.addEventListener('pointermove', (e) => { qx(e.clientX); qy(e.clientY); }, { passive: true });
  feed.addEventListener('pointerenter', (e) => {
    gsap.set(tip, { x: e.clientX, y: e.clientY });
    gsap.to(tip, { opacity: 1, scale: 1, duration: 0.25, ease: 'power2.out' });
  });
  feed.addEventListener('pointerleave', () => gsap.to(tip, { opacity: 0, scale: 0.6, duration: 0.2 }));
  feed.addEventListener('pointerdown', () => gsap.to(tip, { scale: 0.8, duration: 0.15 }));
  window.addEventListener('pointerup', () => gsap.to(tip, { scale: 1, duration: 0.2 }));
}

/* ---------------------------------------------------------- scrollspy */
// keeps the nav's gradient underline on the section currently in view
function initScrollSpy() {
  const links = $$('.nav__links a[href^="#"]');
  if (!links.length || !('IntersectionObserver' in window)) return;
  const byId = Object.fromEntries(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((a) => a.classList.remove('active'));
      const link = byId[e.target.id];
      if (link) link.classList.add('active');
    });
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
  Object.keys(byId).forEach((id) => {
    const s = document.getElementById(id);
    if (s) obs.observe(s);
  });
}

/* ------------------------------------------------------------ reveals */
function initReveals() {
  const els = $$('.rv');
  if (reduce || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
  els.forEach((e) => io.observe(e));
}

/* ------------------------------------------------------- caption/dots */
function initCaptionDots() {
  const cap = $('#ringCap');
  const capT = $('#ringCapT');
  const capS = $('#ringCapS');
  const dotsWrap = $('#ringDots');
  const pin = $('#heroPin');
  CAPS.forEach(() => dotsWrap.appendChild(document.createElement('span')));
  const dots = $$('span', dotsWrap);
  let cur = -1, to;

  function set(i) {
    if (i === cur) return;
    cur = i;
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
    const glow = !!CAPS[i].glow;               // route screen gets the iridescent highlight
    cap.classList.toggle('route', glow);
    if (pin) pin.classList.toggle('route-on', glow);
    cap.classList.remove('show');
    clearTimeout(to);
    to = setTimeout(() => { capT.textContent = CAPS[i].t; capS.textContent = CAPS[i].s; cap.classList.add('show'); }, 150);
  }
  // first paint immediately
  capT.textContent = CAPS[0].t; capS.textContent = CAPS[0].s;
  requestAnimationFrame(() => cap.classList.add('show'));
  cur = 0; dots[0].classList.add('on');
  return set;
}

/* --------------------------------------------------------------- 3D */
async function init3D() {
  const ring = $('#ring');
  const setCap = initCaptionDots();
  const car = createPhoneCarousel(ring, { screens: SCREENS, reducedMotion: reduce });
  window.__car = car;

  if (!reduce) {
    window.addEventListener('pointermove', (e) =>
      car.setMouse((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1), { passive: true });
  }

  // Lenis + GSAP
  const gsap = window.gsap;
  const ST = window.ScrollTrigger;
  let onScrollNav;

  if (window.Lenis && gsap && ST && !reduce) {
    gsap.registerPlugin(ST);
    const lenis = new Lenis({ lerp: 0.11, smoothWheel: true, wheelMultiplier: 1 });
    window.__lenis = lenis;
    lenis.on('scroll', ST.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);

    onScrollNav = initNav();
    lenis.on('scroll', ({ scroll }) => onScrollNav(scroll));

    const N = SCREENS.length;             // 6 phones / full 360° turn
    let wlTex = null, swTex = null, slot0WL = false;
    window.__heroST = ST.create({
      trigger: '#heroPin', start: 'top top', end: '+=320%',
      pin: true, pinSpacing: true, scrub: true, invalidateOnRefresh: true,
      onUpdate: (self) => {
        const p = self.progress;
        car.setProgress(p);
        // 7 stops: the 6 screens, then the first phone returns re-skinned as wishlists
        setCap(Math.max(0, Math.min(Math.round(p * N), CAPS.length - 1)));
        // swap the first phone to wishlists while it is turned away (back of the ring)
        const wantWL = p > 0.5;
        if (wlTex && wantWL !== slot0WL) { car.setSlotMap(0, wantWL ? wlTex : swTex); slot0WL = wantWL; }
      },
    });

    // ---- magnetic snap ------------------------------------------------------
    // Two-stage magnet, driven through Lenis so it reads as a CONTINUATION of the
    // scroll, never a separate correction:
    //   1) EARLY GRAB — once a swipe has spent its energy and is coasting, take
    //      over the tail of the glide and steer it into the nearest phone.
    //   2) STOP BACKSTOP — slow scrolls that never flicked get a gentle pull
    //      once they settle.
    // Seamlessness: the takeover starts at the CURRENT scroll velocity — a cubic
    // Hermite easing whose initial slope matches the live coast (s0), decaying to
    // zero at the phone. s0=0 is smoothstep (gentle from rest, so the backstop
    // never kicks), s0=3 is pure ease-out; in between, the coast simply bends
    // into the phone with no kink in the motion.
    {
      const FLICK_V = 250;   // lenis.velocity above this = an intentional swipe
      const GRAB_V  = 150;   // once it decays to here, take over the coast
      let snapTimer, snapTarget = null, flicked = false, snapUntil = 0;
      let lastS = 0, lastT = 0, vPxs = 0;            // self-tracked velocity, px/s

      const snapNow = () => {
        const st = window.__heroST;
        if (!st) return;
        const cur = (lenis.scroll ?? window.scrollY);
        if (cur < st.start - 2 || cur > st.end + 2) { snapTarget = null; return; }  // only within the pinned hero
        const span = st.end - st.start;
        if (span <= 0) return;
        const step = span / N;
        const ref = lenis.targetScroll ?? cur;                           // where the momentum is heading
        const target = st.start + Math.round((ref - st.start) / step) * step;
        const dist = Math.abs(target - cur);
        if (dist < 2) { snapTarget = null; return; }                     // already resting on a phone
        if (target === snapTarget) return;                               // already easing to this phone
        snapTarget = target;
        const vTo = Math.max(0, vPxs * Math.sign(target - cur));         // live px/s toward the target
        const dur = vTo > 60
          ? Math.min(1.1, Math.max(0.4, 2 * dist / vTo))                 // aim for a matched slope of ~2
          : 0.65;                                                        // from rest: unhurried
        const s0 = Math.min(3, (vTo * dur) / dist);                      // normalised initial slope
        const ease = (t) => ((s0 - 2) * t * t * t + (3 - 2 * s0) * t * t + s0 * t);
        snapUntil = performance.now() + dur * 1000 + 80;
        lenis.scrollTo(target, { duration: dur, easing: ease, force: true });
      };

      lenis.on('scroll', () => {
        const now = performance.now();
        const s = (lenis.scroll ?? window.scrollY);
        if (lastT) { const dt = (now - lastT) / 1000; if (dt > 0 && dt < 0.25) vPxs = (s - lastS) / dt; }
        lastS = s; lastT = now;

        // while our own pull is animating, don't let it re-trigger the state
        // machine (its velocity profile would read as a fresh flick)
        if (now >= snapUntil) {
          const st = window.__heroST;
          const inHero = st && s >= st.start - 2 && s <= st.end + 2;
          const v = Math.abs(lenis.velocity ?? 0);
          if (!inHero) { flicked = false; snapTarget = null; }
          else if (v > FLICK_V) { flicked = true; snapTarget = null; }   // user took over — re-arm
          else if (flicked && v <= GRAB_V) { flicked = false; snapNow(); } // take over the coasting tail
        }
        // backstop: settle onto a phone once everything stops
        clearTimeout(snapTimer);
        snapTimer = setTimeout(snapNow, 60);
      });
    }

    initAnchors(lenis);
    initSectionMotion();
    car.ready.then(async () => {
      swTex = car.screenTexture(0);
      wlTex = await car.loadTexture(WISHLISTS.url, WISHLISTS.focus);
      ST.refresh();
    });
  } else {
    // reduced motion: no pin/scrub, ring stays on first screen, native scroll
    onScrollNav = initNav();
    window.addEventListener('scroll', () => onScrollNav(window.scrollY), { passive: true });
    initAnchors(null);
  }
}

/* --------------------------------------------------- fallback (no WebGL) */
function initFallback() {
  document.documentElement.classList.add('no-webgl');
  const ring = $('#ring');
  ring.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'fallgrid';
  [...SCREENS, WISHLISTS].forEach((s) => {
    const fig = document.createElement('figure');
    fig.className = 'fallphone';
    const img = document.createElement('img');
    img.src = s.url; img.alt = s.t; img.loading = 'lazy';
    fig.appendChild(img);
    grid.appendChild(fig);
  });
  ring.appendChild(grid);
  $('#hero').style.height = 'auto';
  $('#heroPin').style.height = 'auto';
  $('#heroPin').style.minHeight = '100vh';
  $('#ringCap').style.display = 'none';
  $('#ringDots').style.display = 'none';

  const onScrollNav = initNav();
  window.addEventListener('scroll', () => onScrollNav(window.scrollY), { passive: true });
  initAnchors(null);
}

/* ----------------------------------------------------------- anchors */
function initAnchors(lenis) {
  $$('a[data-link]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (!id || !id.startsWith('#')) return;
      const el = $(id);
      if (!el) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(el, { offset: -8, duration: 1.1 });
      else el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    });
  });
}

/* --------------------------------------------------------------- boot */
function boot() {
  initFaq();
  initWaitlist();
  initLineReveal();      // must wrap the titles before the .rv observer fires
  initReveals();
  initFeedDrag();
  initFeedCursor();
  initScrollSpy();
  if (hasWebGL) init3D(); else initFallback();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
