// Заглушка: не отправляем поиск, просто логируем
document.querySelectorAll('.search-wide').forEach(form => {
    form.addEventListener('submit', e => {
        e.preventDefault();
        const q = form.querySelector('input[name="q"]')?.value || "";
        console.log("[search placeholder] q=", q);
        // здесь потом подставишь реальный обработчик/переход
    });
});


// ===== CART DRAWER =====
(function () {
    const drawer = document.querySelector('.cart-drawer');
    if (!drawer) return;

    const panel = drawer.querySelector('.cart-drawer__panel');
    const openers = document.querySelectorAll('[data-cart-open]');
    const closers = drawer.querySelectorAll('[data-cart-close]');

    function openDrawer() {
        drawer.classList.add('is-open');
        document.body.classList.add('is-cart-open');
        drawer.setAttribute('aria-hidden', 'false');
        const closeBtn = drawer.querySelector('.cart-drawer__close');
        closeBtn && closeBtn.focus();
    }

    function closeDrawer() {
        drawer.classList.remove('is-open');
        document.body.classList.remove('is-cart-open');
        drawer.setAttribute('aria-hidden', 'true');
    }

    openers.forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            openDrawer();
        });
    });

    closers.forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            closeDrawer();
        });
    });

    drawer.addEventListener('click', (e) => {
        if (!panel.contains(e.target)) closeDrawer();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && drawer.classList.contains('is-open')) {
            closeDrawer();
        }
    });
})();

// Левое меню: открытие flyout по клику на тач-устройствах
(function () {
    const isTouch = window.matchMedia('(hover: none)').matches;
    if (!isTouch) return;

    document.querySelectorAll('.menu-li.has-flyout > .menu-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const li = link.closest('.menu-li');
            const opened = li.classList.toggle('open');
            if (opened) {
                document.querySelectorAll('.menu-li.has-flyout.open').forEach(x => {
                    if (x !== li) x.classList.remove('open');
                });
            }
        });
    });
})();

// ===== LEFT MENU ACCORDION (plus button) =====
(function () {
    const root = document.querySelector('.menu-card');
    if (!root) return;

    // Инициализация ARIA/hidden для всех уровней
    root.querySelectorAll('.has-accordion').forEach(li => {
        const btn = li.querySelector(':scope > .menu-row > .menu-toggle');
        const submenu = li.querySelector(':scope > .submenu');
        const isOpen = li.classList.contains('open');
        if (btn) btn.setAttribute('aria-expanded', String(isOpen));
        if (submenu) submenu.hidden = !isOpen;
    });

    // Делегирование кликов по плюсикам
    root.addEventListener('click', (e) => {
        const btn = e.target.closest('.menu-toggle');
        if (!btn || !root.contains(btn)) return;

        e.preventDefault();
        const li = btn.closest('.has-accordion');
        if (!li) return;

        const submenu = li.querySelector(':scope > .submenu');
        const isOpen = li.classList.toggle('open');
        btn.setAttribute('aria-expanded', String(isOpen));
        if (submenu) submenu.hidden = !isOpen;
    });

    // Клавиатура: Enter/Space на .menu-toggle
    root.addEventListener('keydown', (e) => {
        const btn = e.target.closest('.menu-toggle');
        if (!btn) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            btn.click();
        }
    });
})();

// ===== BANNER SLIDER (устойчиво к file:// и без manifest) =====
(function () {
    const root = document.getElementById('bannerSlider');
    if (!root) return;

    const path = root.dataset.path || 'assets/banners/';
    const AUTOPLAY_MS = 5000;

    // 1) Сначала читаем fallback-<img>, пока ВООБЩЕ НИЧЕГО не добавляли внутрь root
    const fallbackImgs = Array.from(root.querySelectorAll(':scope > img[src]'))
        .map(img => img.getAttribute('src'));

    // 2) Сбор UI
    const viewport = document.createElement('div');
    viewport.className = 'rb-slider__viewport';
    const track = document.createElement('div');
    track.className = 'rb-slider__track';
    viewport.appendChild(track);
    root.appendChild(viewport);

    const dots = document.createElement('div');
    dots.className = 'rb-dots';
    root.appendChild(dots);

    // helpers
    const createSlide = (src, alt = '') => {
        const s = document.createElement('div');
        s.className = 'rb-slide';
        const img = document.createElement('img');
        img.src = src; img.alt = alt;
        s.appendChild(img);
        return s;
    };
    const setActiveDot = i => {
        dots.querySelectorAll('.rb-dot').forEach((d, idx) => d.classList.toggle('is-active', idx === i));
    };

    async function getSrcList() {
        // 0) inline <script type="application/json" id="bannerManifest">…</script>
        const inline = document.getElementById('bannerManifest');
        if (inline) {
            try {
                const arr = JSON.parse(inline.textContent);
                return (Array.isArray(arr) ? arr : []).map(n =>
                    /^https?:/i.test(n) ? n : (path.endsWith('/') ? path : (path + '/')) + n
                );
            } catch (e) {/* ignore */ }
        }

        // 1) fallback-<img> внутри #bannerSlider
        if (fallbackImgs.length) return fallbackImgs;

        // 2) внешний assets/banners/manifest.json (сработает на http/https)
        try {
            const r = await fetch((path.endsWith('/') ? path : (path + '/')) + 'manifest.json', { cache: 'no-store' });
            if (r.ok) {
                const json = await r.json();
                let arr = Array.isArray(json) ? json.slice()
                    : (Array.isArray(json.files) ? json.files.slice() : []);
                const order = (json.order || json.sort || '').toString().toLowerCase();
                if (['oldest-first', 'asc', 'oldest'].includes(order)) arr.reverse();
                else if (order === 'filename-desc') arr.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
                return arr.map(n => /^https?:/i.test(n) ? n : (path.endsWith('/') ? path : (path + '/')) + n);
            }
        } catch (e) { /* ignore */ }

        return [];
    }

    // Построение
    let idx = 0, count = 0, allow = true, timer = null;

    function translateTo(i, animate = true) {
        if (!animate) {
            track.style.transition = 'none';
            track.style.transform = `translateX(-${i * 100}%)`;
            void track.offsetHeight; // reflow
            track.style.transition = '';
        } else {
            track.style.transform = `translateX(-${i * 100}%)`;
        }
    }

    function stepForward() {
        if (!allow) return;
        allow = false;
        idx++;
        translateTo(idx, true);
        const onEnd = () => {
            track.removeEventListener('transitionend', onEnd);
            if (idx === count) { // перескок с клона на начало
                idx = 0;
                translateTo(0, false);
            }
            setActiveDot(idx);
            allow = true;
        };
        track.addEventListener('transitionend', onEnd, { once: true });
    }

    function stepBackward() {
        if (!allow) return;
        allow = false;

        if (idx === 0) {
            translateTo(count, false);
            idx = count - 1;
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    translateTo(idx, true);
                });
            });
        } else {
            idx--;
            translateTo(idx, true);
        }

        const onEnd = () => {
            track.removeEventListener('transitionend', onEnd);
            setActiveDot(idx);
            allow = true;
        };
        track.addEventListener('transitionend', onEnd, { once: true });
    }

    function jumpSmart(target) {
        if (count < 2 || target === idx) return;

        const forward = target >= idx ? (target - idx) : (count - idx + target);
        const backward = count - forward;
        let steps = (backward < forward) ? backward : forward;
        const stepFn = (backward < forward) ? stepBackward : stepForward;

        const run = () => {
            stepFn();
            if (--steps <= 0) { restartAutoplay(); return; }
            const once = () => { track.removeEventListener('transitionend', once); run(); };
            track.addEventListener('transitionend', once, { once: true });
        };
        run();
    }

    function startAutoplay() { stopAutoplay(); timer = setInterval(stepForward, AUTOPLAY_MS); }
    function stopAutoplay() { if (timer) clearInterval(timer); timer = null; }
    function restartAutoplay() { stopAutoplay(); startAutoplay(); }

    (async function () {
        const srcs = await getSrcList();

        // убираем fallback img из DOM (если были)
        root.querySelectorAll(':scope > img').forEach(n => n.remove());

        if (!srcs.length) {
            track.appendChild(createSlide('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='));
            translateTo(0, false);
            return;
        }

        // наполняем трек
        srcs.forEach(src => track.appendChild(createSlide(src)));
        // клон первого для бесшовной прокрутки
        track.appendChild(createSlide(srcs[0]));
        count = srcs.length;

        // точки
        srcs.forEach((_, i) => {
            const d = document.createElement('button');
            d.type = 'button'; d.className = 'rb-dot';
            d.setAttribute('aria-label', `Перейти к баннеру ${i + 1}`);
            dots.appendChild(d);
        });

        // начальные состояния
        translateTo(0, false);
        setActiveDot(0);

        // события
        dots.addEventListener('click', e => {
            const btn = e.target.closest('.rb-dot');
            if (!btn) return;
            const all = [...dots.querySelectorAll('.rb-dot')];
            const target = all.indexOf(btn);
            if (target !== -1) jumpSmart(target);
        });

        root.addEventListener('mouseenter', stopAutoplay);
        root.addEventListener('mouseleave', startAutoplay);

        // стрелки
        addArrows();

        startAutoplay();
    })();

    function addArrows() {
        const nav = document.createElement('div');
        nav.className = 'rb-nav';
        const prev = document.createElement('button');
        prev.className = 'rb-nav__btn rb-nav__btn--prev';
        prev.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        const next = document.createElement('button');
        next.className = 'rb-nav__btn rb-nav__btn--next';
        next.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        nav.append(prev, next);
        viewport.appendChild(nav);

        prev.addEventListener('click', () => {
            stepBackward();
            restartAutoplay();
        });
        next.addEventListener('click', () => {
            stepForward();
            restartAutoplay();
        });
    }
})();

