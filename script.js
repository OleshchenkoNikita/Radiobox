// === ИНИЦИАЛИЗАЦИЯ GA4 DATALAYER ===
window.dataLayer = window.dataLayer || [];
function pushGA4Event(eventName, items, value = 0) {
    const ecommerceData = { currency: "UAH", value: value, items: items };
    window.dataLayer.push({ ecommerce: null });
    window.dataLayer.push({ event: eventName, ecommerce: ecommerceData });
    console.log(`GA4 Event: ${eventName}`, ecommerceData);
}

// === ФУНКЦИЯ ДЛЯ ЗАЩИТЫ ОТ XSS ===
window.escapeHTML = function(str) {
    if (str === null || str === undefined) return '';
    return str.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

// ===== BANNER SLIDER (Поддержка БД и ВИДЕО) =====
(function () {
    const root = document.getElementById('bannerSlider');
    if (!root) return;

    const AUTOPLAY_MS = 6000; // Чуть дольше, т.к. могут быть видео

    // Сборка UI
    const viewport = document.createElement('div');
    viewport.className = 'rb-slider__viewport';
    const track = document.createElement('div');
    track.className = 'rb-slider__track';
    viewport.appendChild(track);
    root.appendChild(viewport);

    const dots = document.createElement('div');
    dots.className = 'rb-dots';
    root.appendChild(dots);

    const createSlide = (item) => {
        const s = document.createElement('div');
        s.className = 'rb-slide';
        s.style.overflow = 'hidden';
        s.style.position = 'relative';

        let content;
        if (item.file_type === 'video') {
            // 1. Создаем обычное ВИДЕО
            const vid = document.createElement('video');
            vid.src = item.filename;

            // Настройки для автовоспроизведения
            vid.muted = true;      // Обязательно для автоплей
            vid.loop = true;       // Зацикливание
            vid.autoplay = true;   // Автостарт
            vid.playsInline = true; // Для айфонов

            // Атрибуты против интерфейса
            vid.setAttribute('disablepictureinpicture', 'true');
            vid.setAttribute('controlslist', 'nodownload nofullscreen noremoteplayback');
            vid.setAttribute('tabindex', '-1');

            // CSS стили
            // pointerEvents = 'none' делает видео "прозрачным" для мыши
            vid.style.pointerEvents = 'none';
            vid.style.outline = 'none';
            vid.style.border = 'none';

            if (item.css_style) {
                vid.style.cssText += item.css_style;
                vid.style.position = 'absolute';
                vid.style.top = '0';
                vid.style.left = '0';

                // Повторяем, так как cssText перезаписывает style
                vid.style.pointerEvents = 'none';
            } else {
                vid.style.width = "100%";
                vid.style.height = "100%";
                vid.style.objectFit = "cover";
                vid.style.pointerEvents = 'none';
            }

            // 2. Создаем ЩИТ (Оверлей)
            // Это пустой блок, который лежит ПОВЕРХ видео.
            // Браузер думает, что мышка ходит по нему, а не по видео.
            const shield = document.createElement('div');
            shield.style.position = 'absolute';
            shield.style.top = '0';
            shield.style.left = '0';
            shield.style.width = '100%';
            shield.style.height = '100%';
            shield.style.zIndex = '10'; // Он выше видео
            shield.style.background = 'transparent';

            // Сначала добавляем видео, потом щит
            s.appendChild(vid);
            s.appendChild(shield);
            return s;

        } else {
            // Картинка
            const img = document.createElement('img');
            img.src = item.filename;
             if (item.css_style) {
                img.style.cssText = item.css_style;
                img.style.position = 'absolute';
                img.style.top = '0';
                img.style.left = '0';
            }
            s.appendChild(img);
        }
        return s;
    };

    const setActiveDot = i => {
        dots.querySelectorAll('.rb-dot').forEach((d, idx) => d.classList.toggle('is-active', idx === i));
    };

    // ЗАГРУЗКА ДАННЫХ ИЗ API
    async function getDataList() {
        try {
            const r = await fetch('/api/banners');
            const data = await r.json();

            if (data.success && data.banners.length > 0) {
                const width = window.innerWidth;
                let currentDevice = 'pc';

                if (width <= 640) currentDevice = 'mobile';
                else if (width <= 1024) currentDevice = 'tablet';

                // Определяем текущий язык магазина
                const langAttr = (document.documentElement.getAttribute('lang') || '').toLowerCase();
                const isUA = langAttr.startsWith('uk') || langAttr === 'ua' || window.location.pathname.includes('/ua/');
                const currentLang = isUA ? 'ua' : 'ru';

                // 1. Фильтруем по языку (все баннеры, где target_lang === 'all' ИЛИ совпадает с текущим языком)
                let langFiltered = data.banners.filter(b => !b.target_lang || b.target_lang === 'all' || b.target_lang === currentLang);

                // 2. Пытаемся найти баннеры именно для текущего устройства
                let deviceFiltered = langFiltered.filter(b => b.device_type === currentDevice);

                // 3. Если для мобилы/планшета ничего не залили, берем PC-версию
                if (deviceFiltered.length === 0) {
                    deviceFiltered = langFiltered.filter(b => b.device_type === 'pc');
                }

                return deviceFiltered;
            }
        } catch (e) {
            console.error("Ошибка загрузки баннеров:", e);
        }
        return [];
    }

    let idx = 0, count = 0, allow = true, timer = null;

    function translateTo(i, animate = true) {
        if (!animate) {
            track.style.transition = 'none';
            track.style.transform = `translateX(-${i * 100}%)`;
            void track.offsetHeight;
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
            if (idx === count) {
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
            requestAnimationFrame(() => requestAnimationFrame(() => translateTo(idx, true)));
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

    function startAutoplay() { stopAutoplay(); timer = setInterval(stepForward, AUTOPLAY_MS); }
    function stopAutoplay() { if (timer) clearInterval(timer); timer = null; }
    function restartAutoplay() { stopAutoplay(); startAutoplay(); }

    // ГЛАВНЫЙ ЗАПУСК
    (async function () {
        const items = await getDataList();

        // Очищаем старые img внутри рута, если были
        root.querySelectorAll(':scope > img').forEach(n => n.remove());

        if (!items.length) {
            // Если баннеров нет вообще, скрываем слайдер или показываем заглушку
            root.style.display = 'none';
            return;
        }

        // Наполняем трек
        items.forEach(item => track.appendChild(createSlide(item)));

        // Клон первого для бесшовной прокрутки
        track.appendChild(createSlide(items[0]));

        count = items.length;

        // Точки
        items.forEach((_, i) => {
            const d = document.createElement('button');
            d.type = 'button'; d.className = 'rb-dot';
            dots.appendChild(d);
        });

        translateTo(0, false);
        setActiveDot(0);

        // Клики по точкам
        dots.addEventListener('click', e => {
            const btn = e.target.closest('.rb-dot');
            if (!btn) return;
            const target = [...dots.querySelectorAll('.rb-dot')].indexOf(btn);
            if (target !== -1 && target !== idx) {
                // Упрощенный прыжок
                idx = target;
                translateTo(idx, true);
                setActiveDot(idx);
                restartAutoplay();
            }
        });

        // Пауза при наведении
        root.addEventListener('mouseenter', stopAutoplay);
        root.addEventListener('mouseleave', startAutoplay);

        // Стрелки
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

        prev.addEventListener('click', () => { stepBackward(); restartAutoplay(); });
        next.addEventListener('click', () => { stepForward(); restartAutoplay(); });
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
        viber.href = "viber://pa?chatURI=radiobox";
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

    if (window.location.pathname.includes('contacts.html') || window.location.pathname.includes('checkout.html')) {
        loadDynamicContacts();
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

// ===== Страница «Отзывы»: API Версия =====
document.addEventListener('DOMContentLoaded', () => {
    const wrap = document.getElementById('revList');
    // Если на странице нет списка отзывов, выходим
    if (!wrap) return;

    const _lang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    const IS_RU = _lang.startsWith('ru');

    const NEXT_LABEL = IS_RU ? 'Следующая страница' : 'Наступна сторінка';
    const PREV_LABEL = IS_RU ? 'Предыдущая страница' : 'Попередня сторінка';
    const OF_FIVE = IS_RU ? 'из 5' : 'з 5';
    const ADMIN_REPLY_TITLE = IS_RU ? 'Ответ магазина RadioBox' : 'Відповідь магазину RadioBox';

    // Константы
    const PER_PAGE = 10; // Показывать по 10
    let allReviews = [];
    let currentPage = 1;

    // --- 1. ЗАГРУЗКА ОТЗЫВОВ С СЕРВЕРА ---
    async function loadReviews() {
        wrap.innerHTML = '<div style="padding:20px; text-align:center;">Загрузка...</div>';
        try {
            const res = await fetch('/api/reviews');
            const data = await res.json();
            if (data.success) {
                allReviews = data.reviews;
                renderCurrent();
                // Также обновляем счетчик в шапке, раз уж мы получили данные
                updateHeaderCountDirectly(allReviews.length);
            } else {
                wrap.innerHTML = '<div style="color:red; text-align:center;">Ошибка загрузки</div>';
            }
        } catch (e) {
            console.error(e);
            wrap.innerHTML = '<div style="color:red; text-align:center;">Ошибка соединения</div>';
        }
    }

    function updateHeaderCountDirectly(n) {
        const el = document.querySelector('.reviews .link');
        if(el && n > 0) el.textContent = IS_RU ? `${n} отзывов` : `${n} відгуків`;
    }

    // --- 2. РЕНДЕР ---
    function calcTotalPages() {
        return Math.max(1, Math.ceil(allReviews.length / PER_PAGE));
    }

    function pageSlice(page) {
        const start = (page - 1) * PER_PAGE;
        return allReviews.slice(start, start + PER_PAGE);
    }

    const Star = (filled) => `
    <svg viewBox="0 0 24 24" ${filled ? "" : 'class="is-empty"'} aria-hidden="true">
      <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21z" fill="currentColor" />
    </svg>`;

    function getGradeText(rating) {
        const map = IS_RU
            ? { 5: 'Отлично', 4: 'Хорошо', 3: 'Нейтрально', 2: 'Плохо', 1: 'Очень плохо' }
            : { 5: 'Відмінно', 4: 'Добре', 3: 'Нейтрально', 2: 'Погано', 1: 'Дуже погано' };
        return map[rating] || '';
    }

    function renderReviewsList(list) {
        wrap.innerHTML = '';
        if (list.length === 0) {
            wrap.innerHTML = `<div style="text-align:center; padding:20px; color:#666;">${IS_RU ? 'Отзывов пока нет. Будьте первыми!' : 'Відгуків поки немає. Будьте першими!'}</div>`;
            return;
        }

        list.forEach(r => {
            const stars = Array.from({ length: 5 }, (_, i) => Star(i < r.rating)).join('');

            // Проверка на ответ администратора
            let replyHtml = '';
            if (r.reply && r.reply.trim() !== '') {
                replyHtml = `
                <div style="margin-top:12px; background:#f1f5f9; padding:12px 16px; border-radius:8px; border-left:4px solid #0d2b4e; font-size:14px; color:#334155;">
                    <div style="font-weight:700; color:#0d2b4e; margin-bottom:4px; font-size:13px; text-transform:uppercase;">${ADMIN_REPLY_TITLE}</div>
                    ${r.reply}
                </div>`;
            }

            wrap.insertAdjacentHTML('beforeend', `
            <article class="rev-card">
              <header class="rev-head">
                <div class="rev-author">${window.escapeHTML(r.author)}</div>
                <div class="rev-date">${window.escapeHTML(r.date)}</div>
                <div class="rev-stars" aria-label="Рейтинг: ${r.rating} ${OF_FIVE}">${stars}</div>
                <div class="rev-grade">${getGradeText(r.rating)}</div>
              </header>
              <div class="rev-text">${window.escapeHTML(r.comment || "")}</div>
              ${replyHtml}
            </article>
          `);
        });
    }

    function renderPager() {
        const pager = document.getElementById('revPager');
        if (!pager) return;
        const total = calcTotalPages();
        const cur = currentPage;

        let html = '';
        if (total > 1) {
            html += `<a href="#" data-page="${cur - 1}" aria-label="${PREV_LABEL}" ${cur === 1 ? 'aria-disabled="true" style="pointer-events:none;opacity:.4;"' : ''}>←</a>`;
            for(let i=1; i<=total; i++) {
                if (i === cur) html += `<a href="#" data-page="${i}" aria-current="page"><strong>${i}</strong></a>`;
                else html += `<a href="#" data-page="${i}">${i}</a>`;
            }
            html += `<a href="#" data-page="${cur + 1}" aria-label="${NEXT_LABEL}" ${cur === total ? 'aria-disabled="true" style="pointer-events:none;opacity:.4;"' : ''}>→</a>`;
        }
        pager.innerHTML = html;
    }

    function renderCurrent() {
        renderReviewsList(pageSlice(currentPage));
        renderPager();
    }

    // Пагинация (клик)
    document.getElementById('revPager')?.addEventListener('click', (e) => {
        const a = e.target.closest('a[data-page]');
        if (!a) return;
        e.preventDefault();
        const p = parseInt(a.dataset.page, 10);
        if (p > 0 && p <= calcTotalPages()) {
            currentPage = p;
            renderCurrent();
            wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });

    // --- 3. ФОРМА ДОБАВЛЕНИЯ ---
    const addBtn = document.querySelector('.btn-add-review');
    const form = document.getElementById('reviewForm');
    const btnCancel = document.getElementById('rfCancel');

    const txtArea = document.getElementById('rfComment');
    const cntSpan = document.getElementById('rfCnt');

    if (txtArea && cntSpan) {
        txtArea.addEventListener('input', () => {
            cntSpan.textContent = txtArea.value.length;
        });
    }

    addBtn?.addEventListener('click', (e) => { e.preventDefault(); form.hidden = false; addBtn.closest('.reviews-actions').classList.add('is-hidden'); });
    btnCancel?.addEventListener('click', (e) => { e.preventDefault(); form.hidden = true; addBtn.closest('.reviews-actions').classList.remove('is-hidden'); });

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const fData = new FormData(form);
        const data = {
            author: fData.get('author'),
            rating: fData.get('rating'),
            comment: fData.get('comment')
        };

        if(!data.author || !data.rating) {
            alert(IS_RU ? 'Заполните имя и оценку' : "Заповніть ім'я та оцінку");
            return;
        }

        try {
            const res = await fetch('/api/reviews/add', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
            const ans = await res.json();

            if(ans.success) {
                // 1. Скрываем форму
                form.hidden = true;
                addBtn.closest('.reviews-actions').classList.remove('is-hidden');
                form.reset();

                // 2. Обновляем список (но не скроллим!)
                await loadReviews();

                // СТРОКИ НИЖЕ УДАЛИТЬ ИЛИ ЗАКОММЕНТИРОВАТЬ:
                // const yOffset = -150;
                // const y = wrap.getBoundingClientRect().top + window.scrollY + yOffset;
                // window.scrollTo({top: y, behavior: 'smooth'});
            } else {
                alert('Ошибка сервера');
            }
        } catch(err) {
            alert('Ошибка сети');
        }
    });

    // Старт
    loadReviews();
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
    const KEY_UA = 'rb_catalog_v1_ua', KEY_RU = 'rb_catalog_v1_ru';
    const CURRENT_KEY = IS_UA ? KEY_UA : KEY_RU;

    // --- 1. Функция сохранения в память ---
    function saveToLS(key, items) {
        localStorage.setItem(key, JSON.stringify({ items }));
    }

    // --- 2. Ваши запасные данные (Fallbacks) ---
    // Оставьте ваш полный список BI_ITEMS здесь! Я для краткости оставил начало.
    const mockImages = (count = 1) => Array(count).fill('');
    let idCounter = 1700000000;
    const N = (p) => ({id: ++idCounter, ...p});

    // --- 4. Запрос к серверу за свежими данными ---
    fetch('/api/products?v=' + new Date().getTime())
        .then(r => r.json())
        .then(data => {
            if(data.success) {
                // Сервер ответил! Преобразуем данные
                const items = data.items.map(it => ({
                    id: it.id,
                    sku: it.sku,
                    title_ru: it.title_ru,
                    title_ua: it.title_ua || it.title_ru,
                    price: it.price,
                    in_stock: it.in_stock,
                    qty_stock: it.qty_stock || 100,
                    unit_type: it.unit_type,
                    category: it.category,
                    subcategory: it.subcategory,
                    images: it.images,

                    on_index: it.on_index,
                    position: it.position,

                    // ГЛАВНОЕ: Формируем title для текущего языка
                    title: IS_UA ? (it.title_ua || it.title_ru) : it.title_ru,

                    image: (it.images && it.images.length > 0) ? it.images[0] : (it.image || ''),
                    description: IS_UA ? (it.description_ua || '') : (it.description_ru || ''),

                    // SEO поля
                    seo_title: it.seo_title,
                    seo_description: it.seo_description
                }));

                // Сохраняем актуальную версию
                saveToLS(CURRENT_KEY, items);

                // === ВЫЗЫВАЕМ ПЕРЕРИСОВКУ КАТАЛОГА ===
                if(window.renderCatalog) {
                    console.log("[Seed] Данные получены, обновляем каталог.");
                    window.renderCatalog();
                }

                // === ПЕРЕРИСОВКА ВИТРИНЫ ===
                // Вызываем функции рендера витрины, если они существуют
                if(window.renderShowcase) window.renderShowcase(items);
                if(window.renderVitrine) window.renderVitrine(items);

                // Создаем глобальное событие на случай, если логика витрины прописана прямо в HTML
                document.dispatchEvent(new CustomEvent('catalogUpdated', { detail: items }));
            }
        })
        .catch(err => console.error("Ошибка загрузки товаров:", err));
})();

// === ИСТОРИЯ ПРОСМОТРОВ (Логика) ===
window.addToViewedProducts = function(id) {
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
                            // Логика картинки
                            const img = (p.image || (p.images && p.images[0]))
                                ? (p.image || p.images[0])
                                : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23f2f4f8' width='100%25' height='100%25'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239aa3af' font-size='10' font-family='sans-serif'%3EPhoto%3C/text%3E%3C/svg%3E";

                            // Логика языка
                            const isUA = document.documentElement.lang === 'uk' || window.location.pathname.includes('/ua/');
                            const stockLabel = isUA ? 'На складі:' : 'На складе:';

                            // !!! ФИКС НАЗВАНИЯ (чтобы не было undefined) !!!
                            let displayTitle = p.title;
                            if (!displayTitle) {
                                displayTitle = isUA ? (p.title_ua || p.title_ru) : (p.title_ru || p.title_ua);
                            }
                            if (!displayTitle) displayTitle = "Товар";

                            // Единица измерения
                            const unitLabel = (p.unit_type === 'set') ? (isUA ? 'комплект.' : 'комплект.') : (isUA ? 'шт.' : 'шт.');

                            return `
                            <div class="product-card is-clickable slider-item" style="padding:10px;" onclick="location.href='product.html?id=${p.id}'">
                                <div class="product-card__img">
                                    <img src="${img}" alt="${displayTitle}" loading="lazy">
                                </div>
                                <div class="product-card__title" style="font-size:13px; margin-bottom:4px;">${displayTitle}</div>
                                <div class="product-card__price" style="font-size:14px;">${p.price} ₴</div>
                                <div style="font-size:11px; color:#888; margin-top:4px;">
                                    ${stockLabel} ${p.qty_stock || 0} ${unitLabel}
                                </div>
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
        console.log("Добавляем товар:", product);
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
            cart.push({
                id: id,
                qty: 1,
                sku: product.sku || product.SKU || "",    // Берем из объекта product
                title: product.title || "",
                price: product.price || 0,
                image: product.image || "",  // Сохраняем путь к фото
                category: product.category || 'general'
            });
        }

        // --- GA4: ADD TO CART ---
        pushGA4Event('add_to_cart', [{
            item_id: product.sku || product.id,
            item_name: product.title_ru || product.title || "",
            price: parseFloat(product.price || 0),
            quantity: 1,
            item_category: product.category || 'general'
        }], parseFloat(product.price || 0));

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

        // --- GA4: REMOVE FROM CART ---
        const itemToRemove = cart.find(i => i.id == id);
        if (itemToRemove) {
            pushGA4Event('remove_from_cart', [{
                item_id: itemToRemove.sku || itemToRemove.id,
                item_name: itemToRemove.title,
                price: parseFloat(itemToRemove.price || 0),
                quantity: itemToRemove.qty
            }]);
        }

        cart = cart.filter(i => i.id != id);
        saveCart(cart);
        renderCart();
    };

    // --- 3. Рендер интерфейса ---

    const renderCart = () => {
        const drawerBody = document.querySelector('.cart-drawer__body');
        const badgeDesktop = document.querySelector('.white-cart__text'); // "Корзина" текст
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

            const displayTitle = IS_UA
                ? (product.title_ua || product.title_ru || product.title)
                : (product.title_ru || product.title);

            listHtml += `
            <div class="cart-item">
                <img src="${img}" class="cart-item__img" alt="${displayTitle}" onclick="window.location.href='product.html?id=${product.id}'" style="cursor: pointer;">

                <div class="cart-item__info">
                    <a href="product.html?id=${product.id}" class="cart-item__title">${displayTitle}</a>
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
                <button class="cart-checkout-btn" onclick="window.rbBeginCheckout()">${TEXT.btnCheckout}</button>
            </div>
        `;

        drawerBody.innerHTML = listHtml + footerHtml;
    };

    // --- GA4: BEGIN CHECKOUT ---
    window.rbBeginCheckout = () => {
    let cart = getCart();
    let catalog = getCatalog(); // чтобы подтягивать категорию товара
    let totalValue = cart.reduce((sum, i) => sum + (parseFloat(i.price) * i.qty), 0);

    let ga4Items = cart.map(i => {
        const prod = catalog.find(p => p.id == i.id) || {};
        return {
            item_id: i.sku || i.id,
            item_name: i.title,
            price: parseFloat(i.price),
            quantity: i.qty,
            item_category: prod.category || 'general' // <-- Добавили категорию
        };
    });

    pushGA4Event('begin_checkout', ga4Items, totalValue);
    setTimeout(() => { window.location.href = 'checkout.html'; }, 300);
    };

    // --- 4. Открытие/Закрытие шторки ---
    const openDrawer = () => {
        const drawer = document.querySelector('.cart-drawer');
        if(!drawer) return;
        drawer.classList.add('is-open');
        document.body.classList.add('is-cart-open');

        // --- GA4: VIEW CART ---
        let cart = getCart();
        let totalValue = cart.reduce((sum, i) => sum + (parseFloat(i.price) * i.qty), 0);
        let ga4Items = cart.map(i => ({
            item_id: i.sku || i.id,
            item_name: i.title,
            price: parseFloat(i.price),
            quantity: i.qty
        }));
        pushGA4Event('view_cart', ga4Items, totalValue);
    };

    // Перехватываем стандартные кнопки открытия (из старого кода), чтобы они рендерили корзину
    document.querySelectorAll('[data-cart-open]').forEach(btn => {
        btn.addEventListener('click', () => {
            renderCart(); // Обновляем перед открытием
        });
    });

    // --- 5. Глобальный перехват кликов "КУПИТЬ" ---
    document.body.addEventListener('click', (e) => {

        if (window.location.pathname.includes('product.html')) return;
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

});

// ============================================
// AUTH SYSTEM: PYTHON BACKEND CONNECTION & UI
// ============================================
document.addEventListener('DOMContentLoaded', () => {

    const SESSION_KEY = 'rb_session_v1';
    const langAttr = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    const isUA = langAttr.startsWith('uk') || langAttr === 'ua' || location.pathname.includes('/ua/');

    // ТЕКСТЫ
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
        recLabelEmail: "Введіть ваш E-mail",
        recLabelCode: "Код з листа",
        recNewPass: "Новий пароль",
        recBtnCode: "Отримати код",
        recBtnSave: "Зберегти пароль",
        recBack: "Назад до входу",
        recAlertSent: "Код відправлено на вашу пошту!",
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
    const iconGoogle = `<svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/><path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.27C4.672 5.143 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>`;

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

    // ВАЖНО: Мы убрали отсюда код вставки кнопок в шапку, так як шапка теперь грузится отдельно.
    // Код вставки "Вхід / Кабінет" тепер знаходиться в функції initHeaderInteractivity

    initAuthLogic();

    // --- 5. LOGIC ---

    function initAuthLogic() {
        const modal = document.getElementById('authModal');
        if(!modal) return;

        const tabsBlock = document.getElementById('authTabs');
        const recTitle = document.getElementById('recoveryTitle');
        const formLogin = document.getElementById('formLogin');
        const formReg = document.getElementById('formRegister');
        const formRec = document.getElementById('formRecovery');

        // === ГЛАВНОЕ ИСПРАВЛЕНИЕ: ДЕЛЕГУВАННЯ ПОДІЙ ===
        // Використовуємо document.body, щоб зловити клік, навіть якщо кнопка з'явилась пізніше
        document.body.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-auth-trigger]');
            if (btn) {
                e.preventDefault();
                modal.classList.add('is-open');
                switchTab(btn.dataset.authTrigger);
            }
        });

        // Закрытие модалки
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
                const res = await Backend.sendCode(email);
                btn.disabled = false;
                btn.textContent = TEXT.recBtnSave;

                if (res.success) {
                    emailUsed = email;
                    generatedCode = res.debug_code;
                    alert(TEXT.recAlertSent);
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

    // Глобальная функция выхода
    window.rbLogout = async () => {
        const isUA = document.documentElement.lang === 'uk' || location.pathname.includes('/ua/');
        if(confirm(isUA ? "Ви дійсно хочете вийти?" : "Вы действительно хотите выйти?")) {
            try {
                // Ждем, пока сервер реально очистит сессию
                await fetch('/admin/logout');
            } catch (e) {
                console.error("Ошибка при выходе на сервере:", e);
            }

            // Только после ответа сервера удаляем локальные данные
            localStorage.removeItem('rb_session_v1');

            // Теперь переходим на главную
            location.href = isUA ? '/ua/index.html' : '/ru/index.html';
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
            btnLogout.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.rbLogout) window.rbLogout();
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

    const isUA = document.documentElement.lang === 'uk' || window.location.pathname.includes('/ua/');

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

        // --- ЛОГИКА ТОВАРОВ ---
        if (items && Array.isArray(items)) {
            itemsHtml = items.map((i, index) => {
                let title = i.title || `Товар ID: ${i.id}`;
                let price = parseFloat(i.price || 0);
                let qty = parseInt(i.qty || 1);

                let prod = null;
                try {
                    const catKey = isUA ? 'rb_catalog_v1_ua' : 'rb_catalog_v1_ru';
                    const catalog = JSON.parse(localStorage.getItem(catKey) || '{"items":[]}').items;
                    prod = catalog.find(p => p.id == i.id);
                } catch(e) {}

                if ((!i.title || price === 0) && prod) {
                     title = prod.title;
                     if (price === 0) price = prod.price;
                }

                let sum = price * qty;
                if (totalOrderSum === 0) totalOrderSum += sum;

                let rawImg = i.image;
                if (!rawImg && prod) {
                    if (prod.images && prod.images.length > 0) rawImg = prod.images[0];
                    else if (prod.image) rawImg = prod.image;
                }

                let imgUrl = "";
                if (Array.isArray(rawImg)) {
                    imgUrl = rawImg.length > 0 ? rawImg[0] : "";
                } else if (rawImg) {
                    imgUrl = rawImg;
                }
                if (!imgUrl) imgUrl = "/assets/icons/company.png";

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

        // --- ЛОГИКА ДОСТАВКИ И ТТН (ИСПРАВЛЕНА) ---
        let rawDelivery = order.delivery || '—';
        let fullAddress = order.address || '—';
        let displayAddress = fullAddress;

        // Убираем способ доставки из строки адреса, если он там есть (формат "Метод: Адрес")
        if (fullAddress.includes(':')) {
            displayAddress = fullAddress.split(':').slice(1).join(':').trim();
        }

        const deliveryMap = isUA ? {
            'np': 'Нова Пошта', 'up': 'Укрпошта Стандарт', 'upe': 'Укрпошта Експрес', 'meest': 'Meest ПОШТА', 'self': 'Самовивіз',
            'Новая Почта': 'Нова Пошта', 'Укрпочта Стандарт': 'Укрпошта Стандарт', 'Укрпочта Экспресс': 'Укрпошта Експрес', 'Meest Почта': 'Meest ПОШТА', 'Самовывоз': 'Самовивіз'
        } : {
            'np': 'Новая Почта', 'up': 'Укрпочта Стандарт', 'upe': 'Укрпочта Экспресс', 'meest': 'Meest ПОЧТА', 'self': 'Самовывоз',
            'Нова Пошта': 'Новая Почта', 'Укрпошта Стандарт': 'Укрпочта Стандарт', 'Укрпошта Експрес': 'Укрпошта Экспресс', 'Meest ПОШТА': 'Meest ПОЧТА', 'Самовивіз': 'Самовывоз'
        };

        let displayDelivery = deliveryMap[rawDelivery] || rawDelivery;

        // "Лечилка" для старых заказов: если в доставке прочерк, ищем метод в адресе (формат "Метод: Адрес")
        if (displayDelivery === '—' && displayAddress.includes(':')) {
            const parts = displayAddress.split(':');
            let methodPart = parts[0].trim();
            if (deliveryMap[methodPart]) {
                displayDelivery = deliveryMap[methodPart];
                displayAddress = parts.slice(1).join(':').trim();
            }
        }

        // ОПРЕДЕЛЯЕМ САМОВЫВОЗ (для скрытия ТТН)
        const lowDelivery = displayDelivery.toLowerCase();
        const isSelf = lowDelivery === 'self' || lowDelivery.includes('самовывоз') || lowDelivery.includes('самовивіз');

        const ttnHtml = isSelf ? '' : `
            <p><strong>ТТН:</strong> <span style="color:#2563eb; font-weight:bold;">${order.ttn || (isUA ? 'Очікується' : 'Ожидается')}</span></p>
        `;

        // --- ЛОГИКА СТАТУСОВ ---
        const stRaw = (order.status || 'Новый');
        const stLower = stRaw.toLowerCase();
        let stClass = 'new';
        if (stLower.includes('выполн') || stLower.includes('виконано') || stLower.includes('заверш')) stClass = 'completed';
        if (stLower.includes('отмен') || stLower.includes('скасовано')) stClass = 'cancelled';
        const displayStatus = TEXT.statuses[stRaw] || stRaw;

        // --- КНОПКИ (ОТМЕНА И ОПЛАТА) ---
        let cancelBtnHtml = '';
        const isPaid = stLower.includes('оплач') || order.payment_status === 'paid' || order.payment_status === 'Оплачено';
        const hasTTN = order.ttn && order.ttn.trim() !== '';
        const isNonCancellable = stLower.includes('выполн') || stLower.includes('викон') || stLower.includes('отмен') || stLower.includes('скасов') || isPaid || hasTTN;

        if (!isNonCancellable) {
            cancelBtnHtml = `<button class="btn-cancel-order" onclick="event.stopPropagation(); window.cancelOrderFromHistory(${order.id})">${isUA ? 'Скасувати замовлення' : 'Отменить заказ'}</button>`;
        }

        let payBtnHtml = '';
        const isCard = (order.payment_method === 'card_online' || (order.payment_method && order.payment_method.toLowerCase().includes('карт')));
        const isUnpaid = (order.payment_status !== 'paid' && order.payment_status !== 'Оплачено');
        const isNotCancelled = !stLower.includes('отмен') && !stLower.includes('скасовано');

        if (isCard && isUnpaid && isNotCancelled) {
            payBtnHtml = `<button class="btn-pay-late" onclick="event.stopPropagation(); window.payOrderLiqPay(${order.id}, this)" style="margin-right:8px; padding:4px 10px; background:#22c55e; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px;">
                ${isUA ? 'Оплатити зараз' : 'Оплатить сейчас'}
            </button>`;
        }

        // --- ЛОГИ ИСТОРИИ ---
        const logsHtml = (order.logs || []).map(log => `
            <div class="log-item" style="display:flex; gap:10px; font-size:12px; margin-bottom:4px;">
                <span style="color:#94a3b8; min-width:120px;">${log.created_at}</span>
                <span style="color:#475569;">${isUA ? log.message_ua : log.message_ru}</span>
            </div>
        `).join('');

        let displayPayStatus = order.payment_status || '—';
        if (displayPayStatus === 'paid') displayPayStatus = 'Оплачено';
        else if (displayPayStatus === 'unpaid') displayPayStatus = isUA ? 'Не сплачено' : 'Не оплачено';
        else if (displayPayStatus === 'waiting') displayPayStatus = isUA ? 'Очікує оплати' : 'Ожидает оплаты';

        // --- ВЫВОД АККОРДЕОНА ---
        return `
        <div class="order-block" id="order-${order.id}">
            <div class="ob-header" onclick="this.parentElement.classList.toggle('is-expanded')" style="cursor:pointer;">
                <div class="ob-info">
                    <span class="ob-id">№ ${order.id}</span>
                    <span class="ob-date">${isUA ? 'від' : 'от'} ${order.created_at}</span>
                </div>
                <div class="ob-actions" style="display:flex; align-items:center;">
                    ${payBtnHtml}
                    <span class="ob-status ${stClass}">${displayStatus}</span>
                    <span class="expand-icon" style="margin-left:10px; font-size:12px;">▼</span>
                </div>
            </div>

            <div class="ob-body">
                <div class="ob-details-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:20px; padding:15px; background:#f8fafc; border-radius:8px; margin-bottom:15px; font-size:13px;">
                    <div>
                        <p><strong>${isUA ? 'Доставка:' : 'Доставка:'}</strong> ${displayDelivery}</p>
                        <p><strong>${isUA ? 'Адреса:' : 'Адрес:'}</strong> ${displayAddress}</p>
                        ${ttnHtml}
                    </div>
                    <div>
                        <p><strong>${isUA ? 'Оплата:' : 'Оплата:'}</strong> ${order.payment_method || '—'}</p>
                        <p><strong>${isUA ? 'Статус оплати:' : 'Статус оплаты:'}</strong> ${displayPayStatus}</p>
                        <div style="margin-top:10px;">${cancelBtnHtml}</div>
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

                <div class="order-history-log" style="margin-top:15px; border-top:1px dashed #cbd5e1; padding-top:10px;">
                    <h4 style="font-size:13px; margin-bottom:8px; color:#1e293b;">${isUA ? 'Історія замовлення' : 'История заказа'}</h4>
                    ${logsHtml || `<p style="color:#94a3b8;">${isUA ? 'Записів немає' : 'Записей нет'}</p>`}
                </div>

                <div class="ob-footer" style="margin-top:10px; border-top:1px solid #eee; padding-top:10px;">
                    <span class="ob-total-label">${TEXT.totalLabel}</span>
                    <span class="ob-total-val">${totalOrderSum.toFixed(2)} ₴</span>
                </div>
            </div>
        </div>
        `;
    }).join('');

    // 3. Пагинация
    let paginationHtml = '';
    if (totalPages > 1) {
        paginationHtml = `<div class="cab-pagination" style="margin-top:20px; display:flex; justify-content:center; align-items:center; gap:5px;">`;

        // Кнопки "В начало" и "Назад"
        paginationHtml += `
            <button class="cab-page-btn" onclick="window.changeOrderPage(1)" ${currentOrderPage === 1 ? 'disabled' : ''} title="${isUA ? 'На початок' : 'В начало'}">«</button>
            <button class="cab-page-btn" onclick="window.changeOrderPage(${currentOrderPage - 1})" ${currentOrderPage === 1 ? 'disabled' : ''}>‹</button>
        `;

        // Логика показа ограниченного количества номеров (макс 5 штук)
        let startPage = Math.max(1, currentOrderPage - 2);
        let endPage = Math.min(totalPages, startPage + 4);

        if (endPage - startPage < 4) {
            startPage = Math.max(1, endPage - 4);
        }

        for (let i = startPage; i <= endPage; i++) {
            const activeClass = (i === currentOrderPage) ? 'active' : '';
            paginationHtml += `<button class="cab-page-btn ${activeClass}" onclick="window.changeOrderPage(${i})">${i}</button>`;
        }

        // Кнопки "Вперед" и "В конец"
        paginationHtml += `
            <button class="cab-page-btn" onclick="window.changeOrderPage(${currentOrderPage + 1})" ${currentOrderPage === totalPages ? 'disabled' : ''}>›</button>
            <button class="cab-page-btn" onclick="window.changeOrderPage(${totalPages})" ${currentOrderPage === totalPages ? 'disabled' : ''} title="${isUA ? 'В кінець' : 'В конец'}">»</button>
        `;

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

// === ЛОГИКА ОПЛАТЫ ЧЕРЕЗ LIQPAY ДЛЯ ПРОФИЛЯ ===
window.payOrderLiqPay = async function(orderId, btnElement) {
    const isUA = document.documentElement.lang === 'uk' || window.location.pathname.includes('/ua/');
    const originalText = btnElement.textContent;
    btnElement.textContent = isUA ? "Завантаження..." : "Загрузка...";
    btnElement.disabled = true;

    try {
        const res = await fetch('/api/liqpay/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId })
        });
        const data = await res.json();

        if (data.success) {
            LiqPayCheckout.init({
                data: data.data,
                signature: data.signature,
                embedTo: "#liqpay_checkout",
                language: isUA ? "uk" : "ru",
                mode: "popup"
            }).on("liqpay.callback", function(callbackData){
                if (['success', 'wait_secure', 'sandbox'].includes(callbackData.status)) {
                    // Делаем небольшую задержку в 1.5 секунды, чтобы сервер успел принять прямой callback от LiqPay
                    setTimeout(async () => {
                        try {
                            const checkRes = await fetch('/api/pay_order', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ order_id: orderId })
                            });
                            const checkData = await checkRes.json();

                            if (checkData.success) {
                                alert(isUA ? "Оплата пройшла успішно!" : "Оплата прошла успешно!");
                            } else {
                                // Если транзакция обрабатывается банком чуть дольше обычного
                                alert(isUA ? "Платіж обробляється банком. Статус оновиться в кабінеті найближчим часом." : "Платеж обрабатывается банком. Статус обновится в кабинете в ближайшее время.");
                            }
                            window.location.reload();
                        } catch (err) {
                            window.location.reload();
                        }
                    }, 1500);
                } else if (['error', 'failure'].includes(callbackData.status)) {
                    alert(isUA ? "Помилка при оплаті. Спробуйте ще раз." : "Ошибка при оплате. Попробуйте еще раз.");
                }
            }).on("liqpay.close", function(){
                btnElement.textContent = originalText;
                btnElement.disabled = false;
            });
        } else {
            alert((isUA ? "Помилка сервера: " : "Ошибка сервера: ") + data.error);
            btnElement.textContent = originalText;
            btnElement.disabled = false;
        }
    } catch (err) {
        console.error("Ошибка при инициализации LiqPay:", err);
        alert(isUA ? "Помилка мережі" : "Ошибка сети");
        btnElement.textContent = originalText;
        btnElement.disabled = false;
    }
};

// ============================================
// SEO + GA4: ДИНАМИЧЕСКИЕ МЕТА-ТЕГИ И VIEW_ITEM
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Проверяем, что мы на странице товара
    if (!window.location.pathname.includes('product.html')) return;

    // 2. Получаем ID товара из URL
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('id');
    if (!productId) return;

    // 3. Определяем язык
    const langAttr = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    const isUA = langAttr.startsWith('uk') || langAttr === 'ua' || window.location.pathname.includes('/ua/');
    const storeKey = isUA ? 'rb_catalog_v1_ua' : 'rb_catalog_v1_ru';

    // Функция отправки события в Google Analytics 4
    function trackGA4ViewItem(product) {
        if (!product) return;
        const price = parseFloat(product.price || 0);
        pushGA4Event('view_item', [{
            item_id: String(product.sku || product.id),
            item_name: product.title || product.title_ru || '',
            price: price,
            quantity: 1,
            item_category: product.category || 'general'
        }], price);
    }

    // 4. Функция обновления мета-тегов
    function updateSEO(product) {
        if (!product) return;

        // --- TITLE ---
        let pageTitle = product.seo_title;
        if (!pageTitle) {
             pageTitle = (product.title || product.title_ru || 'RadioBox') + " | Купити в RadioBox";
        }
        document.title = pageTitle;

        // --- DESCRIPTION ---
        let pageDesc = product.seo_description;
        if (!pageDesc) {
             const rawDesc = product.description || product.description_ru || "";
             const cleanDesc = rawDesc.replace(/<[^>]*>?/gm, '');
             pageDesc = cleanDesc.substring(0, 160) + "...";
        }

        let metaDesc = document.querySelector('meta[name="description"]');
        if (!metaDesc) {
            metaDesc = document.createElement('meta');
            metaDesc.name = "description";
            document.head.appendChild(metaDesc);
        }
        metaDesc.content = pageDesc;

        // Open Graph
        let ogTitle = document.querySelector('meta[property="og:title"]');
        if (!ogTitle) {
             ogTitle = document.createElement('meta'); ogTitle.setAttribute('property', 'og:title'); document.head.appendChild(ogTitle);
        }
        ogTitle.content = pageTitle;

        let ogDesc = document.querySelector('meta[property="og:description"]');
        if (!ogDesc) {
             ogDesc = document.createElement('meta'); ogDesc.setAttribute('property', 'og:description'); document.head.appendChild(ogDesc);
        }
        ogDesc.content = pageDesc;

        if (product.image || (product.images && product.images[0])) {
             let ogImg = document.querySelector('meta[property="og:image"]');
             if (!ogImg) {
                 ogImg = document.createElement('meta'); ogImg.setAttribute('property', 'og:image'); document.head.appendChild(ogImg);
             }
             let imgPath = product.image || product.images[0];
             if (imgPath.startsWith('/')) imgPath = window.location.origin + imgPath;
             ogImg.content = imgPath;
        }
    }

    // 5. Пытаемся найти товар
    // Сценарий А: Товар есть в LocalStorage
    try {
        const raw = localStorage.getItem(storeKey);
        if (raw) {
            const data = JSON.parse(raw);
            const product = data.items.find(p => p.id == productId);
            if (product) {
                updateSEO(product);
                trackGA4ViewItem(product); // <-- ОТПРАВЛЯЕМ VIEW_ITEM
                return;
            }
        }
    } catch (e) {}

    // Сценарий Б: Товара нет в LocalStorage -> Запрашиваем с сервера
    fetch('/api/products')
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                const product = data.items.find(p => p.id == productId);
                if (product) {
                    const finalProduct = {
                        ...product,
                        title: isUA ? (product.title_ua || product.title_ru) : product.title_ru,
                        description: isUA ? (product.description_ua || product.description_ru) : product.description_ru
                    };
                    updateSEO(finalProduct);
                    trackGA4ViewItem(finalProduct); // <-- ОТПРАВЛЯЕМ VIEW_ITEM
                }
            }
        })
        .catch(console.error);
});

// ============================================
// ЗАГРУЗКА ПОДВАЛА (FOOTER)
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    const placeholder = document.getElementById('footer-placeholder');
    // Если на странице нет места под футер — выходим
    if (!placeholder) return;

    // Просто ищем папку components рядом с текущим HTML файлом
    fetch('components/footer.html')
        .then(response => {
            if (!response.ok) throw new Error('Footer not found');
            return response.text();
        })
        .then(html => {
            placeholder.innerHTML = html;

            // Авто-обновление года (чтобы не менять руками)
            const copyEl = placeholder.querySelector('.copy');
            if (copyEl) {
                const year = new Date().getFullYear();
                copyEl.innerHTML = copyEl.innerHTML.replace(/\d{4}/, year);
            }
        })
        .catch(err => console.error('Ошибка загрузки подвала:', err));
});

// ============================================
// ЗАГРУЗКА ШАПКИ (HEADER) — УНИВЕРСАЛЬНАЯ ВЕРСИЯ
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    const placeholder = document.getElementById('header-placeholder');
    if (!placeholder) return;

    // Универсальный путь: ищем папку components рядом с текущим HTML файлом
    fetch('components/header.html')
        .then(response => {
            if (!response.ok) throw new Error('Header not found');
            return response.text();
        })
        .then(html => {
            placeholder.innerHTML = html;
            initHeaderInteractivity(); // Запускаем логику шапки
            loadHeaderCategories();
        })
        .catch(err => console.error('Ошибка загрузки шапки:', err));

    // --- ФУНКЦИЯ ОЖИВЛЕНИЯ ШАПКИ ---
    function initHeaderInteractivity() {

        syncSessionWithLocalStorage();

        const isUA = document.documentElement.lang === 'uk' || location.pathname.includes('/ua/');

        // === АВТОМАТИЧЕСКАЯ УСТАНОВКА ФАВИКОНКИ ===
        if (!document.querySelector("link[rel='icon']")) {
            const favicon = document.createElement('link');
            favicon.rel = 'icon';
            favicon.type = 'image/png';
            // Путь учитывает вложенность (для папок ru/ua поднимется на уровень выше)
            const isSubfolder = location.pathname.includes('/ru/') || location.pathname.includes('/ua/');
            favicon.href = (isSubfolder ? '../' : '') + 'assets/4024808380_w170_h85_internet-magazin-radiobox_logo.png';
            document.head.appendChild(favicon);
        }

        // 1. === СЧЕТЧИК ОТЗЫВОВ (С СЕРВЕРА) ===
        const reviewsLink = document.querySelector('.reviews .link');
        if (reviewsLink) {
            fetch('/api/reviews/count')
                .then(r => r.json())
                .then(data => {
                    if (data.success && data.count > 0) {
                        const n = data.count;
                        const plural = (n, one, few, many) => {
                            const n10 = n % 10, n100 = n % 100;
                            if (n10 === 1 && n100 !== 11) return one;
                            if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
                            return many;
                        };
                        const txt = isUA
                            ? `${n} ${plural(n, 'відгук', 'відгуки', 'відгуків')}`
                            : `${n} ${plural(n, 'отзыв', 'отзыва', 'отзывов')}`;

                        reviewsLink.textContent = txt;
                        reviewsLink.style.visibility = 'visible';
                        reviewsLink.style.opacity = '1';
                    } else {
                        // Если 0, можно скрыть или написать "0 отзывов"
                        reviewsLink.textContent = isUA ? 'Відгуки' : 'Отзывы';
                        reviewsLink.style.visibility = 'visible';
                        reviewsLink.style.opacity = '1';
                    }
                })
                .catch(e => console.error('Ошибка загрузки счетчика:', e));
        }

        // 2. === ГРАФИК РАБОТЫ (MODAL) ===
        const workBtn = document.querySelector('.worktime a');
        const workModal = document.querySelector('.hours-modal');
        if (workBtn && workModal) {
            workBtn.addEventListener('click', (e) => {
                e.preventDefault();
                workModal.classList.add('is-open');
                document.body.classList.add('is-hours-open');
            });
            // Дублируем закрытие для надежности
            workModal.querySelectorAll('[data-hours-close]').forEach(btn => {
                btn.addEventListener('click', () => {
                    workModal.classList.remove('is-open');
                    document.body.classList.remove('is-hours-open');
                });
            });
        }

        // 3. === ИМЯ ПОЛЬЗОВАТЕЛЯ (АВТОРИЗАЦИЯ) ===
        const reviewsBlock = document.querySelector('.topbar-inner .reviews');
        if (reviewsBlock) {
            const iconUser = `<span class="icon" aria-hidden="true" style="width:16px;height:16px;display:inline-block;background:url('data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%23cfd3d7\\' stroke-width=\\'2\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' %3E%3Cpath d=\\'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2\\'/%3E%3Ccircle cx=\\'12\\' cy=\\'7\\' r=\\'4\\'/%3E%3C/svg%3E') center/contain no-repeat;"></span>`;

            let user = null;
            try { user = JSON.parse(localStorage.getItem('rb_session_v1')); } catch {}

            // Удаляем старые, чтобы не дублировалось
            document.querySelectorAll('.auth-user').forEach(el => el.remove());

            if (user) {
                const html = `
                <div class="auth-user" id="userMenuTrigger" style="cursor:pointer; display:flex; align-items:center; gap:6px;">
                    ${iconUser}
                    <span class="link" style="border-bottom:1px dotted transparent;">${user.name} ${user.surname || ''}</span>
                </div>`;
                reviewsBlock.insertAdjacentHTML('beforebegin', html);
            } else {
                const txtLogin = isUA ? "Вхід" : "Вход";
                const txtReg = isUA ? "Реєстрація" : "Регистрация";
                const html = `
                <div class="auth-user" style="display:flex; align-items:center; gap:6px;">
                    ${iconUser}
                    <a href="#" class="link" data-auth-trigger="login">${txtLogin}</a>
                    <span class="sep">|</span>
                    <a href="#" class="link" data-auth-trigger="register">${txtReg}</a>
                </div>`;
                reviewsBlock.insertAdjacentHTML('beforebegin', html);
            }
        }

        // 4. === ЯЗЫКИ И АКТИВНОЕ МЕНЮ ===
        const currentFile = location.pathname.split('/').pop() || 'index.html';

        // Языки (Исправлено: сохраняем параметры ?cat= и ?sub=)
        document.querySelectorAll('.lang-link').forEach(link => {
            const lang = link.dataset.lang;
            const currentParams = window.location.search; // Получаем ?cat=...&sub=...

            if (lang === 'uk') {
                link.href = isUA ? '#' : `../ua/${currentFile}${currentParams}`;
                if (isUA) link.setAttribute('aria-current', 'page');
            } else {
                link.href = isUA ? `../ru/${currentFile}${currentParams}` : '#';
                if (!isUA) link.setAttribute('aria-current', 'page');
            }
        });

        // Меню
        const menuLinks = document.querySelectorAll(".main-nav a[href]");
        const currentPath = currentFile.toLowerCase();
        menuLinks.forEach(a => {
            const href = a.getAttribute("href").split('/').pop().toLowerCase();
            if (href === currentPath) {
                a.classList.add("active");
                a.setAttribute("aria-current", "page");
            }
        });

        // 5. === КОРЗИНА ===
        if (window.rbCartRender) window.rbCartRender();

        const drawer = document.querySelector('.cart-drawer');
        const openers = document.querySelectorAll('[data-cart-open]');
        const closers = document.querySelectorAll('[data-cart-close]');
        const panel = drawer ? drawer.querySelector('.cart-drawer__panel') : null;

        if (drawer) {
            const openDrawer = () => {
                if (window.rbCartRender) window.rbCartRender();
                drawer.classList.add('is-open');
                document.body.classList.add('is-cart-open');
            };
            const closeDrawer = () => {
                drawer.classList.remove('is-open');
                document.body.classList.remove('is-cart-open');
            };
            openers.forEach(btn => btn.addEventListener('click', (e) => { e.preventDefault(); openDrawer(); }));
            closers.forEach(btn => btn.addEventListener('click', (e) => { e.preventDefault(); closeDrawer(); }));
            drawer.addEventListener('click', (e) => { if (panel && !panel.contains(e.target)) closeDrawer(); });
        }

        // 6. === ЖИВОЙ ПОИСК И ОТПРАВКА (ЧЕРЕЗ API) ===
        const searchInput = document.querySelector('.search-wide input');
        const searchForm = document.querySelector('.search-wide');

        if (searchInput && searchForm) {
            // --- А. ОБРАБОТКА ОТПРАВКИ (Enter или Кнопка) ---
            searchForm.addEventListener('submit', function(e) {
                e.preventDefault(); // 1. Отменяем перезагрузку страницы

                const query = searchInput.value.trim();
                if (query.length < 1) return; // Пустой поиск не отправляем

                // 2. Определяем язык (куда перенаправлять: в ru или ua)
                const isUA = document.documentElement.lang === 'uk' || location.pathname.includes('/ua/');
                const targetPage = isUA ? '/ua/search.html' : '/ru/search.html';

                // 3. Переходим на страницу поиска
                window.location.href = `${targetPage}?q=${encodeURIComponent(query)}`;
            });

            // --- Б. ЖИВОЙ ПОИСК (Выпадающий список) ---
            // 1. Создаем контейнер для выпадающего списка, если его нет
            let dropdown = searchForm.querySelector('.search-results-dropdown');
            if (!dropdown) {
                dropdown = document.createElement('div');
                dropdown.className = 'search-results-dropdown';
                searchForm.appendChild(dropdown);
            }

            let debounceTimer;

            searchInput.addEventListener('input', function(e) {
                const query = e.target.value.trim();

                // Очищаем старый таймер
                clearTimeout(debounceTimer);

                if (query.length < 2) {
                    dropdown.classList.remove('active');
                    dropdown.innerHTML = '';
                    return;
                }

                // Ждем 300мс
                debounceTimer = setTimeout(async () => {
                    try {
                        // ЗАПРОС К СЕРВЕРУ
                        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
                        const data = await res.json();

                        dropdown.innerHTML = '';

                        if (data.success && data.results.length > 0) {
                            const topResults = data.results.slice(0, 5);

                            topResults.forEach(item => {
                                const isUA = document.documentElement.lang === 'uk';
                                const title = isUA ? (item.title_ua || item.title_ru) : item.title_ru;
                                const img = (item.images && item.images.length > 0) ? item.images[0] : '/assets/icons/company.png';

                                const link = document.createElement('a');
                                link.href = `product.html?id=${item.id}`;
                                link.className = 'search-result-item';
                                link.innerHTML = `
                                    <img src="${img}" class="search-result-thumb" alt="">
                                    <div class="search-result-info">
                                        <div class="search-result-name">${title}</div>
                                        <div class="search-result-price">${item.price} ₴</div>
                                    </div>
                                `;
                                dropdown.appendChild(link);
                            });
                            dropdown.classList.add('active');
                        } else {
                            dropdown.classList.remove('active');
                        }
                    } catch (err) {
                        console.error("Ошибка живого поиска:", err);
                    }
                }, 300);
            });

            // Скрываем список при клике мимо
            document.addEventListener('click', function(e) {
                if (!searchForm.contains(e.target)) {
                    dropdown.classList.remove('active');
                }
            });
        }
    }
});

// ============================================
// 3. ЗАГРУЗКА САЙДБАРА (ДИНАМИЧЕСКИЕ КАТЕГОРИИ + СТАТИЧНЫЕ ССЫЛКИ)
// ============================================
document.addEventListener("DOMContentLoaded", () => {
    loadSidebar();
});

async function loadSidebar() {
    // 1. Ищем место для вставки
    // Поддержка обоих ID, о которых мы говорили
    const target = document.getElementById('sidebar-container') || document.getElementById('sidebar-placeholder');

    if (!target) return;

    try {
        // 2. Загружаем HTML-каркас (Меню, О нас, Контакты)
        const response = await fetch('components/sidebar.html');
        if (!response.ok) throw new Error('Не удалось загрузить sidebar.html');

        const html = await response.text();
        target.innerHTML = html;

        loadDynamicContacts()

        // 3. Загружаем категории из Админки и вставляем их в раздел "Товары"
        await loadDynamicCategories();

        // 4. Оживляем кнопки и подсветку (только когда всё загружено)
        initSidebarAccordion();
        highlightCurrentPage();

    } catch (error) {
        console.error('Ошибка сайдбара:', error);
    }
}

// Функция загрузки категорий из API
async function loadDynamicCategories() {
    const rootUl = document.getElementById('catalog-root');
    if (!rootUl) return;

    const langAttr = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    const isUA = langAttr.startsWith('uk') || langAttr === 'ua' || location.pathname.includes('/ua/');

    try {
        const res = await fetch('/api/categories');
        const data = await res.json();

        if (!data.success || !data.categories.length) {
            rootUl.innerHTML = `<li style="padding:5px 20px; font-size:12px; color:#999;">${isUA ? 'Немає категорій' : 'Нет категорий'}</li>`;
            return;
        }

        const cats = data.categories.sort((a, b) => a.position - b.position);

        // Вспомогательная функция для сборки дерева
        function buildTree(parentSlug = null) {
            const currentLevel = cats.filter(c => (c.parent_slug || null) === parentSlug);
            let html = '';

            currentLevel.forEach(cat => {
                const title = isUA ? (cat.title_ua || cat.title_ru) : cat.title_ru;
                const hasChildren = cats.some(child => child.parent_slug === cat.slug);

                if (hasChildren) {
                    // Если есть дети, рисуем аккордеон
                    html += `
                    <li class="has-accordion">
                        <div class="menu-row">
                            <button type="button" class="menu-toggle" aria-expanded="false" aria-label="${isUA ? 'Розгорнути' : 'Развернуть'}"></button>
                            <a href="type_of_product.html?cat=${cat.slug}" class="submenu-link">${title}</a>
                        </div>
                        <div class="submenu" hidden>
                            <ul class="submenu-list">
                                ${buildTree(cat.slug)}
                            </ul>
                        </div>
                    </li>`;
                } else {
                    // Если детей нет, просто ссылка
                    // Если это под-подкатегория, добавим в ссылку и родителя для корректной фильтрации
                    const parentParam = cat.parent_slug ? `&sub=${cat.slug}` : '';
                    const url = cat.parent_slug
                        ? `type_of_product.html?cat=${cat.parent_slug}${parentParam}`
                        : `type_of_product.html?cat=${cat.slug}`;

                    html += `<li><a href="${url}" class="submenu-link">${title}</a></li>`;
                }
            });
            return html;
        }

        rootUl.innerHTML = buildTree(null);

    } catch (e) {
        console.error("Ошибка API категорий:", e);
        rootUl.innerHTML = `<li style="color:red; font-size:12px; padding:10px;">Error loading API</li>`;
    }
}

// Функция работы аккордеона (клики по стрелочкам)
function initSidebarAccordion() {
    // Используем делегирование, чтобы работало и для статики, и для динамики
    const container = document.getElementById('sidebar-container') || document.getElementById('sidebar-placeholder');
    if (!container) return;

    container.addEventListener('click', (e) => {
        // Нас интересует только клик по кнопке .menu-toggle
        const btn = e.target.closest('.menu-toggle');
        if (!btn) return;

        e.preventDefault();

        // 1. Ищем, чем управляет эта кнопка
        // Сначала пробуем найти по aria-controls (для статического меню)
        let contentId = btn.getAttribute('aria-controls');
        let content = contentId ? document.getElementById(contentId) : null;

        // Если по ID не нашли, ищем ближайшее меню рядом (для динамического меню)
        if (!content) {
             const row = btn.closest('.menu-row');
             if (row) {
                 content = row.nextElementSibling; // div.submenu обычно идет сразу за .menu-row
             }
        }

        // Если контент нашли — переключаем
        if (content) {
            const isExpanded = btn.getAttribute('aria-expanded') === 'true';
            btn.setAttribute('aria-expanded', !isExpanded);
            content.hidden = isExpanded;

            // Добавляем класс родителю (для поворота стрелки через CSS, если настроено)
            const parentLi = btn.closest('.has-accordion');
            if (parentLi) {
                if (!isExpanded) parentLi.classList.add('open');
                else parentLi.classList.remove('open');
            }
        }
    });
}

// Подсветка активной страницы
function highlightCurrentPage() {
    const currentPath = window.location.pathname.split('/').pop().toLowerCase() || 'index.html';
    const urlParams = new URLSearchParams(window.location.search);
    const currentCat = urlParams.get('cat');
    const currentSub = urlParams.get('sub');

    const links = document.querySelectorAll('.menu-link, .submenu-link');

    links.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;

        // Парсим ссылку
        const linkUrl = new URL(href, window.location.origin);
        const linkPath = linkUrl.pathname.split('/').pop().toLowerCase();
        const linkCat = linkUrl.searchParams.get('cat');
        const linkSub = linkUrl.searchParams.get('sub');

        let isActive = false;

        // Если это страница каталога
        if (currentPath.includes('type_of_product') && linkPath.includes('type_of_product')) {
            if (currentSub) {
                if (linkCat === currentCat && linkSub === currentSub) isActive = true;
            } else {
                if (linkCat === currentCat && !linkSub) isActive = true;
            }
        }
        // Для обычных страниц
        else if (currentPath === linkPath) {
            isActive = true;
        }

        // Если это главная страница (index.html), а ссылка просто products.html - не подсвечиваем
        // Но если мы на products.html - подсвечиваем "Товары"
        if (currentPath === 'products.html' && linkPath === 'products.html') isActive = true;


        if (isActive) {
            link.classList.add('active');

            // Раскрываем всех родителей
            let parent = link.closest('.submenu');
            while (parent) {
                parent.hidden = false;

                // Ищем кнопку управления этим меню и поворачиваем её
                // (кнопка может быть выше в DOM или в предыдущем элементе)
                let li = parent.closest('li'); // или .has-accordion
                if (li) {
                    li.classList.add('open');
                    const btn = li.querySelector('.menu-toggle');
                    if (btn) btn.setAttribute('aria-expanded', 'true');
                }

                // Идем выше, вдруг вложенность 3 уровня
                parent = li.parentElement.closest('.submenu');
            }
        }
    });
}

// Функция загрузки категорий в ШАПКУ (только главные)
async function loadHeaderCategories() {
    const rootUl = document.getElementById('header-catalog-root');
    if (!rootUl) return; // Если в шапке нет этого списка, выходим

    // Определяем язык
    const langAttr = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    const isUA = langAttr.startsWith('uk') || langAttr === 'ua' || location.pathname.includes('/ua/');

    try {
        const res = await fetch('/api/categories');
        const data = await res.json();

        if (data.success && data.categories.length) {
            // 1. Сортируем
            const cats = data.categories.sort((a, b) => a.position - b.position);

            // 2. Фильтруем: берем ТОЛЬКО главные (у которых нет parent_slug)
            const roots = cats.filter(c => !c.parent_slug);

            // 3. Генерируем HTML
            const html = roots.map(cat => {
                const title = isUA ? (cat.title_ua || cat.title_ru) : cat.title_ru;
                // Ссылка такая же, как в сайдбаре
                return `<li><a href="type_of_product.html?cat=${cat.slug}">${title}</a></li>`;
            }).join('');

            rootUl.innerHTML = html;
        }
    } catch (e) {
        console.error("Ошибка загрузки категорий в шапке:", e);
        // Можно оставить "Загрузка..." или скрыть
    }
}

// ===== ГЛОБАЛЬНАЯ ФУНКЦИЯ: ИСПРАВЛЕНИЕ РАСКЛАДКИ =====
window.fixKeyboardLayout = function(str) {
    const replacer = {
        "q":"й", "w":"ц", "e":"у", "r":"к", "t":"е", "y":"н", "u":"г", "i":"ш", "o":"щ", "p":"з", "[":"х", "]":"ъ",
        "a":"ф", "s":"ы", "d":"в", "f":"а", "g":"п", "h":"р", "j":"о", "k":"л", "l":"д", ";":"ж", "'":"э",
        "z":"я", "x":"ч", "c":"с", "v":"м", "b":"и", "n":"т", "m":"ь", ",":"б", ".":"ю", "/":".", "`": "ё",
        "Q":"Й", "W":"Ц", "E":"У", "R":"К", "T":"Е", "Y":"Н", "U":"Г", "I":"Ш", "O":"Щ", "P":"З", "{":"Х", "}":"Ъ",
        "A":"Ф", "S":"Ы", "D":"В", "F":"А", "G":"П", "H":"Р", "J":"О", "K":"Л", "L":"Д", ":":"Ж", '"':"Э",
        "Z":"Я", "X":"Ч", "C":"С", "V":"М", "B":"И", "N":"Т", "M":"Ь", "<":"Б", ">":"Ю", "?":",", "~":"Ё"
    };

    // Экранируем спецсимволы в регулярке, чтобы не было ошибок
    return str.replace(/[a-zA-Z\[\];',.\/`{}":<>?~]/g, function (x) {
        return replacer[x] || replacer[x.toLowerCase()] || x;
    });
};

// Вставь это в самый конец script.js

(function() {
    // Функция 1: Синхронизация названий на ГЛАВНОЙ (index.html)
    async function syncHomeCategories() {
        const grid = document.querySelector('.groups__grid');
        // Если это страница с id "all-categories-grid", значит мы в продуктах, выходим
        if (!grid || document.getElementById('all-categories-grid')) return;

        try {
            const res = await fetch('/api/categories');
            const data = await res.json();
            if (!data.success) return;

            const langAttr = (document.documentElement.getAttribute('lang') || '').toLowerCase();
            const isUA = langAttr.startsWith('uk') || langAttr === 'ua' || location.pathname.includes('/ua/');

            document.querySelectorAll('.group-card').forEach(card => {
                const urlString = card.getAttribute('href');
                if (!urlString) return;

                const match = urlString.match(/cat=([^&]+)/);
                if (!match) return;
                const catSlug = match[1];

                const categoryData = data.categories.find(c => c.slug === catSlug);
                if (categoryData) {
                    const titleEl = card.querySelector('.group-card__title');
                    if (titleEl) {
                        const newTitle = isUA ? (categoryData.title_ua || categoryData.title_ru) : categoryData.title_ru;
                        titleEl.textContent = newTitle.toUpperCase();
                    }
                }
            });
        } catch (e) { console.error("Ошибка синхронизации:", e); }
    }

    // Функция 2: Динамическая отрисовка на странице ПРОДУКТОВ (products.html)
    async function renderAllCategories() {
        const grid = document.getElementById('all-categories-grid');
        if (!grid) return;

        try {
            const res = await fetch('/api/categories');
            const data = await res.json();
            if (!data.success) return;

            const langAttr = (document.documentElement.getAttribute('lang') || '').toLowerCase();
            const isUA = langAttr.startsWith('uk') || langAttr === 'ua' || location.pathname.includes('/ua/');

            const roots = data.categories.filter(c => !c.parent_slug);

            grid.innerHTML = roots.map(cat => {
            const title = isUA ? (cat.title_ua || cat.title_ru) : cat.title_ru;

            // ПРОВЕРКА: Если в базе есть image_url — берем его.
            // Если нет — берем нейтральную иконку компании, а не паяльник.
            const imgSrc = (cat.image_url && cat.image_url.trim() !== '')
            ? cat.image_url
            : `../assets/icons/company.png`;

            return `
                <a class="group-card" href="type_of_product.html?cat=${cat.slug}">
                    <div class="group-card__img">
                        <img src="${imgSrc}" alt="${title}">
                    </div>
                    <div class="group-card__title">${title.toUpperCase()}</div>
                </a>
            `;
        }).join('');
        } catch (e) { console.error("Ошибка рендера:", e); }
    }

    // Запуск обеих функций при загрузке
    document.addEventListener('DOMContentLoaded', () => {
        syncHomeCategories();
        renderAllCategories();
    });
})();

async function loadHomeCategories() {
    const container = document.getElementById('categoriesContainer'); // Убедитесь, что такой ID есть в index.html
    if (!container) return;

    try {
        const res = await fetch('/api/categories');
        const data = await res.json();

        if (data.success) {
            // Фильтруем только корневые категории (у которых нет parent_slug)
            const rootCats = data.categories.filter(c => !c.parent_slug);
            const isUA = document.documentElement.lang === 'uk';

            container.innerHTML = rootCats.map(c => {
                const title = isUA ? (c.title_ua || c.title_ru) : c.title_ru;
                // Используем ваше новое поле image_url
                const img = c.image_url || '/assets/no-photo.png';

                return `
                <div class="category-card">
                    <a href="/${isUA ? 'ua' : 'ru'}/products.html?category=${c.slug}">
                        <img src="${img}" alt="${title}">
                        <h3>${title}</h3>
                    </a>
                </div>`;
            }).join('');
        }
    } catch (e) {
        console.error("Ошибка загрузки категорий:", e);
    }
}

// === СИНХРОНИЗАЦИЯ СЕССИИ СЕРВЕРА И БРАУЗЕРА ===
async function syncSessionWithLocalStorage() {
    const SESSION_KEY = 'rb_session_v1';
    try {
        const res = await fetch('/api/user/status');
        const data = await res.json();

        let localUser = null;
        try {
            const raw = localStorage.getItem(SESSION_KEY);
            localUser = raw ? JSON.parse(raw) : null;
        } catch(e) {}

        if (data.is_logged_in) {
            // Если на сервере сессия есть, а в браузере пусто ИЛИ ID не совпадает
            if (!localUser || localUser.id !== data.user.id) {
                console.log("Синхронизация: данные сессии обновлены.");
                localStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
                location.reload();
            }
        } else {
            // Если на сервере сессия пуста (вышли), а в браузере мы "в аккаунте"
            if (localUser) {
                console.log("Синхронизация: сессия завершена.");
                localStorage.removeItem(SESSION_KEY);
                location.reload();
            }
        }
    } catch (e) {
        console.error("Sync error:", e);
    }
}

async function loadDynamicContacts() {
    try {
        const res = await fetch('/api/public/contacts');
        const data = await res.json();

        if (!data.success) return;

        // Определяем язык (украинский или русский)
        const isUA = (document.documentElement.getAttribute("lang") || "").toLowerCase().startsWith("uk") || /\/ua\//i.test(location.pathname);
        const currentAddress = isUA ? data.address_ua : data.address_ru;

        // --- 1. ОБНОВЛЯЕМ АДРЕС (Сайдбар, Контакты, Чекаут) ---
        const addrIds = ['sidebar-address', 'page-address', 'checkout-pickup-address'];
        addrIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = currentAddress;
        });

        // --- 2. ОБНОВЛЯЕМ ТЕЛЕФОНЫ ---
        if (data.phones && data.phones.length > 0) {
            // В сайдбаре
            const sidebarCont = document.getElementById('sidebar-phones-list');
            if (sidebarCont) {
                sidebarCont.innerHTML = data.phones.map(p => `
                    <div>
                        <span class="ci ci-phone"></span>
                        <a href="tel:${p.number.replace(/\D/g, '')}">${p.number}</a>
                        ${p.is_viber ? `<img src="../assets/icons/viber_under_cursor.png" width="14" style="margin-left:5px; vertical-align:middle;">` : ''}
                    </div>
                `).join('');
            }

            // На странице Контактов
            const pageCont = document.getElementById('page-phones-list');
            if (pageCont) {
                pageCont.innerHTML = data.phones.map(p => `
                    <a href="tel:${p.number.replace(/\D/g, '')}">${p.number} ${p.is_viber ? '(Viber)' : ''}</a>
                `).join('');
            }

            // --- 3. ОБНОВЛЯЕМ VIBER ---
            const viberEntry = data.phones.find(p => p.is_viber);
            if (viberEntry) {
                const cleanNumber = viberEntry.number.replace(/\D/g, '');
                document.querySelectorAll('a[href^="viber://"]').forEach(link => {
                    link.href = "viber://pa?chatURI=radiobox";
                });
            }
        }
    } catch (e) {
        console.error("Ошибка при динамической загрузке контактов:", e);
    }
}

function toggleMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    if (!menu) return;

    const isOpen = menu.classList.toggle('is-open');
    document.body.style.overflow = isOpen ? 'hidden' : '';
    menu.setAttribute('aria-hidden', !isOpen);
}


// ============================================
// ЧАТ С МЕНЕДЖЕРОМ (WebSockets)
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Ждем, пока подгрузится footer.html
    const observer = new MutationObserver((mutations, obs) => {
        const chatToggleBtn = document.getElementById('chat-toggle-btn');
        if (chatToggleBtn) {
            initChatWidget();
            obs.disconnect(); // Останавливаем наблюдение, когда нашли кнопку
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    function initChatWidget() {
        const chatWidget = document.getElementById('chat-widget');
        const chatToggleBtn = document.getElementById('chat-toggle-btn');
        const chatCloseBtn = document.getElementById('chat-close-btn');
        const chatMessages = document.getElementById('chat-messages');
        const chatInput = document.getElementById('chat-input');
        const chatSendBtn = document.getElementById('chat-send-btn');

        let socket = null;
        let ticketId = null;
        let isSocketLoaded = false;

        let clientId = localStorage.getItem('chat_client_id');
        if (!clientId) {
            clientId = 'client_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('chat_client_id', clientId);
        }

        const currentLang = window.location.pathname.includes('/ua/') ? 'ua' : 'ru';

        // Открытие/Закрытие чата
        chatToggleBtn.addEventListener('click', () => {
            chatWidget.classList.toggle('hidden');
            if (!chatWidget.classList.contains('hidden') && !socket) {
                loadSocketIOAndConnect();
            }
        });

        chatCloseBtn.addEventListener('click', () => {
            chatWidget.classList.add('hidden');
        });

        // Динамическая загрузка Socket.IO
        function loadSocketIOAndConnect() {
            if (isSocketLoaded) return;
            chatMessages.innerHTML = '<div style="text-align:center; padding:10px; color:#888;">Подключение...</div>';

            const script = document.createElement('script');
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.2/socket.io.min.js";
            script.onload = () => {
                isSocketLoaded = true;
                startChatSession();
            };
            document.head.appendChild(script);
        }

        async function startChatSession() {
            try {
                const response = await fetch('/api/chat/init', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ client_id: clientId })
                });
                const data = await response.json();

                if (data.success) {
                    ticketId = data.ticket_id;
                    await loadHistory(ticketId);
                    connectSocket();
                }
            } catch (error) {
                console.error("Ошибка инициализации чата:", error);
                chatMessages.innerHTML = '<div style="color:red; text-align:center;">Ошибка подключения</div>';
            }
        }

        async function loadHistory(id) {
            const res = await fetch(`/api/chat/history/${id}`);
            const data = await res.json();
            if (data.success) {
                chatMessages.innerHTML = '';
                if (data.messages.length === 0) {
                    const welcomeTxt = currentLang === 'ua' ? 'Напишіть нам, якщо у вас є запитання!' : 'Напишите нам, если у вас есть вопросы!';
                    chatMessages.innerHTML = `<div style="text-align:center; color:#888; font-size:12px; margin-top:10px;">${welcomeTxt}</div>`;
                } else {
                    data.messages.forEach(msg => appendMessage(msg));
                }
                scrollToBottom();
            }
        }

        function connectSocket() {
            socket = io();

            // Подключение и вход в комнату
            socket.on('connect', () => {
                socket.emit('join', { ticket_id: ticketId });
            });

            // Прием новых сообщений
            socket.on('receive_message', (msg) => {
                if (String(msg.ticket_id) === String(ticketId)) {
                    // Убираем приветственное сообщение, если оно есть
                    if (chatMessages.innerHTML.includes('Напишите нам') || chatMessages.innerHTML.includes('Напишіть нам')) {
                        chatMessages.innerHTML = '';
                    }
                    appendMessage(msg);
                    scrollToBottom();
                }
            });

            // Слушаем событие удаления чата менеджером
            socket.on('ticket_deleted', (data) => {
                if (String(data.ticket_id) === String(ticketId)) {
                    const deletedMsg = currentLang === 'ua'
                        ? 'Чат завершено та видалено менеджером.'
                        : 'Чат завершен и удален менеджером.';

                    chatMessages.innerHTML = `<div style="text-align:center; padding:15px; color:#ef4444; font-weight:bold; font-size:12px;">${deletedMsg}</div>`;

                    // Сбрасываем ID. Если клиент напишет снова, создастся новый тикет
                    ticketId = null;
                    localStorage.removeItem('chat_client_id'); // Очищаем старый ID из памяти

                    // Генерируем новый ID на будущее
                    clientId = 'client_' + Math.random().toString(36).substr(2, 9);
                    localStorage.setItem('chat_client_id', clientId);
                }
            });
        }

        function appendMessage(msg) {
            const div = document.createElement('div');
            div.className = `chat-bubble ${msg.sender === 'client' ? 'client' : 'manager'}`;
            div.innerHTML = `<p>${msg.text}</p><span class="time">${msg.created_at.substring(11, 16)}</span>`;
            chatMessages.appendChild(div);
        }

        function scrollToBottom() {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function sendMessage() {
            const text = chatInput.value.trim();
            if (!text || !socket) return;

            socket.emit('send_message', {
                ticket_id: ticketId,
                sender: 'client',
                text: text,
                lang: currentLang
            });

            chatInput.value = '';
        }

        chatSendBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });

        // Перехват клика по ссылке "График работы" из автоответа
        chatMessages.addEventListener('click', (e) => {
            if (e.target.classList.contains('open-schedule-modal')) {
                e.preventDefault();
                const workModal = document.querySelector('.hours-modal');
                if (workModal) {
                    workModal.classList.add('is-open');
                    document.body.classList.add('is-hours-open');
                }
            }
        });
    }
});