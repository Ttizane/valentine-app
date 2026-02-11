/* global window, document, localStorage, URLSearchParams, navigator */
(function () {
  const STORAGE_KEY = 'valentineApp:v1';

  function readState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function writeState(patch) {
    const current = readState();
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  function getNameFromQueryOrState() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = (params.get('name') || '').trim();
    if (fromQuery) return fromQuery.slice(0, 24);

    const state = readState();
    const fromState = (state.name || '').trim();
    return fromState ? fromState.slice(0, 24) : '';
  }

  function setQueryParam(url, key, value) {
    const u = new URL(url, window.location.href);
    if (value) u.searchParams.set(key, value);
    return u.pathname + u.search;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }


  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function formatDate(yyyyMmDd) {
    if (!yyyyMmDd) return '';
    try {
      const [y, m, d] = yyyyMmDd.split('-').map(Number);
      const dt = new Date(y, (m || 1) - 1, d || 1);
      return dt.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    } catch {
      return yyyyMmDd;
    }
  }

  function initDecorations() {
    if (window.__valentineDecorationsInit) return;
    window.__valentineDecorationsInit = true;

    const heartsLayer = document.querySelector('.bg-hearts');
    if (heartsLayer) {
      let intervalId = null;

      function spawnHeart() {
        const heart = document.createElement('span');
        heart.className = 'heart';

        const x = Math.random() * 100;
        const size = 10 + Math.random() * 18;
        const dur = 6.2 + Math.random() * 4.0;
        const delay = Math.random() * 0.25;
        const alpha = 0.16 + Math.random() * 0.34;
        const drift = (Math.random() * 44) - 22; // px

        heart.style.setProperty('--x', `${x}vw`);
        heart.style.setProperty('--size', `${size}px`);
        heart.style.setProperty('--dur', `${dur}s`);
        heart.style.setProperty('--delay', `${delay}s`);
        heart.style.setProperty('--a', `${alpha}`);
        heart.style.setProperty('--drift', `${drift}px`);

        heartsLayer.appendChild(heart);

        // Cap total DOM nodes for performance.
        if (heartsLayer.childElementCount > 46) {
          heartsLayer.removeChild(heartsLayer.firstElementChild);
        }

        window.setTimeout(() => heart.remove(), (dur + delay + 0.3) * 1000);
      }

      function start() {
        if (intervalId) return;
        for (let i = 0; i < 10; i += 1) spawnHeart();
        intervalId = window.setInterval(spawnHeart, 340);
      }

      function stop() {
        if (!intervalId) return;
        window.clearInterval(intervalId);
        intervalId = null;
      }

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop();
        else start();
      });

      start();
    }

    // Tenor seals layer
    const sealLayer = document.createElement('div');
    sealLayer.className = 'seal-layer';
    document.body.appendChild(sealLayer);

    function ensureTenorScript() {
      const existing = document.querySelector('script[data-tenor-embed]');
      if (existing) return;
      const script = document.createElement('script');
      script.async = true;
      script.type = 'text/javascript';
      script.src = 'https://tenor.com/embed.js';
      script.setAttribute('data-tenor-embed', 'true');
      document.body.appendChild(script);
    }

    function addTenorSeal(className, rotationDeg, scale) {
      const wrapper = document.createElement('div');
      wrapper.className = `seal ${className}`;
      wrapper.style.setProperty('--r', `${rotationDeg}deg`);
      wrapper.style.setProperty('--s', `${scale}`);

      const embed = document.createElement('div');
      embed.className = 'tenor-gif-embed';
      embed.setAttribute('data-postid', '10641341261772870871');
      embed.setAttribute('data-share-method', 'host');
      embed.setAttribute('data-aspect-ratio', '1.23009');
      embed.setAttribute('data-width', '100%');

      wrapper.appendChild(embed);
      sealLayer.appendChild(wrapper);
    }

    addTenorSeal('seal-left', -6, 1);
    addTenorSeal('seal-right', 6, 1);
    ensureTenorScript();
  }

  function initStartPage() {
    initDecorations();
    const form = document.getElementById('startForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const name = String(data.get('name') || '').trim().slice(0, 24);
      if (!name) return;

      writeState({ name });
      const nextUrl = setQueryParam('question.html', 'name', name);
      window.location.href = nextUrl;
    });
  }

  function initQuestionPage() {
    initDecorations();

    const yesBtn = document.getElementById('yesBtn');
    const noBtn = document.getElementById('noBtn');
    const choiceArea = document.getElementById('choiceArea');
    const status = document.getElementById('status');
    const title = document.getElementById('questionTitle');
    if (!yesBtn || !noBtn || !choiceArea) return;

    const name = getNameFromQueryOrState();
    if (name && title) {
      title.innerHTML = `Vuoi essere la mia Valentina, <span class="accent">${escapeHtml(name)}</span>?`;
    }

    let attempts = 0;
    let lastNoPos = null;

    // Fixed loop positions (container-relative, normalized 0..1).
    // Chosen to be far apart and away from the center where the Yes button sits.
    const noLoopPoints = [
      { x: 0.08, y: 0.10 }, // top-left
      { x: 0.78, y: 0.12 }, // top-right
      { x: 0.10, y: 0.74 }, // bottom-left
      { x: 0.78, y: 0.76 }, // bottom-right
      { x: 0.48, y: 0.04 }, // top-middle
    ];
    let noLoopIndex = 0;

    function rectsIntersect(a, b) {
      return !(
        a.right <= b.left ||
        a.left >= b.right ||
        a.bottom <= b.top ||
        a.top >= b.bottom
      );
    }

    function placeNoButtonRandomly() {
      attempts += 1;
      noBtn.classList.add('is-fleeing');

      const areaRect = choiceArea.getBoundingClientRect();

      // Compute a forbidden rectangle around the Yes button (container-relative)
      // so the No button will never land on top of it.
      const yesRectAbs = yesBtn.getBoundingClientRect();
      const safeMargin = 14;
      const forbidden = {
        left: (yesRectAbs.left - areaRect.left) - safeMargin,
        top: (yesRectAbs.top - areaRect.top) - safeMargin,
        right: (yesRectAbs.right - areaRect.left) + safeMargin,
        bottom: (yesRectAbs.bottom - areaRect.top) + safeMargin,
      };

      const btnRect = noBtn.getBoundingClientRect();

      const padding = 10;
      const maxLeft = Math.max(padding, Math.floor(areaRect.width - btnRect.width - padding));
      const maxTop = Math.max(padding, Math.floor(areaRect.height - btnRect.height - padding));

      const minMove = clamp(Math.min(areaRect.width, areaRect.height) * 0.36, 90, 220);
      const minMoveSq = minMove * minMove;

      let chosen = null;
      let fallbackNonOverlap = null;

      // Try points in order from the current index, then advance index (loop).
      for (let step = 0; step < noLoopPoints.length; step += 1) {
        const idx = (noLoopIndex + step) % noLoopPoints.length;
        const p = noLoopPoints[idx];

        const candidateLeft = clamp(
          Math.round(padding + (maxLeft - padding) * p.x),
          padding,
          maxLeft
        );
        const candidateTop = clamp(
          Math.round(padding + (maxTop - padding) * p.y),
          padding,
          maxTop
        );

        const candidate = {
          left: candidateLeft,
          top: candidateTop,
          right: candidateLeft + btnRect.width,
          bottom: candidateTop + btnRect.height,
        };

        if (rectsIntersect(candidate, forbidden)) {
          continue;
        }

        if (!fallbackNonOverlap) fallbackNonOverlap = { left: candidateLeft, top: candidateTop, nextIdx: idx };

        if (!lastNoPos) {
          chosen = { left: candidateLeft, top: candidateTop, nextIdx: idx };
          break;
        }

        const dx = candidateLeft - lastNoPos.left;
        const dy = candidateTop - lastNoPos.top;
        const distSq = (dx * dx) + (dy * dy);
        if (distSq >= minMoveSq) {
          chosen = { left: candidateLeft, top: candidateTop, nextIdx: idx };
          break;
        }
      }

      const picked = chosen || fallbackNonOverlap;

      // If everything overlaps (very small screens), still advance the loop index and pick a safe clamped spot.
      let left = padding;
      let top = padding;

      if (picked) {
        left = picked.left;
        top = picked.top;
        noLoopIndex = (picked.nextIdx + 1) % noLoopPoints.length;
      } else {
        noLoopIndex = (noLoopIndex + 1) % noLoopPoints.length;
      }

      noBtn.style.left = `${left}px`;
      noBtn.style.top = `${top}px`;
      lastNoPos = { left, top };

      if (status) {
        const lines = [
          'Nope.',
          'Quasi…',
          'Non oggi!',
          'Ci riproviamo?',
          'Sicura/o di voler premere “No”?',
        ];
        const msg = attempts < 2 ? 'Prova a prenderlo.' : lines[attempts % lines.length];
        status.textContent = msg;
      }
    }

    requestAnimationFrame(placeNoButtonRandomly);

    const flee = (e) => {
      e.preventDefault();
      placeNoButtonRandomly();
    };

    noBtn.addEventListener('pointerenter', flee);
    noBtn.addEventListener('pointerdown', flee);
    noBtn.addEventListener('click', flee);
    noBtn.addEventListener('focus', () => placeNoButtonRandomly());

    window.addEventListener('resize', () => {
      if (noBtn.classList.contains('is-fleeing')) placeNoButtonRandomly();
    });

    yesBtn.addEventListener('click', () => {
      writeState({ accepted: true, name: name || readState().name || '' });
      const nextUrl = setQueryParam('celebrate.html', 'name', name);
      window.location.href = nextUrl;
    });
  }

  function initCelebratePage() {
    initDecorations();

    const title = document.getElementById('celebrateYesTitle');
    const proceedBtn = document.getElementById('proceedBtn');
    const name = getNameFromQueryOrState();

    if (name && title) {
      title.innerHTML = `Evvaiiii!`;
    }

    if (proceedBtn) {
      proceedBtn.addEventListener('click', () => {
        writeState({ accepted: true, name: name || readState().name || '' });
        const nextUrl = setQueryParam('date.html', 'name', name);
        window.location.href = nextUrl;
      });
    }
  }

  function initDatePage() {
    initDecorations();

    const form = document.getElementById('dateForm');
    const title = document.getElementById('celebrateTitle');
    if (!form) return;

    const FIXED_DAY = '2026-02-14';
    const FIXED_TIME = '19:00';

    const name = getNameFromQueryOrState();
    if (name && title) {
      title.innerHTML = `Perfetto, <span class="accent">${escapeHtml(name)}</span>.`;
    }

    const state = readState();
    if (form.elements.day) {
      form.elements.day.value = FIXED_DAY;
      form.elements.day.min = FIXED_DAY;
      form.elements.day.max = FIXED_DAY;
    }
    if (form.elements.time) {
      form.elements.time.value = FIXED_TIME;
      form.elements.time.min = FIXED_TIME;
      form.elements.time.max = FIXED_TIME;
    }
    if (state.mood) form.elements.mood.value = state.mood;
    if (state.note) form.elements.note.value = state.note;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const payload = {
        name: name || String(data.get('name') || state.name || ''),
        day: FIXED_DAY,
        time: FIXED_TIME,
        mood: String(data.get('mood') || ''),
        note: String(data.get('note') || '').slice(0, 200),
      };

      writeState(payload);

      const params = new URLSearchParams();
      if (payload.name) params.set('name', payload.name);
      if (payload.day) params.set('day', payload.day);
      if (payload.time) params.set('time', payload.time);
      if (payload.mood) params.set('mood', payload.mood);
      if (payload.note) params.set('note', payload.note);

      window.location.href = `final.html?${params.toString()}`;
    });
  }

  function initFinalPage() {
    initDecorations();

    const summary = document.getElementById('summary');
    const copyBtn = document.getElementById('copyBtn');
    const title = document.getElementById('finalTitle');
    if (!summary) return;

    const params = new URLSearchParams(window.location.search);
    const state = readState();

    const name = (params.get('name') || state.name || '').trim();
    const day = params.get('day') || state.day || '';
    const time = params.get('time') || state.time || '';
    const mood = params.get('mood') || state.mood || '';
    const note = params.get('note') || state.note || '';

    if (name && title) {
      title.innerHTML = `È tutto pronto, <span class="accent">${escapeHtml(name)}</span>.`;
    }

    const rows = [
      ['Persona', name || '—'],
      ['Giorno', day ? formatDate(day) : '—'],
      ['Ora', time || '—'],
      ['Stile', mood || '—'],
      ['Nota', note || '—'],
    ];

    summary.innerHTML = rows
      .map(([k, v]) => {
        return `<div class="row"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`;
      })
      .join('');

    const textToCopy = `Appuntamento di San Valentino\n- Persona: ${name || '—'}\n- Giorno: ${day ? formatDate(day) : '—'}\n- Ora: ${time || '—'}\n- Stile: ${mood || '—'}\n- Nota: ${note || '—'}`;

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(textToCopy);
          copyBtn.textContent = 'Copiato!';
          setTimeout(() => (copyBtn.textContent = 'Copia testo'), 1200);
        } catch {
          window.prompt('Copia questo testo:', textToCopy);
        }
      });
    }

    writeState({ name, day, time, mood, note, accepted: true });
  }

  window.ValentineApp = {
    initDecorations,
    initStartPage,
    initQuestionPage,
    initCelebratePage,
    initDatePage,
    initFinalPage,
  };
})();