document.addEventListener("DOMContentLoaded", () => {
    // ---------- Автоподсветка активной страницы ----------
    const isRealLink = (href) =>
        href && !href.startsWith("#") && !/^javascript:/i.test(href);

    const cleanPath = (p) => p.replace(/\/+$/, ""); // убираем хвостовые /
    const basename = (p) => {
        const clean = cleanPath(p);
        const base = clean.split("/").pop();
        return (base && base.length) ? base.toLowerCase() : "index.html";
    };

    const currentPath = cleanPath(location.pathname || "/");
    const currentBase = basename(currentPath);

    const setActiveOne = (links) => {
        // Снять активность у всех
        links.forEach(a => a.classList.remove("active"));

        // Сформировать кандидатов (только «настоящие» ссылки)
        const items = [...links]
            .filter(a => isRealLink(a.getAttribute("href")))
            .map(a => {
                const url = new URL(a.getAttribute("href"), document.baseURI);
                return {
                    a,
                    path: cleanPath(url.pathname || "/"),
                    base: basename(url.pathname || "/")
                };
            });

        // 1) Пытаемся найти ИДЕАЛЬНОЕ совпадение по path
        let match = items.find(it => it.path === currentPath);
        // 2) Если не нашли — совпадение по basename (about.html, index.html)
        if (!match) match = items.find(it => it.base === currentBase);

        if (match) match.a.classList.add("active");
    };

    // Верхняя синяя навигация
    setActiveOne(document.querySelectorAll(".main-nav a[href]"));

    // Левое меню
    setActiveOne(document.querySelectorAll(".menu-card .menu-link[href]"));

    // Плавающая кнопка Viber (добавляем, если её нет в разметке)
    if (!document.querySelector(".float-viber")) {
        const langAttr = (document.documentElement.getAttribute("lang") || "").toLowerCase();
        const inUA = /\/ua\//i.test(location.pathname) || langAttr.startsWith("uk");
        const inRU = /\/ru\//i.test(location.pathname) || langAttr.startsWith("ru");

        // если страница в /ru/ или /ua/ — поднимаемся на уровень выше
        const prefix = (inUA || inRU) ? "../" : "";

        // локализованный лейбл/тултип
        const label = inUA ? "Відкрити чат у Viber" : "Открыть чат в Viber";

        const viber = document.createElement("a");
        viber.className = "float-viber";
        viber.href = "viber://chat?number=%2B380930728887";
        viber.setAttribute("aria-label", label);
        viber.title = label;

        const idleImg = document.createElement("img");
        idleImg.className = "vb vb--idle";
        idleImg.src = prefix + "assets/icons/viber_without_cursor.png";
        idleImg.alt = "Viber";
        idleImg.width = 44; idleImg.height = 44;

        const hoverImg = document.createElement("img");
        hoverImg.className = "vb vb--hover";
        hoverImg.src = prefix + "assets/icons/viber_under_cursor.png";
        hoverImg.alt = "";
        hoverImg.setAttribute("aria-hidden", "true");
        hoverImg.width = 44; hoverImg.height = 44;

        viber.append(idleImg, hoverImg);
        document.body.appendChild(viber);
    }
});

// ===== MODAL "График работы" =====
(function () {
    const trigger = document.querySelector('.worktime a'); // ссылка "График работы"
    const modal = document.querySelector('.hours-modal');
    if (!trigger || !modal) return;

    const panel = modal.querySelector('.hours-modal__panel');
    const closers = modal.querySelectorAll('[data-hours-close]');
    let lastFocus = null;

    function openModal() {
        lastFocus = document.activeElement;
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('is-hours-open');
        // фокус на кнопку закрытия
        const btn = modal.querySelector('.hours-modal__close');
        btn && btn.focus();
    }

    function closeModal() {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('is-hours-open');
        // вернуть фокус инициатору
        lastFocus && lastFocus.focus();
    }

    trigger.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
    });

    closers.forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            closeModal();
        });
    });

    // Закрытие по клику на подложку или вне панели
    modal.addEventListener('click', (e) => {
        if (!panel.contains(e.target)) closeModal();
    });

    // Esc закрывает
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
    });
})();

// Делает активный язык серым и некликабельным по html[lang]
(() => {
    const sw = document.querySelector('.lang-switch');
    if (!sw) return;

    const lang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    const links = [...sw.querySelectorAll('a')];

    const ua = links.find(a => a.textContent.trim().toUpperCase() === 'UA');
    const ru = links.find(a => a.textContent.trim().toUpperCase() === 'RU');

    const markCurrent = (el) => {
        if (!el) return;
        el.setAttribute('aria-current', 'page'); // триггерит стили выше
        el.setAttribute('tabindex', '-1');       // убираем из таб-навигации
    };

    if (lang === 'ru') markCurrent(ru);
    else if (lang.startsWith('uk') || lang === 'ua') markCurrent(ua);
    else markCurrent(ru); // дефолт — RU
})();

// ===== Страница «Отзывы»: локаль, хранение, пагинация, форма =====
document.addEventListener('DOMContentLoaded', () => {
    const _lang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    const IS_RU = _lang.startsWith('ru');

    // 🔤 Карта оценок (обе стороны)
    const GRADE_MAP = IS_RU
        ? { 'Відмінно': 'Отлично', 'Добре': 'Хорошо', 'Нейтрально': 'Нейтрально', 'Погано': 'Плохо', 'Дуже погано': 'Очень плохо' }
        : { 'Отлично': 'Відмінно', 'Хорошо': 'Добре', 'Нейтрально': 'Нейтрально', 'Плохо': 'Погано', 'Очень плохо': 'Дуже погано' };

    const RATING_TO_GRADE = (isRu) => isRu
        ? { 5: 'Отлично', 4: 'Хорошо', 3: 'Нейтрально', 2: 'Плохо', 1: 'Очень плохо' }
        : { 5: 'Відмінно', 4: 'Добре', 3: 'Нейтрально', 2: 'Погано', 1: 'Дуже погано' };

    const tGrade = (txt) => GRADE_MAP[txt] || txt;
    const NEXT_LABEL = IS_RU ? 'Следующая страница' : 'Наступна сторінка';
    const PREV_LABEL = IS_RU ? 'Предыдущая страница' : 'Попередня сторінка';
    const OF_FIVE = IS_RU ? 'из 5' : 'з 5';

    // ====== localStorage helpers ======
    const LS_KEY = 'rb_reviews_v1';
    const loadSavedItems = () => {
        try {
            const s = localStorage.getItem(LS_KEY);
            if (!s) return null;
            const data = JSON.parse(s);
            return Array.isArray(data?.items) ? data.items : null;
        } catch { return null; }
    };
    const saveItems = (items) => {
        try { localStorage.setItem(LS_KEY, JSON.stringify({ items })); } catch { }
    };

    // ====== дефолтные 5 штук ======
    const DEFAULT_ITEMS = [
        { author: "Володимир С.", date: "05.10.2025", rating: 5, gradeText: "Відмінно", comment: "Заказ из нескольких позиций был быстро собран и аккуратно упакован. Все товары отличного качества. Мне всё понравилось. Спасибо! Собираюсь заказывать тут и в дальнейшем" },
        { author: "Павло С.", date: "02.10.2025", rating: 4, gradeText: "Добре", comment: "Всё как обычно на высоте" },
        { author: "Александр Ш.", date: "28.09.2025", rating: 5, gradeText: "Відмінно", comment: "Спасибо все работает !!!" },
        { author: "Сергій Т.", date: "17.09.2025", rating: 5, gradeText: "Відмінно", comment: "Вау" },
        { author: "Андрій К.", date: "14.09.2025", rating: 4, gradeText: "Добре", comment: "Зручний магазин, швидка відправка." }
    ];

    // ====== состояние и константы пагинации ======
    const PER_PAGE = 5;
    let items = loadSavedItems() || DEFAULT_ITEMS.slice();

    function updateTopbarReviewsCount() {
        const el = document.querySelector('.b-head-control-panel__container .reviews .link');
        if (!el) return;

        // читаем localStorage
        let n = 0;
        try {
            const raw = localStorage.getItem('rb_reviews_v1');
            if (raw) {
                const parsed = JSON.parse(raw);
                n = Array.isArray(parsed?.items) ? parsed.items.length : 0;
            }
        } catch { }

        // язык и склонение
        const lang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
        const plural = (n, one, few, many) => {
            const n10 = n % 10, n100 = n % 100;
            return (n10 === 1 && n100 !== 11) ? one
                : (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) ? few
                    : many;
        };

        const txt = lang.startsWith('ru')
            ? `${n} ${plural(n, 'отзыв', 'отзыва', 'отзывов')}`
            : `${n} ${plural(n, 'відгук', 'відгуки', 'відгуків')}`;

        el.textContent = txt;

        // показать (убираем «скрыто»)
        el.style.visibility = 'visible';      // если используешь visibility
        el.classList.add('is-ready');         // если используешь вариант с opacity
    }

    updateTopbarReviewsCount();

    // читаем страницу из hash (#page=2) или ставим 1
    const readPageFromHash = () => {
        const m = location.hash.match(/page=(\d+)/i);
        const p = m ? parseInt(m[1], 10) : 1;
        return Number.isFinite(p) && p > 0 ? p : 1;
    };
    const setPageToHash = (p) => {
        const newHash = `#page=${p}`;
        if (location.hash !== newHash) history.replaceState(null, '', newHash);
    };

    let currentPage = clampPage(readPageFromHash());

    function clampPage(p) {
        const total = calcTotalPages();
        return Math.min(Math.max(1, p), total || 1);
    }
    function calcTotalPages() {
        return Math.max(1, Math.ceil(items.length / 5));
    }
    function pageSlice(page) {
        const start = (page - 1) * 5;
        return items.slice(start, start + 5);
    }

    // ====== иконка звезды ======
    const Star = (filled) => `
    <svg viewBox="0 0 24 24" ${filled ? "" : 'class="is-empty"'} aria-hidden="true">
      <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21z" fill="currentColor" />
    </svg>`;

    // ====== рендер списка отзывов ======
    function renderReviewsList(list) {
        const wrap = document.getElementById('revList');
        if (!wrap) return;
        wrap.innerHTML = '';
        list.forEach(r => {
            const stars = Array.from({ length: 5 }, (_, i) => Star(i < r.rating)).join('');
            wrap.insertAdjacentHTML('beforeend', `
        <article class="rev-card">
          <header class="rev-head">
            <div class="rev-author">${r.author}</div>
            <div class="rev-date">${r.date}</div>
            <div class="rev-stars" aria-label="Рейтинг: ${r.rating} ${OF_FIVE}">${stars}</div>
            <div class="rev-grade">${tGrade(r.gradeText)}</div>
          </header>
          <div class="rev-text">${r.comment || ""}</div>
        </article>
      `);
        });
    }

    // ====== рендер пагинатора ======
    function renderPager() {
        const pager = document.getElementById('revPager');
        if (!pager) return;
        const total = calcTotalPages();
        const cur = currentPage;

        let html = '';
        if (total > 1) {
            html += `<a href="#" data-page="${cur - 1}" aria-label="${PREV_LABEL}" ${cur === 1 ? 'aria-disabled="true" style="pointer-events:none;opacity:.4;"' : ''}>←</a>`;
            html += pageLink(1, cur);
            if (total >= 2) html += pageLink(2, cur);
            if (total > 3) html += `<span>…</span>`;
            if (total >= 3) html += pageLink(total, cur);
            html += `<a href="#" data-page="${cur + 1}" aria-label="${NEXT_LABEL}" ${cur === total ? 'aria-disabled="true" style="pointer-events:none;opacity:.4;"' : ''}>→</a>`;
        }
        pager.innerHTML = html;

        function pageLink(i, cur) {
            if (i === cur) return `<a href="#" data-page="${i}" aria-current="page"><strong>${i}</strong></a>`;
            return `<a href="#" data-page="${i}">${i}</a>`;
        }
    }

    function renderCurrent() {
        currentPage = clampPage(currentPage);
        setPageToHash(currentPage);
        renderReviewsList(pageSlice(currentPage));
        renderPager();
    }

    document.getElementById('revPager')?.addEventListener('click', (e) => {
        const a = e.target.closest('a[data-page]');
        if (!a) return;
        e.preventDefault();
        const p = parseInt(a.dataset.page, 10);
        if (!Number.isFinite(p)) return;
        currentPage = clampPage(p);
        renderCurrent();
    });

    window.addEventListener('hashchange', () => {
        currentPage = clampPage(readPageFromHash());
        renderCurrent();
    });

    // первоначальный рендер
    renderCurrent();

    // ====== форма ======
    const addBtn = document.querySelector('.btn-add-review');
    const form = document.getElementById('reviewForm');
    const inpName = document.getElementById('rfName');
    const radios = [...document.querySelectorAll('input[name="rating"]')];
    const taComment = document.getElementById('rfComment');
    const cntEl = document.getElementById('rfCnt');
    const btnCancel = document.getElementById('rfCancel');

    function showForm() {
        form.hidden = false;
        addBtn?.closest('.reviews-actions')?.classList.add('is-hidden');
        inpName?.focus();
    }
    function hideForm() {
        form.hidden = true;
        addBtn?.closest('.reviews-actions')?.classList.remove('is-hidden');
        form.reset();
        updateCounter();
        clearErrors();
    }
    function clearErrors() {
        const e1 = document.getElementById('errName');
        const e2 = document.getElementById('errRating');
        if (e1) e1.textContent = '';
        if (e2) e2.textContent = '';
    }
    function updateCounter() {
        if (!taComment || !cntEl) return;
        cntEl.textContent = taComment.value.length.toString();
    }

    addBtn?.addEventListener('click', (e) => { e.preventDefault(); showForm(); });
    btnCancel?.addEventListener('click', (e) => { e.preventDefault(); hideForm(); });
    taComment?.addEventListener('input', updateCounter);
    updateCounter();

    form?.addEventListener('submit', (e) => {
        e.preventDefault();
        clearErrors();

        const name = (inpName?.value || '').trim();
        const rEl = radios.find(r => r.checked);
        const rate = rEl ? parseInt(rEl.value, 10) : NaN;
        const text = (taComment?.value || '').trim();

        let ok = true;
        if (!name) { ok = false; document.getElementById('errName').textContent = IS_RU ? 'Укажите имя' : "Вкажіть ім'я"; }
        if (!rate || rate < 1 || rate > 5) { ok = false; document.getElementById('errRating').textContent = IS_RU ? 'Выберите оценку' : 'Оберіть оцінку'; }
        if (!ok) return;

        // дата DD.MM.YYYY
        const d = new Date();
        const DD = String(d.getDate()).padStart(2, '0');
        const MM = String(d.getMonth() + 1).padStart(2, '0');
        const YYYY = d.getFullYear();
        const dateStr = `${DD}.${MM}.${YYYY}`;

        const gradeText = (IS_RU
            ? { 5: 'Отлично', 4: 'Хорошо', 3: 'Нейтрально', 2: 'Плохо', 1: 'Очень плохо' }
            : { 5: 'Відмінно', 4: 'Добре', 3: 'Нейтрально', 2: 'Погано', 1: 'Дуже погано' }
        )[rate];

        const newItem = {
            id: Date.now(),
            author: name,
            date: dateStr,
            rating: rate,
            gradeText,
            comment: text
        };

        items.unshift(newItem);
        saveItems(items);

        currentPage = 1;
        renderCurrent();
        updateTopbarReviewsCount();

        hideForm();
    });
});

// === Автообновление боковых фонов (единый, без дублей) ===
(() => {
    const root = document.documentElement;

    function refreshSideArt() {
        const header = document.querySelector('.site-header');
        const footer = document.querySelector('.site-footer');
        if (!header || !footer) return;

        // Стартуем ОТ НИЗА синей шапки до ВЕРХА подвала
        const headerBottom = header.getBoundingClientRect().bottom + window.scrollY;
        const footerTop = footer.getBoundingClientRect().top + window.scrollY;
        const sideTop = Math.max(0, Math.round(headerBottom));
        const sideH = Math.max(0, Math.round(footerTop - headerBottom));

        root.style.setProperty('--side-top', sideTop + 'px');
        root.style.setProperty('--side-h', sideH + 'px');
    }

    // «мягкий» дебаунс
    let rafScheduled = false;
    const schedule = () => {
        if (rafScheduled) return;
        rafScheduled = true;
        requestAnimationFrame(() => { rafScheduled = false; refreshSideArt(); });
    };

    function initSideArtAutoUpdate() {
        refreshSideArt();
        window.addEventListener('load', refreshSideArt);
        window.addEventListener('resize', schedule);

        // Следим за элементами, от которых зависит высота/позиция
        const ro = new ResizeObserver(schedule);
        ['.home-right', '#catalog', '#catalogGrid', '.groups', '.site-footer', '.site-header', '[data-side-watch]']
            .forEach(sel => { const el = document.querySelector(sel); if (el) ro.observe(el); });

        // Изменения DOM внутри основного столбца — карточки, пагинация и т.п.
        const moTarget = document.querySelector('[data-side-watch]') ||
            document.querySelector('#catalogGrid') ||
            document.querySelector('.home-right') ||
            document.body;

        new MutationObserver(schedule).observe(moTarget, { childList: true, subtree: true });

        // Догрузка изображений
        document.addEventListener('load', (e) => {
            if (e.target && e.target.tagName === 'IMG') schedule();
        }, true);

        // экспорт на всякий случай (можно дёрнуть вручную)
        window.rbRefreshSideArt = refreshSideArt;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSideArtAutoUpdate);
    } else {
        initSideArtAutoUpdate();
    }
})();

// ===== SEED: КАТАЛОГ ТОВАРОВ =====
(() => {
    const langAttr = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    const IS_UA = langAttr.startsWith('uk') || langAttr === 'ua' || /\/ua\//i.test(location.pathname);
    const IS_RU = langAttr.startsWith('ru') || /\/ru\//i.test(location.pathname);
    const KEY_UA = 'rb_catalog_v1_ua', KEY_RU = 'rb_catalog_v1_ru';

    // Генератор случайного склада (1..20 шт), если товара нет в наличии - 0
    const rndStock = (inStock) => inStock ? Math.floor(Math.random() * 20) + 1 : 0;
    const mockImages = (count = 4) => Array(count).fill('');

    let id = 1700000000; const N = (p) => ({id: ++id, ...p});

    const BI_ITEMS = [
    // ===== solder
    N({sku:'00001', title_ua:'Паяльна станція XY-1000', title_ru:'Паяльная станция XY-1000', price:2450, in_stock:true, category:'solder', images: mockImages(4), on_index: true }),
    N({sku:'00002', title_ua:'Паяльник 60Вт з регулюванням', title_ru:'Паяльник 60Вт с регулировкой', price:350, in_stock:false, category:'solder', images: mockImages(4), on_index: true }),
    N({sku:'00003', title_ua:'Набір жал T12 (5 шт.)', title_ru:'Набор жал T12 (5 шт.)', price:390, in_stock:true, category:'solder', images: mockImages(4), on_index: true }),

    // ===== repair
    N({sku:'00004', title_ua:'Набір інструментів для ремонту 25в1', title_ru:'Набор инструментов для ремонта 25в1', price:520, in_stock:true, category:'repair', images: mockImages(4), on_index: true }),
    N({sku:'00005', title_ua:'Антистатичний браслет', title_ru:'Антистатический браслет', price:60, in_stock:true, category:'repair', images: mockImages(4), on_index: false }),
    N({sku:'00006', title_ua:'Пінцет антистатичний ESD-15', title_ru:'Пинцет антистатический ESD-15', price:90, in_stock:true, category:'repair', images: mockImages(4), on_index: true }),

    // ===== consum
    N({sku:'00007', title_ua:'Припій Sn60Pb40 0.8мм (100г)', title_ru:'Припой Sn60Pb40 0.8мм (100г)', price:190, in_stock:true, category:'consum', images: mockImages(4), on_index: true }),
    N({sku:'UA-CNSM-002', title_ua:'Флюс паяльний F-223', title_ru:'Флюс паяльный F-223', price:95, in_stock:true, category:'consum', images: mockImages(4), on_index: true }),

    // ===== osc
    N({sku:'00009', title_ua:'Осцилограф портативний HDS272', title_ru:'Осциллограф портативный HDS272', price:6990, in_stock:true, category:'osc', images: mockImages(4), on_index: true }),
    N({sku:'00010', title_ua:'USB осцилограф 20MHz', title_ru:'USB осциллограф 20 МГц', price:3650, in_stock:true, category:'osc', images: mockImages(4), on_index: false }),

    // ===== prog
    N({sku:'00011', title_ua:'Програматор CH341A', title_ru:'Программатор CH341A', price:360, in_stock:false, category:'prog', images: mockImages(4), on_index: true }),
    N({sku:'00012', title_ua:'USBasp програматор AVR', title_ru:'USBasp программатор AVR', price:270, in_stock:true, category:'prog', images: mockImages(4), on_index: false }),

    // ===== meas
    N({sku:'00013', title_ua:'Мультиметр DT-9205A', title_ru:'Мультиметр DT-9205A', price:780, in_stock:true, category:'meas', images: mockImages(4), on_index: true }),
    N({sku:'00014', title_ua:'Щупи для мультиметра 20A', title_ru:'Щупы для мультиметра 20A', price:120, in_stock:true, category:'meas', images: mockImages(4), on_index: true }),
    N({sku:'00015', title_ua:'Тестер LCR-TC1', title_ru:'Тестер LCR-TC1', price:950, in_stock:true, category:'meas', images: mockImages(4), on_index: true }),

    // ===== rmods
    N({sku:'00016', title_ua:'DC-DC понижуючий модуль LM2596', title_ru:'DC-DC понижающий модуль LM2596', price:85, in_stock:true, category:'rmods', subcategory:'dcconv', images: mockImages(4), on_index: true }),
    N({sku:'00017', title_ua:'DC-DC підвищуючий модуль XL6009', title_ru:'DC-DC повышающий модуль XL6009', price:120, in_stock:true, category:'rmods', subcategory:'dcconv', images: mockImages(4), on_index: true }),
    N({sku:'00018', title_ua:'DC-DC SEPIC модуль', title_ru:'DC-DC SEPIC модуль', price:210, in_stock:true, category:'rmods', subcategory:'dcconv', images: mockImages(4), on_index: false }),

    // ===== rparts
    N({sku:'00019', title_ua:'Набір резисторів 1/4W (600шт)', title_ru:'Набор резисторов 1/4W (600 шт.)', price:210, in_stock:true, category:'rparts', subcategory:'resistors', images: mockImages(10), on_index: false }),
    N({sku:'00020', title_ua:'Набір конденсаторів електролітичних (120шт)', title_ru:'Набор электролитических конденсаторов (120 шт.)', price:230, in_stock:true, category:'rparts', subcategory:'capacitors', images: mockImages(4), on_index: false }),
    N({sku:'00021', title_ua:'Світлодіод 5мм червоний (100шт)', title_ru:'Светодиод 5 мм красный (100 шт.)', price:95, in_stock:true, category:'rparts', subcategory:'leds', images: mockImages(4), on_index: true }),
    N({sku:'00022', title_ua:'Діод 1N4148 (100шт)', title_ru:'Диод 1N4148 (100 шт.)', price:80, in_stock:true, category:'rparts', subcategory:'diodes', images: mockImages(4), on_index: false }),
    N({sku:'00023', title_ua:'Транзистор 2N3904 (20шт)', title_ru:'Транзистор 2N3904 (20 шт.)', price:70, in_stock:true, category:'rparts', subcategory:'transistors', images: mockImages(4), on_index: false }),
    N({sku:'00024', title_ua:'ОП LM358 (10шт)', title_ru:'Операционный усилитель LM358 (10 шт.)', price:65, in_stock:true, category:'rparts', subcategory:'ics', images: mockImages(4), on_index: false }),

    // ===== cables
    N({sku:'00025', title_ua:'USB-кабель Type-C 1м', title_ru:'USB-кабель Type-C 1 м', price:110, in_stock:true, category:'cables', images: mockImages(4), on_index: true }),
    N({sku:'00026', title_ua:'Гніздо живлення 5.5×2.1мм', title_ru:'Гнездо питания 5.5×2.1 мм', price:25, in_stock:true, category:'cables', images: mockImages(4), on_index: false }),

    // ===== psu
    N({sku:'00027', title_ua:'Блок живлення 12В 5А', title_ru:'Блок питания 12В 5А', price:420, in_stock:true, category:'psu', images: mockImages(4), on_index: true }),
    N({sku:'00028', title_ua:'Адаптер живлення 9В 2А', title_ru:'Адаптер питания 9В 2А', price:260, in_stock:true, category:'psu', images: mockImages(4), on_index: false })
    ];

    const toLang = (arr, lang) => arr.map(it => ({
        id: it.id,
        sku: it.sku,
        title: lang === 'ru' ? (it.title_ru || it.title || '') : (it.title_ua || it.title || ''),
        price: it.price,
        in_stock: it.in_stock,
        // Добавляем случайное кол-во на складе
        qty_stock: rndStock(it.in_stock),
        category: it.category,
        subcategory: it.subcategory,
        images: (it.images && it.images.length) ? it.images : [it.image || ''],
        image: (it.images && it.images.length) ? it.images[0] : (it.image || ''),
        on_index: it.on_index,
        description: lang === 'ru'
            ? 'Полное описание товара, характеристики и комплектация уточняются. Пожалуйста, свяжитесь с менеджером.'
            : 'Повний опис товару, характеристики та комплектація уточнюються. Будь ласка, зв\'яжіться з менеджером.'
    }));

    // Принудительно перезаписываем, чтобы появилось поле qty_stock
    write(KEY_UA, toLang(BI_ITEMS, 'ua'));
    write(KEY_RU, toLang(BI_ITEMS, 'ru'));

    function write(k, items) { localStorage.setItem(k, JSON.stringify({ items })); }
})();

// === ИСТОРИЯ ПРОСМОТРОВ (Логика) ===
window.addToViewed = function(id) {
    if(!id) return;
    const KEY = 'rb_viewed_products';
    let viewed = [];
    try { viewed = JSON.parse(localStorage.getItem(KEY)) || []; } catch {}
    viewed = viewed.filter(v => v != id); // Удаляем дубли
    viewed.unshift(id); // Добавляем в начало
    if(viewed.length > 9) viewed = viewed.slice(0, 9);
    localStorage.setItem(KEY, JSON.stringify(viewed));
};

window.getViewedProducts = function() {
    try { return JSON.parse(localStorage.getItem('rb_viewed_products')) || []; } catch { return []; }
};

// === ГЛОБАЛЬНЫЙ ВИДЖЕТ: ВЫ ПРОСМАТРИВАЛИ ===
// Этот код автоматически найдет <div id="viewed-widget"> и нарисует в нем слайдер
document.addEventListener('DOMContentLoaded', () => {
    const widget = document.getElementById('viewed-widget');
    if (!widget) return;

    const langAttr = document.documentElement.getAttribute('lang') || 'ru';
    const isUA = langAttr === 'uk' || langAttr === 'ua' || location.pathname.includes('/ua/');
    const LS_KEY = isUA ? 'rb_catalog_v1_ua' : 'rb_catalog_v1_ru';
    const TITLE = isUA ? 'Ви переглядали' : 'Вы просматривали';

    const viewedIds = window.getViewedProducts();
    if (!viewedIds || viewedIds.length === 0) {
        widget.hidden = true;
        return;
    }

    let catalog = [];
    try { catalog = JSON.parse(localStorage.getItem(LS_KEY)).items || []; } catch {}

    // Исключаем текущий товар
    const urlParams = new URLSearchParams(window.location.search);
    const currentId = urlParams.get('id');

    const items = viewedIds
        .filter(id => id != currentId)
        .map(id => catalog.find(p => p.id == id))
        .filter(Boolean);

    if (items.length === 0) {
        widget.hidden = true;
        return;
    }

    // Рендер HTML
    // Путь к фото учитывает текущую вложенность (ru/ua)
    const prefix = (location.pathname.includes('/ru/') || location.pathname.includes('/ua/')) ? "" : "";

    widget.innerHTML = `
        <div class="prod-slider-wrap">
            <div class="prod-slider-title">${TITLE}</div>
            <div class="slider-container">
                <button class="slider-btn prev viewed-prev">‹</button>
                <div class="slider-viewport">
                    <div class="slider-track viewed-track">
                        ${items.map(p => {
                            const img = p.image || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23f2f4f8' width='100%25' height='100%25'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239aa3af' font-size='10' font-family='sans-serif'%3EPhoto%3C/text%3E%3C/svg%3E";
                            return `
                            <div class="product-card is-clickable slider-item" style="padding:10px;" onclick="location.href='product.html?id=${p.id}'">
                                <div class="product-card__img" style="margin-bottom:8px;">
                                    <img src="${img}" style="max-height:100px;">
                                </div>
                                <div class="product-card__title" style="font-size:13px; margin-bottom:4px;">${p.title}</div>
                                <div class="product-card__price" style="font-size:14px;">${p.price} ₴</div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>
                <button class="slider-btn next viewed-next">›</button>
            </div>
        </div>
    `;

    // Логика слайдера
    const track = widget.querySelector('.viewed-track');
    const prev = widget.querySelector('.viewed-prev');
    const next = widget.querySelector('.viewed-next');
    let currentIdx = 0;
    const total = items.length;
    const visible = 3;

    const updateSlider = () => {
        const firstItem = track.firstElementChild;
        if(!firstItem) return;
        const itemW = firstItem.offsetWidth;
        const gap = 16;
        const shift = (itemW + gap) * currentIdx;
        track.style.transform = `translateX(-${shift}px)`;

        if(total <= visible) {
            prev.style.display = 'none'; next.style.display = 'none';
        } else {
            prev.style.display = 'flex'; next.style.display = 'flex';
            prev.disabled = currentIdx === 0;
            next.disabled = currentIdx >= total - visible;
        }
    };

    prev.addEventListener('click', () => { if(currentIdx > 0) { currentIdx--; updateSlider(); } });
    next.addEventListener('click', () => { if(currentIdx < total - visible) { currentIdx++; updateSlider(); } });
    window.addEventListener('resize', updateSlider);
    setTimeout(updateSlider, 100);
});

// ============================================
// LOGIC: SHOPPING CART (КОРЗИНА)
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Настройки ---
    const CART_KEY = 'rb_cart_v1';
    const langAttr = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    const IS_UA = langAttr.startsWith('uk') || langAttr === 'ua' || /\/ua\//i.test(location.pathname);

    // Текстовки
    const TEXT = IS_UA ? {
        emptyTitle: 'Кошик порожній',
        emptyDesc: 'Перегляньте наш каталог — точно знайдете щось особливе!',
        btnShop: 'До покупок',
        totalLabel: 'Оплата без доставки:',
        currency: 'грн',
        btnCheckout: 'Оформити замовлення',
        inStock: 'В наявності',
        outStock: 'Немає'
    } : {
        emptyTitle: 'Корзина пуста',
        emptyDesc: 'Просмотрите наш каталог — точно найдёте что-то особенное для себя!',
        btnShop: 'За покупками',
        totalLabel: 'Оплата без доставки:',
        currency: 'гривен',
        btnCheckout: 'Оформить заказ',
        inStock: 'В наличии',
        outStock: 'Нет'
    };

    // --- 2. Работа с данными ---

    // Получить каталог (уже сгенерированный выше)
    const getCatalog = () => {
        const key = IS_UA ? 'rb_catalog_v1_ua' : 'rb_catalog_v1_ru';
        try { return JSON.parse(localStorage.getItem(key)).items || []; }
        catch { return []; }
    };

    // Получить корзину: [{id: 123, qty: 2}, ...]
    const getCart = () => {
        try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
        catch { return []; }
    };

    const saveCart = (cart) => localStorage.setItem(CART_KEY, JSON.stringify(cart));

    // Добавить товар
    window.rbAddToCart = (id) => {
        const catalog = getCatalog();
        const product = catalog.find(p => p.id == id);

        if (!product) return alert('Ошибка: товар не найден');
        if (!product.in_stock) return alert(IS_UA ? 'Товару немає в наявності' : 'Товара нет в наличии');

        let cart = getCart();
        const existing = cart.find(item => item.id == id);

        if (existing) {
            // Проверка склада
            if (existing.qty < product.qty_stock) {
                existing.qty++;
            } else {
                alert(IS_UA ? `Більше немає на складі (доступно: ${product.qty_stock})` : `Больше нет на складе (доступно: ${product.qty_stock})`);
                return; // Не открываем корзину, если нельзя добавить
            }
        } else {
            cart.push({ id: id, qty: 1 });
        }

        saveCart(cart);
        renderCart();
        openDrawer(); // Открываем шторку
    };

    // Изменить кол-во
    const changeQty = (id, delta) => {
        let cart = getCart();
        const item = cart.find(i => i.id == id);
        if (!item) return;

        const catalog = getCatalog();
        const product = catalog.find(p => p.id == id);
        if (!product) return; // товар удалили из базы?

        const newQty = item.qty + delta;

        // Минимум 1
        if (newQty < 1) return;

        // Максимум (Склад)
        if (newQty > product.qty_stock) {
             alert(IS_UA ? `Максимум доступно: ${product.qty_stock}` : `Максимум доступно: ${product.qty_stock}`);
             return;
        }

        item.qty = newQty;
        saveCart(cart);
        renderCart();
    };

    // Удалить товар
    const removeItem = (id) => {
        let cart = getCart();
        cart = cart.filter(i => i.id != id);
        saveCart(cart);
        renderCart();
    };

    // --- 3. Рендер интерфейса ---
    const drawerBody = document.querySelector('.cart-drawer__body');
    const badgeDesktop = document.querySelector('.white-cart__text'); // "Корзина" текст
    // Если есть счетчик в мобильной шапке (опционально)
    // const badgeMobile = ...

    const renderCart = () => {
        if (!drawerBody) return;

        const cart = getCart();
        const catalog = getCatalog();

        // 1. Обновляем счетчик товаров в шапке (просто сумма товаров)
        const totalItems = cart.length;
        if(badgeDesktop) badgeDesktop.textContent = totalItems > 0
            ? (IS_UA ? `Кошик (${totalItems})` : `Корзина (${totalItems})`)
            : (IS_UA ? `Кошик` : `Корзина`);

        // 2. Если пусто
        if (cart.length === 0) {
            drawerBody.innerHTML = `
                <div class="cart-empty" style="margin-top: 30%; text-align: center;">
                    <div class="cart-empty__title">${TEXT.emptyTitle}</div>
                    <div class="cart-empty__text">${TEXT.emptyDesc}</div>
                    <a href="products.html" class="cart-empty__cta">${TEXT.btnShop}</a>
                </div>
            `;
            return;
        }

        // 3. Собираем HTML списка
        let listHtml = `<div class="cart-items-list">`;
        let totalPrice = 0;

        cart.forEach(cartItem => {
            const product = catalog.find(p => p.id == cartItem.id);
            if (!product) return; // товар устарел или удален

            const lineTotal = product.price * cartItem.qty;
            totalPrice += lineTotal;

            // Картинка или заглушка
            const img = product.image || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='70' height='70'%3E%3Crect fill='%23f2f4f8' width='100%25' height='100%25'/%3E%3C/svg%3E";

            listHtml += `
            <div class="cart-item">
                <img src="${img}" class="cart-item__img" alt="${product.title}" onclick="window.location.href='product.html?id=${product.id}'" style="cursor: pointer;">

                <div class="cart-item__info">
                    <a href="product.html?id=${product.id}" class="cart-item__title">${product.title}</a>
                    <div class="cart-item__status in-stock">${TEXT.inStock}</div>
                    <div class="cart-item__controls">
                        <button class="qty-btn" onclick="event.stopPropagation(); window.rbCartChange(${product.id}, -1)">−</button>
                        <span class="cart-item__qty">${cartItem.qty}</span>
                        <button class="qty-btn" onclick="event.stopPropagation(); window.rbCartChange(${product.id}, 1)">+</button>
                    </div>
                    <div class="cart-item__price">${product.price} ${TEXT.currency} × ${cartItem.qty} = ${lineTotal} ${TEXT.currency}</div>
                </div>

                <button class="cart-item__remove" onclick="event.stopPropagation(); window.rbCartRemove(${product.id})" aria-label="Удалить">×</button>
            </div>
            `;
        });
        listHtml += `</div>`; // close list

        // 4. Футер с итогом
        const footerHtml = `
            <div class="cart-footer">
                <div class="cart-total">
                    <span class="cart-total__label">${TEXT.totalLabel}</span>
                    <span class="cart-total__sum">${totalPrice} ${TEXT.currency}</span>
                </div>
                <button class="cart-checkout-btn" onclick="window.location.href='checkout.html'">${TEXT.btnCheckout}</button>
            </div>
        `;

        drawerBody.innerHTML = listHtml + footerHtml;
    };

    // --- 4. Открытие/Закрытие шторки ---
    const drawer = document.querySelector('.cart-drawer');
    const openDrawer = () => {
        if(!drawer) return;
        drawer.classList.add('is-open');
        document.body.classList.add('is-cart-open');
    };

    // Перехватываем стандартные кнопки открытия (из старого кода), чтобы они рендерили корзину
    document.querySelectorAll('[data-cart-open]').forEach(btn => {
        btn.addEventListener('click', () => {
            renderCart(); // Обновляем перед открытием
        });
    });

    // --- 5. Глобальный перехват кликов "КУПИТЬ" ---
    document.body.addEventListener('click', (e) => {
        // Нас интересует ТОЛЬКО кнопка на странице самого товара (большая синяя)
        // Кнопки в каталоге теперь имеют свой onclick и обрабатываются отдельно
        const btn = e.target.closest('.pp-buy-btn');

        if (!btn) return; // Если это не кнопка покупки на странице товара — уходим

        e.preventDefault();

        // Пытаемся взять ID из URL (так как мы на странице товара product.html?id=123)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('id')) {
            window.rbAddToCart(urlParams.get('id'));
        } else {
            console.error("ID товара не найден в URL");
        }
    });

    // Экспорт функций... (остается как было)
    window.rbCartChange = changeQty;
    window.rbCartRemove = removeItem;
    window.rbCartRender = renderCart;

    // Инициализация
    renderCart();
});

// ============================================
// AUTH SYSTEM: PYTHON BACKEND CONNECTION & UI
// ============================================
document.addEventListener('DOMContentLoaded', () => {

    const SESSION_KEY = 'rb_session_v1';
    const langAttr = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    const isUA = langAttr.startsWith('uk') || langAttr === 'ua' || location.pathname.includes('/ua/');

    // ТЕКСТЫ (Локализация - убрали лишнее про SMS)
    const TEXT = isUA ? {
        btnEnter: "Вхід", btnReg: "Реєстрація", or: "або",
        hello: "Вітаємо,", cab: "Кабінет", orders: "Мої замовлення",
        settings: "Налаштування", logout: "Вийти",

        errConnection: "Помилка з'єднання з сервером",
        errWrongCode: "Невірний код підтвердження",
        successReg: "Реєстрація успішна!",
        successPass: "Пароль успішно змінено! Тепер ви можете увійти.",

        tabLogin: "Вхід", tabReg: "Реєстрація",
        labelLogin: "E-mail", labelPass: "Пароль", forgotPass: "Забули пароль?",
        submitLogin: "Увійти", googleLogin: "Увійти через Google",

        labelName: "Ім'я", labelSurname: "Прізвище", labelEmail: "E-mail",
        labelPhone: "Телефон", labelCreatePass: "Вигадайте пароль",
        submitReg: "Зареєструватися", googleReg: "Реєстрація з Google",

        recTitle: "Відновлення паролю",
        recLabelEmail: "Введіть ваш E-mail", // Просто E-mail
        recLabelCode: "Код з листа",
        recNewPass: "Новий пароль",
        recBtnCode: "Отримати код",
        recBtnSave: "Зберегти пароль",
        recBack: "Назад до входу",
        recAlertSent: "Код відправлено на вашу пошту!", // Простое сообщение

        phName: "Іван", phSurname: "Іванов"
    } : {
        btnEnter: "Вход", btnReg: "Регистрация", or: "или",
        hello: "Приветствуем,", cab: "Кабинет", orders: "Мои заказы",
        settings: "Настройки", logout: "Выйти",

        errConnection: "Ошибка соединения с сервером",
        errWrongCode: "Неверный код подтверждения",
        successReg: "Регистрация успешна!",
        successPass: "Пароль успешно изменен! Теперь вы можете войти.",

        tabLogin: "Вход", tabReg: "Регистрация",
        labelLogin: "E-mail", labelPass: "Пароль", forgotPass: "Забыли пароль?",
        submitLogin: "Войти", googleLogin: "Войти через Google",

        labelName: "Имя", labelSurname: "Фамилия", labelEmail: "E-mail",
        labelPhone: "Телефон", labelCreatePass: "Придумайте пароль",
        submitReg: "Зарегистрироваться", googleReg: "Регистрация с Google",

        recTitle: "Восстановление пароля",
        recLabelEmail: "Введите ваш E-mail",
        recLabelCode: "Код из письма",
        recNewPass: "Новый пароль",
        recBtnCode: "Получить код",
        recBtnSave: "Сохранить пароль",
        recBack: "Назад ко входу",
        recAlertSent: "Код отправлен на вашу почту!",

        phName: "Иван", phSurname: "Иванов"
    };

    // --- 1. BACKEND ---
    const Backend = {
        register: async (data) => {
            try {
                const response = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                return await response.json();
            } catch (e) {
                console.error(e);
                return { success: false, error: TEXT.errConnection };
            }
        },
        login: async (email, password) => {
            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                return await response.json();
            } catch (e) {
                console.error(e);
                return { success: false, error: TEXT.errConnection };
            }
        },
        // Теперь метод принимает только email
        sendCode: async (email) => {
            try {
                const response = await fetch('/api/recover/send-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                return await response.json();
            } catch (e) {
                console.error(e);
                return { success: false, error: TEXT.errConnection };
            }
        },
        changePassword: async (email, newPass) => {
             try {
                const response = await fetch('/api/recover/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, new_pass: newPass })
                });
                return await response.json();
            } catch (e) {
                console.error(e);
                return { success: false, error: TEXT.errConnection };
            }
        }
    };

    // --- 2. SESSION ---
    const Session = {
        start: (user) => localStorage.setItem(SESSION_KEY, JSON.stringify(user)),
        end: () => localStorage.removeItem(SESSION_KEY),
        getCurrentUser: () => {
            try {
                const u = localStorage.getItem(SESSION_KEY);
                return u ? JSON.parse(u) : null;
            } catch { return null; }
        }
    };

    // --- 3. UI TEMPLATES ---
    const iconUser = `<span class="icon" aria-hidden="true" style="width:16px;height:16px;display:inline-block;background:url('data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%23cfd3d7\\' stroke-width=\\'2\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' %3E%3Cpath d=\\'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2\\'/%3E%3Ccircle cx=\\'12\\' cy=\\'7\\' r=\\'4\\'/%3E%3C/svg%3E') center/contain no-repeat;"></span>`;
    const iconGoogle = `<svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/><path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.27C4.672 5.143 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>`;

    const renderLoggedHeader = (user) => `
        <div class="auth-user" id="userMenuTrigger" style="cursor:pointer;">
            ${iconUser}
            <span class="link" style="border-bottom:1px dotted transparent;">${user.name} ${user.surname}</span>
        </div>
    `;

    const renderGuestHeader = () => `
        <div class="auth-user">
            ${iconUser}
            <a href="#" class="link" data-auth-trigger="login">${TEXT.btnEnter}</a>
            <span class="sep">|</span>
            <a href="#" class="link" data-auth-trigger="register">${TEXT.btnReg}</a>
        </div>
    `;

    const modalHTML = `
        <div class="auth-modal hours-modal" aria-hidden="true" id="authModal">
            <div class="hours-modal__backdrop" data-auth-close></div>
            <div class="hours-modal__panel auth-modal__panel" role="dialog" aria-modal="true">
                <button type="button" class="hours-modal__close" aria-label="Close" data-auth-close>×</button>

                <div class="auth-tabs" id="authTabs">
                    <button class="auth-tab is-active" data-tab="login">${TEXT.tabLogin}</button>
                    <button class="auth-tab" data-tab="register">${TEXT.tabReg}</button>
                </div>

                <div class="auth-tabs" id="recoveryTitle" style="display:none; border-bottom:1px solid #e6e8ed; padding:16px; font-weight:700; color:#0d2b4e; justify-content:center;">
                    ${TEXT.recTitle}
                </div>

                <div class="auth-content">

                    <form id="formLogin" class="auth-form is-visible">
                        <div class="co-field"><label>${TEXT.labelLogin}</label><input type="email" name="email" required placeholder="example@mail.com"></div>
                        <div class="co-field" style="margin-top:12px;"><label>${TEXT.labelPass}</label><input type="password" name="password" required></div>
                        <div style="margin-top:10px; font-size:13px; text-align:right;">
                            <a href="#" class="auth-link-forgot" id="goRecovery">${TEXT.forgotPass}</a>
                        </div>
                        <button type="submit" class="cart-checkout-btn auth-submit">${TEXT.submitLogin}</button>
                        <div class="auth-divider">${TEXT.or}</div>
                        <button type="button" class="btn-google" onclick="alert('Google Mock')">${iconGoogle} ${TEXT.googleLogin}</button>
                    </form>

                    <form id="formRegister" class="auth-form">
                        <div class="co-field"><label>${TEXT.labelName}</label><input type="text" name="name" required placeholder="${TEXT.phName}"></div>
                        <div class="co-field" style="margin-top:12px;"><label>${TEXT.labelSurname}</label><input type="text" name="surname" required placeholder="${TEXT.phSurname}"></div>
                        <div class="co-field" style="margin-top:12px;"><label>${TEXT.labelEmail}</label><input type="email" name="email" required placeholder="example@mail.com"></div>
                        <div class="co-field" style="margin-top:12px;"><label>${TEXT.labelPhone}</label><input type="tel" name="phone" required placeholder="+380..."></div>
                        <div class="co-field" style="margin-top:12px;"><label>${TEXT.labelCreatePass}</label><input type="password" name="password" required></div>
                        <button type="submit" class="cart-checkout-btn auth-submit">${TEXT.submitReg}</button>
                        <div class="auth-divider">${TEXT.or}</div>
                        <button type="button" class="btn-google" onclick="alert('Google Mock')">${iconGoogle} ${TEXT.googleReg}</button>
                    </form>

                    <form id="formRecovery" class="auth-form">
                        <div class="co-field">
                            <label>${TEXT.recLabelEmail}</label>
                            <input type="email" name="rec_email" required placeholder="example@mail.com">
                        </div>

                        <div id="recStep2" style="display:none; margin-top:12px;">
                             <div class="co-field"><label>${TEXT.recLabelCode}</label><input type="text" name="rec_code" placeholder="1234"></div>
                             <div class="co-field" style="margin-top:12px;"><label>${TEXT.recNewPass}</label><input type="password" name="rec_pass"></div>
                        </div>

                        <button type="submit" class="cart-checkout-btn auth-submit" style="margin-top:20px;" id="recSubmitBtn">${TEXT.recBtnCode}</button>

                        <div style="margin-top:15px; text-align:center;">
                            <a href="#" id="backToLogin" style="font-size:13px; color:#6b7280; text-decoration:underline;">${TEXT.recBack}</a>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    // --- 4. INIT ---
    if (!document.getElementById('authModal')) {
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    const currentUser = Session.getCurrentUser();
    const reviewsBlock = document.querySelector('.topbar-inner .reviews');

    if (reviewsBlock) {
        if (currentUser) {
            reviewsBlock.insertAdjacentHTML('beforebegin', renderLoggedHeader(currentUser));
        } else {
            reviewsBlock.insertAdjacentHTML('beforebegin', renderGuestHeader());
        }
    }

    initAuthLogic();

    if (currentUser) {
        // initUserDrawer(currentUser); - Шторка для Кабинета Покупателя. Уже неактуальна и не нужна
    }


    // --- 5. LOGIC ---

    function initAuthLogic() {
        const modal = document.getElementById('authModal');
        if(!modal) return;

        const tabsBlock = document.getElementById('authTabs');
        const recTitle = document.getElementById('recoveryTitle');
        const formLogin = document.getElementById('formLogin');
        const formReg = document.getElementById('formRegister');
        const formRec = document.getElementById('formRecovery');

        document.querySelectorAll('[data-auth-trigger]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                modal.classList.add('is-open');
                switchTab(btn.dataset.authTrigger);
            });
        });
        modal.querySelectorAll('[data-auth-close]').forEach(btn => btn.addEventListener('click', () => modal.classList.remove('is-open')));

        const tabs = modal.querySelectorAll('.auth-tab');
        function switchTab(tName) {
            formRec.classList.remove('is-visible');
            recTitle.style.display = 'none';
            tabsBlock.style.display = 'flex';
            tabs.forEach(t => t.classList.toggle('is-active', t.dataset.tab === tName));
            formLogin.classList.toggle('is-visible', tName === 'login');
            formReg.classList.toggle('is-visible', tName === 'register');
        }
        tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));


        // === ВХОД ===
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fData = new FormData(e.target);
            const btn = e.target.querySelector('button[type="submit"]');
            const oldText = btn.textContent;
            btn.textContent = "..."; btn.disabled = true;

            const res = await Backend.login(fData.get('email'), fData.get('password'));

            btn.textContent = oldText; btn.disabled = false;

            if (res.success) {
                Session.start(res.user);
                location.reload();
            } else {
                alert(res.error);
            }
        });


        // === РЕГИСТРАЦИЯ ===
        formReg.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fData = new FormData(e.target);
            const data = Object.fromEntries(fData.entries());
            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;

            const res = await Backend.register(data);
            btn.disabled = false;

            if (res.success) {
                alert(TEXT.successReg);
                Session.start(res.user);
                location.reload();
            } else {
                alert(res.error);
            }
        });


        // === ВОССТАНОВЛЕНИЕ (ТОЛЬКО EMAIL) ===
        let generatedCode = null;
        let emailUsed = null;

        document.getElementById('goRecovery').addEventListener('click', (e) => {
            e.preventDefault();
            formLogin.classList.remove('is-visible');
            tabsBlock.style.display = 'none';
            recTitle.style.display = 'flex';
            formRec.classList.add('is-visible');

            formRec.reset();
            document.getElementById('recStep2').style.display = 'none';
            document.getElementById('recSubmitBtn').textContent = TEXT.recBtnCode;
            generatedCode = null;
            emailUsed = null;
        });

        document.getElementById('backToLogin').addEventListener('click', (e) => {
            e.preventDefault();
            switchTab('login');
        });

        formRec.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fData = new FormData(e.target);
            const btn = document.getElementById('recSubmitBtn');

            // ШАГ 1: Запрос кода
            if (!generatedCode) {
                const email = fData.get('rec_email');

                btn.textContent = "..."; btn.disabled = true;

                // Отправляем запрос на сервер (сервер шлет Email)
                const res = await Backend.sendCode(email);

                btn.disabled = false;
                btn.textContent = TEXT.recBtnSave;

                if (res.success) {
                    emailUsed = email;
                    generatedCode = res.debug_code;

                    // Показываем сообщение БЕЗ кода (код уже на почте)
                    alert(TEXT.recAlertSent);
                    console.log("DEBUG: Code is", generatedCode); // Для удобства разработки

                    document.getElementById('recStep2').style.display = 'block';
                } else {
                    btn.textContent = TEXT.recBtnCode;
                    alert(res.error);
                }

            } else {
                // ШАГ 2: Смена пароля
                const code = fData.get('rec_code');
                const newPass = fData.get('rec_pass');

                if (code !== generatedCode) {
                    alert(TEXT.errWrongCode);
                    return;
                }

                const res = await Backend.changePassword(emailUsed, newPass);

                if (res.success) {
                    alert(TEXT.successPass);
                    location.reload();
                } else {
                    alert("Помилка/Ошибка");
                }
            }
        });
    }

    // Левое меню
    function initUserDrawer(user) {
        const drawerHTML = `
            <div class="user-drawer" id="userDrawer">
                <div class="user-drawer__backdrop" id="userDrawerBackdrop"></div>
                <div class="user-drawer__panel">
                    <div class="user-drawer__header">
                        <div class="user-drawer__title">${TEXT.hello} ${user.name}!</div>
                        <button class="user-drawer__close" id="userDrawerClose">×</button>
                    </div>
                    <ul class="user-menu-list">
                        <li class="user-menu-item"><a href="#" class="user-menu-link"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>${TEXT.cab}</a></li>
                        <li class="user-menu-item"><a href="#" class="user-menu-link"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>${TEXT.orders}</a></li>
                        <li class="user-menu-item"><a href="#" class="user-menu-link"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>${TEXT.settings}</a></li>
                    </ul>
                    <button class="user-logout-btn" onclick="window.rbLogout()"><svg style="width:20px;height:20px;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>${TEXT.logout}</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', drawerHTML);

        const drawer = document.getElementById('userDrawer');
        const trigger = document.getElementById('userMenuTrigger');
        const closeBtn = document.getElementById('userDrawerClose');
        const backdrop = document.getElementById('userDrawerBackdrop');

        const openD = () => drawer.classList.add('is-open');
        const closeD = () => drawer.classList.remove('is-open');

        if(trigger) trigger.addEventListener('click', openD);
        if(closeBtn) closeBtn.addEventListener('click', closeD);
        if(backdrop) backdrop.addEventListener('click', closeD);
    }

    window.rbLogout = () => {
        if(confirm(isUA ? "Ви дійсно хочете вийти?" : "Вы действительно хотите выйти?")) {
            Session.end();
            location.reload();
        }
    };
});

// ============================================
// ЛОГИКА КАБИНЕТА ПОЛЬЗОВАТЕЛЯ (PROFILE)
// ============================================

document.addEventListener('DOMContentLoaded', () => {

    // 1. ПЕРЕХОД В КАБИНЕТ ПРИ КЛИКЕ НА ИКОНКУ (Учитывает язык)
    document.body.addEventListener('click', (e) => {
        const userTrigger = e.target.closest('#userMenuTrigger');
        if (userTrigger) {
            e.preventDefault();
            e.stopPropagation();
            // Определяем текущий язык папки
            const isUACurrent = document.documentElement.lang === 'uk' || window.location.pathname.includes('/ua/');
            // Если мы уже в UA, идем на ua/profile.html, иначе на ru/profile.html
            // Но путь должен быть абсолютным или относительным корня.
            // Самый надежный вариант - проверить, где мы.
            if (isUACurrent) {
                // Если мы уже внутри папки /ua/, то просто profile.html, но лучше явно:
                window.location.href = '/ua/profile.html';
            } else {
                window.location.href = '/ru/profile.html';
            }
        }
    });

    // 2. ЛОГИКА СТРАНИЦЫ profile.html
    const ordersContainer = document.getElementById('ordersList');

    // Если контейнера нет, значит мы не в кабинете -> выходим
    if (!ordersContainer) return;

    // --- НАСТРОЙКИ ЯЗЫКА ---
    const isUA = document.documentElement.lang === 'uk' || window.location.pathname.includes('/ua/');

    const TEXT = {
        logoutConfirm: isUA ? 'Вийти з акаунту?' : 'Выйти из аккаунта?',
        emptyHistory: isUA ? 'Історія замовлень порожня.' : 'История заказов пуста.',
        error: isUA ? 'Помилка' : 'Ошибка',
        connError: isUA ? 'Помилка зв\'язку із сервером.' : 'Ошибка связи с сервером.',
        statusLabel: isUA ? 'Статус замовлення:' : 'Статус заказа:',
        headers: {
            num: '№',
            photo: isUA ? 'Фото' : 'Фото',
            name: isUA ? 'Найменування' : 'Наименование',
            price: isUA ? 'Ціна' : 'Цена',
            qty: isUA ? 'Кількість' : 'Количество',
            sum: isUA ? 'Сума' : 'Сумма'
        },
        totalLabel: isUA ? 'До сплати:' : 'К оплате:',
        statuses: {
            'Новый': isUA ? 'Новий' : 'Новый',
            'Рассматривается': isUA ? 'Розглядається' : 'Рассматривается',
            'Выполнен': isUA ? 'Виконано' : 'Выполнен',
            'Отменен': isUA ? 'Скасовано' : 'Отменён'
        }
    };

    // Глобальные переменные модуля
    let allOrdersCache = [];
    let currentOrderPage = 1;
    const ordersPerPage = 5;

    loadUserProfile();

    async function loadUserProfile() {
        // Проверка сессии
        const userRaw = localStorage.getItem('rb_session_v1');
        if (!userRaw) {
            window.location.href = 'index.html';
            return;
        }
        const user = JSON.parse(userRaw);

        // Заполняем сайдбар
        const nameEl = document.getElementById('profileName');
        const emailEl = document.getElementById('profileEmail');
        if (nameEl) nameEl.textContent = `${user.name} ${user.surname}`;
        if (emailEl) emailEl.textContent = user.email;

        // Кнопка Выйти
        const btnLogout = document.getElementById('btnLogout');
        if (btnLogout) {
            btnLogout.addEventListener('click', () => {
                if(confirm(TEXT.logoutConfirm)) {
                    localStorage.removeItem('rb_session_v1');
                    if (window.rbLogout) window.rbLogout();
                    window.location.href = 'index.html';
                }
            });
        }

        // Загрузка заказов
        try {
            const response = await fetch('/api/user/orders');
            const data = await response.json();

            if (data.success) {
                allOrdersCache = data.orders;

                // Сортировка по умолчанию (новые)
                sortAndRender('newest');

                // Слушатель селекта сортировки
                const sortSelect = document.getElementById('sortOrders');
                if (sortSelect) {
                    sortSelect.addEventListener('change', (e) => {
                        sortAndRender(e.target.value);
                    });
                }
            } else {
                ordersContainer.innerHTML = `<div style="padding:20px; text-align:center; color:red;">${TEXT.error}: ${data.error}</div>`;
            }
        } catch (e) {
            console.error(e);
            ordersContainer.innerHTML = `<div style="padding:20px; text-align:center;">${TEXT.connError}</div>`;
        }
    }

    function sortAndRender(sortType) {
        if (sortType === 'newest') {
            allOrdersCache.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        } else {
            allOrdersCache.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        }
        currentOrderPage = 1;
        renderOrdersPage();
    }

    function renderOrdersPage() {
        if (!allOrdersCache || allOrdersCache.length === 0) {
            ordersContainer.innerHTML = `<div style="padding:40px; text-align:center; color:#888;">${TEXT.emptyHistory}</div>`;
            return;
        }

        // 1. Срез страниц
        const start = (currentOrderPage - 1) * ordersPerPage;
        const end = start + ordersPerPage;
        const ordersSlice = allOrdersCache.slice(start, end);
        const totalPages = Math.ceil(allOrdersCache.length / ordersPerPage);

        // 2. Рендер
        const ordersHtml = ordersSlice.map(order => {
            let totalOrderSum = order.total_price || 0;
            let itemsHtml = '';

            let items = order.items;
            if (typeof items === 'string') {
                try { items = JSON.parse(items); } catch(e) {}
            }

            if (items && Array.isArray(items)) {
                itemsHtml = items.map((i, index) => {
                    let title = i.title || `Товар ID: ${i.id}`;
                    let price = parseFloat(i.price || 0);
                    let qty = parseInt(i.qty || 1);
                    let sum = price * qty;

                    if (!i.title || price === 0) {
                        try {
                            const catKey = isUA ? 'rb_catalog_v1_ua' : 'rb_catalog_v1_ru';
                            const catalog = JSON.parse(localStorage.getItem(catKey) || '{"items":[]}').items;
                            const prod = catalog.find(p => p.id == i.id);
                            if (prod) {
                                title = prod.title;
                                if(price === 0) price = prod.price;
                            }
                        } catch(e) {}
                        sum = price * qty;
                    }
                    if (totalOrderSum === 0) totalOrderSum += sum;

                    const imgUrl = "../assets/icons/company.png";

                    return `
                        <tr>
                            <td class="obt-num">${index + 1}</td>
                            <td class="obt-img"><img src="${imgUrl}" alt=""></td>
                            <td class="obt-name" data-label="${TEXT.headers.name}">${title}</td>
                            <td class="obt-price" data-label="${TEXT.headers.price}">${price} ₴</td>
                            <td class="obt-qty" data-label="${TEXT.headers.qty}">${qty} шт.</td>
                            <td class="obt-sum" data-label="${TEXT.headers.sum}">${sum} ₴</td>
                        </tr>
                    `;
                }).join('');
            }

            // --- ЛОГИКА СТАТУСОВ И КНОПКИ ОТМЕНЫ ---
            const stRaw = (order.status || 'Новый');
            const stLower = stRaw.toLowerCase();
            let stClass = 'new';

            // Определяем класс цвета
            if (stLower.includes('выполн') || stLower.includes('виконано') || stLower.includes('заверш')) stClass = 'completed';
            if (stLower.includes('отмен') || stLower.includes('скасовано')) stClass = 'cancelled';

            // Перевод статуса
            const displayStatus = TEXT.statuses[stRaw] || stRaw;

            // Проверяем, можно ли отменить (НЕ Выполняется, НЕ Выполнен, НЕ Отменен)
            // Ищем корни слов, чтобы покрыть и RU и UA варианты
            const isNonCancellable =
                   stLower.includes('выполн') || stLower.includes('викон') || // Выполнен, Выполняется
                   stLower.includes('отмен')  || stLower.includes('скасов');  // Отменен

            let cancelBtnHtml = '';
            if (!isNonCancellable) {
                const btnText = isUA ? 'Скасувати замовлення' : 'Отменить заказ';
                // Добавляем кнопку
                cancelBtnHtml = `<button class="btn-cancel-order" onclick="window.cancelOrderFromHistory(${order.id})">${btnText}</button>`;
            }

            return `
            <div class="order-block">
                <div class="ob-header">
                    <div class="ob-info">
                        <span class="ob-id">№ ${order.id}</span>
                        <span class="ob-date">${isUA ? 'від' : 'от'} ${order.created_at}</span>
                    </div>
                    <div style="display:flex; align-items:center; flex-wrap:wrap; gap:5px;">
                        <span style="color:#94a3b8; font-size:13px; margin-right:4px;">${TEXT.statusLabel}</span>
                        <span class="ob-status ${stClass}">${displayStatus}</span>
                        ${cancelBtnHtml}
                    </div>
                </div>

                <table class="ob-table">
                    <thead>
                        <tr>
                            <th>${TEXT.headers.num}</th>
                            <th>${TEXT.headers.photo}</th>
                            <th>${TEXT.headers.name}</th>
                            <th>${TEXT.headers.price}</th>
                            <th>${TEXT.headers.qty}</th>
                            <th>${TEXT.headers.sum}</th>
                        </tr>
                    </thead>
                    <tbody>${itemsHtml}</tbody>
                </table>

                <div class="ob-footer">
                    <span class="ob-total-label">${TEXT.totalLabel}</span>
                    <span class="ob-total-val">${totalOrderSum.toFixed(2)} ₴</span>
                </div>
            </div>
            `;
        }).join('');

        // 3. Пагинация
        let paginationHtml = '';
        if (totalPages > 1) {
            paginationHtml = `<div class="cab-pagination">`;
            paginationHtml += `<button class="cab-page-btn" onclick="window.changeOrderPage(${currentOrderPage - 1})" ${currentOrderPage === 1 ? 'disabled' : ''}>←</button>`;
            for (let i = 1; i <= totalPages; i++) {
                const activeClass = (i === currentOrderPage) ? 'active' : '';
                paginationHtml += `<button class="cab-page-btn ${activeClass}" onclick="window.changeOrderPage(${i})">${i}</button>`;
            }
            paginationHtml += `<button class="cab-page-btn" onclick="window.changeOrderPage(${currentOrderPage + 1})" ${currentOrderPage === totalPages ? 'disabled' : ''}>→</button>`;
            paginationHtml += `</div>`;
        }

        ordersContainer.innerHTML = ordersHtml + paginationHtml;
    }

    // --- ФУНКЦИЯ ОТМЕНЫ ЗАКАЗА ИЗ ИСТОРИИ ---
    window.cancelOrderFromHistory = async (orderId) => {
        const isUA = document.documentElement.lang === 'uk' || window.location.pathname.includes('/ua/');
        const confirmMsg = isUA ? `Ви дійсно хочете скасувати замовлення №${orderId}?` : `Вы действительно хотите отменить заказ №${orderId}?`;

        if(!confirm(confirmMsg)) return;

        try {
            const res = await fetch('/api/cancel_order', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ order_id: orderId })
            });
            const data = await res.json();

            if (data.success) {
                alert(isUA ? "Замовлення скасовано." : "Заказ отменен.");
                // Перезагружаем страницу, чтобы обновить список
                window.location.reload();
            } else {
                alert((isUA ? "Помилка: " : "Ошибка: ") + data.error);
            }
        } catch (e) {
            console.error(e);
            alert(isUA ? "Помилка з'єднання" : "Ошибка соединения");
        }
    };

    // Глобальная функция смены страницы
    window.changeOrderPage = (page) => {
        const totalPages = Math.ceil(allOrdersCache.length / ordersPerPage);
        if (page < 1 || page > totalPages) return;
        currentOrderPage = page;
        renderOrdersPage();
        document.querySelector('.cab-content').scrollIntoView({ behavior: 'smooth' });
    };
});