const Admin = {
    lang: 'ru',

    // Храним текущие фильтры
    searchQuery: '',
    filterStatus: '',
    filterDateFrom: '',
    filterDateTo: '',
    sortField: 'date',
    sortDir: 'desc',

    init: function() {
        this.lang = document.documentElement.lang === 'uk' ? 'ua' : 'ru';
        console.log("Admin panel loaded. Lang:", this.lang);
        this.loadOrders();
    },

    // --- ФИЛЬТРЫ И СОРТИРОВКА ---
    onSearchInput: function(val) {
        this.searchQuery = val.trim();
        this.loadOrders();
    },

    applyFilter: function() {
        this.filterStatus = document.getElementById('f_status').value;
        this.filterDateFrom = document.getElementById('f_date_from').value;
        this.filterDateTo = document.getElementById('f_date_to').value;
        this.loadOrders();
    },

    resetFilters: function() {
        document.getElementById('f_search').value = '';
        document.getElementById('f_status').value = '';
        document.getElementById('f_date_from').value = '';
        document.getElementById('f_date_to').value = '';

        this.searchQuery = '';
        this.filterStatus = '';
        this.filterDateFrom = '';
        this.filterDateTo = '';
        this.loadOrders();
    },

    sortBy: function(field) {
        if (this.sortField === field) {
            this.sortDir = (this.sortDir === 'asc') ? 'desc' : 'asc';
        } else {
            this.sortField = field;
            this.sortDir = 'desc'; // Для заказов лучше по умолчанию DESC (новые сверху)
        }
        this.updateSortIcons();
        this.loadOrders();
    },

    updateSortIcons: function() {
        document.querySelectorAll('.data-table th').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            if (th.dataset.sort === this.sortField) {
                th.classList.add(this.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
            }
        });
    },
    // ----------------------------

    loadOrders: async function() {
        const tbody = document.getElementById('ordersTableBody');
        const loadingText = this.lang === 'ua' ? 'Завантаження...' : 'Загрузка...';

        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px;">${loadingText}</td></tr>`;
        }

        // Собираем параметры для URL
        const params = new URLSearchParams({
            search: this.searchQuery,
            status: this.filterStatus,
            date_from: this.filterDateFrom,
            date_to: this.filterDateTo,
            sort_by: this.sortField,
            sort_dir: (this.sortField === 'def') ? 'asc' : this.sortDir
        });

        try {
            const res = await fetch(`/api/admin/orders?${params.toString()}`);
            const data = await res.json();

            if (data.success) {
                this.renderTable(data.orders);
                this.updateSortIcons(); // Обновляем стрелочки
            } else {
                if(tbody) tbody.innerHTML = `<tr><td colspan="8" style="color:red; text-align:center;">Error: ${data.error}</td></tr>`;
                if(data.error === 'Auth required') location.href = `/admin/${this.lang}/login`;
            }
        } catch (e) {
            console.error(e);
            if(tbody) tbody.innerHTML = '<tr><td colspan="8" style="color:red; text-align:center;">Server Error</td></tr>';
        }
    },

    renderTable: function(orders) {
        const tbody = document.getElementById('ordersTableBody');
        if (!tbody) return;

        if (orders.length === 0) {
            const emptyText = this.lang === 'ua' ? 'Замовлень не знайдено' : 'Заказов не найдено';
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#64748b;">${emptyText}</td></tr>`;
            return;
        }

        // 1. Убираем статус "Необработанный" из списка
    // 1. Список "технических" статусов (как они в Базе Данных)
    const statusList = [
        'Необработанные', 'Принятие решения', 'Первый контакт',
        'Переговоры', 'Договор', 'Выполнение', 'Оплачено', 'Отменен', 'Планируется повторный звонок'
    ];

    // Определяем язык
    const isUA = this.lang === 'ua';

    // 2. Словарь перевода статусов для отображения
    const statusTranslate = {
        'Необработанные': 'Необроблені',
        'Принятие решения': 'Прийняття рішення',
        'Первый контакт': 'Перший контакт',
        'Переговоры': 'Переговори',
        'Договор': 'Договір',
        'Выполнение': 'Виконання',
        'Оплачено': 'Оплачено',
        'Отменен': 'Скасовано',
        'Планируется повторный звонок': 'Планується повторний дзвінок'
    };

    tbody.innerHTML = orders.map(order => {

        // --- ТОВАРЫ (Сделали шрифт крупнее) ---
        let itemsHtml = '';
        if(order.items && order.items.length > 0) {
             itemsHtml = order.items.map(i => {
                const imgUrl = i.image ? i.image : '';
                // Картинку чуть увеличим (50px)
                const imgTag = imgUrl
                    ? `<img src="${imgUrl}" style="width:50px; height:50px; object-fit:cover; border-radius:4px; border:1px solid #eee; flex-shrink:0;">`
                    : '<div style="width:50px; height:50px; background:#f1f5f9; border-radius:4px; flex-shrink:0;"></div>';

                return `<div style="display:flex; align-items:center; gap:12px; border-bottom:1px solid #f1f5f9; padding:8px 0;">
                    ${imgTag}
                    <div style="line-height:1.4;">
                        <div style="font-size:15px; color:#1e293b;">${i.title}</div>
                        <div style="font-size:13px; color:#64748b; margin-top:2px;">Арт: ${i.sku || '-'} | <span style="color:#0f172a;">${i.qty} шт.</span></div>
                    </div>
                </div>`;
            }).join('');
        } else { itemsHtml = '<span style="color:#ccc;">—</span>'; }

        const commentHtml = order.comment ? `<div style="margin-top:8px; padding:10px; background:#fff7ed; border:1px solid #ffedd5; border-radius:4px; font-size:14px; color:#9a3412;">💬 ${order.comment}</div>` : '';

        // --- ДОСТАВКА (Перевод) ---
        const deliveryMap = {
            'np': isUA ? 'Нова Пошта (відділення)' : 'Новая Почта (отделение)',
            'np_currier': isUA ? "Нова Пошта (кур'єр)" : 'Новая Почта (курьер)',
            'np_poshtomat': isUA ? 'Нова Пошта (поштомат)' : 'Новая Почта (почтомат)',
            'up': isUA ? 'Укрпошта Стандарт' : 'Укрпочта Стандарт',
            'upe': isUA ? 'Укрпошта Експрес' : 'Укрпочта Экспресс',
            'pickup': isUA ? 'Самовивіз (м. Шостка)' : 'Самовывоз (г. Шостка)'
        };
        let deliveryName = deliveryMap[order.delivery] || order.delivery || '';

        // --- ОПЛАТА (Перевод) ---
        const payMap = {
            'cod': isUA ? 'Післяплата' : 'Наложенный платеж',
            'card_online': isUA ? 'Картка Visa/MasterCard' : 'Карта Visa/MasterCard',
            'iban': isUA ? 'За реквізитами (IBAN)' : 'По реквизитам (IBAN)',
            'seller_cashless': isUA ? 'Безготівковий (Юр. особи)' : 'Безналичный (Юр. лица)',
            'crypto': 'USDT (TRC-20)'
        };
        let payMethod = payMap[order.payment] || order.payment;

        // --- СТАТУСЫ (Перевод отображения) ---
        const options = statusList.map(st => {
            // value остается русским (для базы), а текст показываем переведенный
            const label = isUA ? (statusTranslate[st] || st) : st;
            return `<option value="${st}" ${order.status === st ? 'selected' : ''}>${label}</option>`;
        }).join('');

        // --- СБОРКА ТАБЛИЦЫ (Шрифты увеличены до 14-16px) ---
        return `
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="vertical-align:top; padding:14px; font-size:15px;">
                    <strong>#${order.id}</strong>
                </td>

                <td style="vertical-align:top; padding:14px; font-size:14px;">
                    ${order.date.split(' ')[0]}
                    <div style="color:#64748b; margin-top:4px;">${order.date.split(' ')[1]}</div>
                </td>

                <td style="vertical-align:top; padding:14px;">
                    <div style="font-size:16px; color:#0f172a; margin-bottom:4px;">${order.name}</div>
                    <div style="font-size:14px; color:#64748b;">${order.phone}</div>
                </td>

                <td style="vertical-align:top; padding:10px;">${itemsHtml}${commentHtml}</td>

                <td style="vertical-align:top; padding:14px; font-size:16px;">
                    <strong>${order.total} ₴</strong>
                </td>

                <td style="vertical-align:top; padding:14px; font-size:14px;">
                    <div style="margin-bottom:6px; font-weight:500;">${deliveryName}</div>
                    <div style="color:#475569; margin-bottom:10px;">${order.address}</div>

                    <input type="text" placeholder="ТТН..." value="${order.ttn}"
                           onchange="Admin.saveTTN(${order.id}, this.value)"
                           style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px; font-size:14px;">

                    <div style="margin-top:8px; color:#475569;">
                        ${payMethod} ${order.pay_status==='paid'?'<span style="color:green; font-weight:bold; margin-left:5px;">(Опл)</span>':''}
                    </div>
                </td>

                <td style="vertical-align:top; padding:14px;">
                    <select class="status-select" style="width:100%; padding:8px; font-size:14px;"
                            onchange="Admin.changeStatus(${order.id}, this.value)">
                        ${options}
                    </select>
                </td>
            </tr>`;
    }).join('');
    },

    changeStatus: async function(id, newStatus) {
        // ... (Без изменений, возьмите из старого файла) ...
        try { await fetch('/api/admin/order/status', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, status:newStatus}) }); console.log(`Order ${id} saved`); } catch(e){alert('Error');}
    },

    saveTTN: async function(id, val) {
        // ... (Без изменений) ...
        try { await fetch('/api/admin/order/ttn', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, ttn:val}) }); console.log('TTN saved'); } catch(e){alert('Error');}
    }
};

// === ЛОГИКА ТОВАРОВ ===
const AdminProducts = {
    currentTab: 'active',
    filterCat: '',
    filterDateFrom: '',
    filterDateTo: '',

    // Хранилище данных
    allLoadedProducts: [],
    searchQuery: '',

    sortField: 'def',
    sortDir: 'asc',

    categories: {},

    // Проверка, является ли файл видео (по расширению)
    isVideo: function(path) {
        if(!path) return false;
        const ext = path.split('.').pop().toLowerCase();
        return ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext);
    },

    init: function() {
        this.lang = document.documentElement.lang === 'uk' ? 'ua' : 'ru';
        if(window.location.pathname.includes('products')) {
            this.load();
        }
    },

    onSearchInput: function(val) {
        this.searchQuery = val.toLowerCase().trim();
        this.renderLocal();
    },

    filterTab: function(type) {
        this.currentTab = type;
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        if (type === 'active') document.getElementById('tabActive').classList.add('active');
        if (type === 'deleted') document.getElementById('tabDeleted').classList.add('active');
        this.load();
    },

    applyFilter: function() {
        this.filterCat = document.getElementById('f_category').value;
        this.filterDateFrom = document.getElementById('f_date_from').value;
        this.filterDateTo = document.getElementById('f_date_to').value;
        this.load();
    },

    resetFilters: function() {
        // 1. Очищаем HTML-поля
        document.getElementById('f_category').value = '';
        document.getElementById('f_date_from').value = '';
        document.getElementById('f_date_to').value = '';
        const searchInput = document.querySelector('.filter-search');
        if(searchInput) searchInput.value = '';

        // 2. Сбрасываем внутренние переменные
        this.searchQuery = '';
        this.filterCat = ''; // <--- ИСПРАВЛЕНО (было filterCategory)
        this.filterDateFrom = '';
        this.filterDateTo = '';

        // 3. Сбрасываем сортировку к "по умолчанию"
        this.sortField = 'def';
        this.sortDir = 'asc';

        // 4. Перезагружаем таблицу
        this.updateSortIcons();
        this.load();
    },

    sortBy: function(field) {
        if (this.sortField === field) {
            this.sortDir = (this.sortDir === 'asc') ? 'desc' : 'asc';
        } else {
            this.sortField = field;
            this.sortDir = 'asc';
        }
        this.updateSortIcons();
        this.load();
    },

    updateSortIcons: function() {
        document.querySelectorAll('.data-table th').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            if (th.dataset.sort === this.sortField) {
                th.classList.add(this.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
            }
        });
    },

    // Метод исправления раскладки (QWERTY -> ЙЦУКЕН)
    // Внутри объекта AdminProducts:

    fixLayout: function(str) {
        const replacer = {
            "q":"й", "w":"ц", "e":"у", "r":"к", "t":"е", "y":"н", "u":"г", "i":"ш", "o":"щ", "p":"з", "[":"х", "]":"ъ",
            "a":"ф", "s":"ы", "d":"в", "f":"а", "g":"п", "h":"р", "j":"о", "k":"л", "l":"д", ";":"ж", "'":"э",
            "z":"я", "x":"ч", "c":"с", "v":"м", "b":"и", "n":"т", "m":"ь", ",":"б", ".":"ю", "/":".", "`": "ё",
            "Q":"Й", "W":"Ц", "E":"У", "R":"К", "T":"Е", "Y":"Н", "U":"Г", "I":"Ш", "O":"Щ", "P":"З", "{":"Х", "}":"Ъ",
            "A":"Ф", "S":"Ы", "D":"В", "F":"А", "G":"П", "H":"Р", "J":"О", "K":"Л", "L":"Д", ":":"Ж", '"':"Э",
            "Z":"Я", "X":"Ч", "C":"С", "V":"М", "B":"И", "N":"Т", "M":"Ь", "<":"Б", ">":"Ю", "?":",", "~":"Ё"
        };

        // Используем new RegExp для надежности
        // Мы ищем все английские буквы и спецсимволы раскладки
        const reg = new RegExp("[a-zA-Z\\[\\];',./`{}|:\"<>?~]", "g");

        return str.replace(reg, function (x) {
            // Если замены нет, возвращаем как было
            return replacer[x] || replacer[x.toLowerCase()] || x;
        });
    },

    saveOrder: async function() {
        const tbody = document.getElementById('productsTableBody');
        // Берем ВСЕ строки таблицы (и товары, и заголовки категорий)
        const allRows = Array.from(tbody.children);

        let currentCatSlug = null;
        const payload = [];

        allRows.forEach(row => {
            // Если это строка-заголовок категории — запоминаем, в какой мы теперь секции
            if (row.classList.contains('tr-category')) {
                currentCatSlug = row.getAttribute('data-cat');
            }
            // Если это товар — записываем его ID и текущую категорию
            else if (row.hasAttribute('data-id')) {
                const pid = row.getAttribute('data-id');
                // Добавляем в список на отправку
                payload.push({
                    id: pid,
                    cat: currentCatSlug // Присваиваем товару категорию заголовка, под которым он стоит
                });
            }
        });

        // Отправляем на сервер новый формат данных
        try {
            await fetch('/api/admin/reorder', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ items: payload }) // Шлем items, а не ids
            });
            // console.log('Порядок и категории сохранены');
        } catch(e) { console.error(e); }
    },

    load: async function() {
        const tbody = document.getElementById('productsTableBody');
        if(tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Загрузка...</td></tr>';

        const params = new URLSearchParams({
            show_deleted: this.currentTab === 'deleted' ? '1' : '0',
            category: this.filterCat,
            date_from: this.filterDateFrom,
            date_to: this.filterDateTo,
            sort_by: this.sortField,
            sort_dir: this.sortDir
        });

        try {
            const res = await fetch(`/api/admin/products?${params.toString()}`);
            const data = await res.json();
            if(data.success) {
                this.allLoadedProducts = data.products;
                this.renderLocal();
            }
        } catch(e) { console.error(e); }
    },

    renderLocal: function() {
        let list = this.allLoadedProducts;

        if (this.searchQuery) {
            // 1. Исходный запрос (маленькими)
            const query = this.searchQuery.toLowerCase();

            // 2. Исправленный запрос (маленькими)
            // ВАЖНО: сначала исправляем раскладку оригинала, потом lowercase
            // Потому что <kjr превратится в Блок, а нам нужно блок.
            const fixedQuery = this.fixLayout(this.searchQuery).toLowerCase();

            // ДЛЯ ОТЛАДКИ (Нажмите F12 в браузере -> Console, и введите что-то в поиск)
            console.log(`Ищем: "${query}" или "${fixedQuery}"`);

            list = list.filter(p => {
                const nameRu = (p.title_ru || '').toLowerCase();
                const nameUa = (p.title_ua || '').toLowerCase();
                const sku = (p.sku || '').toLowerCase();

                return nameRu.includes(query) ||
                       nameUa.includes(query) ||
                       sku.includes(query) ||
                       nameRu.includes(fixedQuery) ||
                       nameUa.includes(fixedQuery);
            });
        }
        this.render(list);
    },

    // Функция сворачивания/разворачивания
    toggleCategory: function(catId) {
        // Находим все строки товаров этой категории
        const rows = document.querySelectorAll(`.cat-group-${catId}`);
        const headerBtn = document.getElementById(`btn-cat-${catId}`);

        let isHidden = false;
        rows.forEach(row => {
            if (row.style.display === 'none') {
                row.style.display = ''; // Показываем
                isHidden = false;
            } else {
                row.style.display = 'none'; // Скрываем
                isHidden = true;
            }
        });

        // Крутим стрелочку
        if(headerBtn) {
            if(isHidden) headerBtn.classList.add('cat-collapsed');
            else headerBtn.classList.remove('cat-collapsed');
        }
    },

    render: function(list) {
        const counterEl = document.getElementById('productsCounter');
        if(counterEl) {
            // Пишем просто число или "Активно: N"
            const isUA = this.lang === 'ua';
            const text = isUA ? `(Всього: ${list.length})` : `(Всего: ${list.length})`;
            counterEl.textContent = text;
        }

        const tbody = document.getElementById('productsTableBody');
        if (!tbody) return;

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:20px; color:#64748b;">${this.lang==='ua'?'Товарів не знайдено':'Товаров не найдено'}</td></tr>`;
            return;
        }

        // Словари для заголовков категорий
        const catMap = {
            'solder': this.lang==='ua'?'Паяльне обладнання':'Паяльное оборудование',
            'meas': this.lang==='ua'?'Вимірювальні прилади':'Измерительные приборы',
            'osc': this.lang==='ua'?'Осцилографи':'Осциллографы',
            'prog': this.lang==='ua'?'Програматори':'Программаторы',
            'repair': this.lang==='ua'?'Інструменти':'Инструменты',
            'consum': this.lang==='ua'?'Витратні матеріали':'Расходные материалы',
            'rmods': this.lang==='ua'?'Модулі':'Модули',
            'rparts': this.lang==='ua'?'Радіодеталі':'Радиодетали',
            'psu': this.lang==='ua'?'Джерела живлення':'Источники питания',
            'cables': this.lang==='ua'?'Кабелі':'Кабели'
        };

        const isUA = document.documentElement.lang === 'uk';
        // Группируем только если сортировка "По умолчанию" и нет поиска
        const isGrouped = (this.sortField === 'def' && !this.searchQuery);

        let lastCategory = null;
        let html = '';

        list.forEach(p => {
            // Рисуем заголовок категории (сворачиваемый)
            if (isGrouped && p.category !== lastCategory) {
                const categoryData = (typeof AdminCats !== 'undefined' && AdminCats.allCats)
                    ? AdminCats.allCats.find(c => c.slug === p.category)
                    : null;

                const catName = categoryData
                    ? (isUA ? (categoryData.title_ua || categoryData.title_ru) : categoryData.title_ru)
                    : p.category;

                const catImg = (categoryData && categoryData.image_url)
                    ? `<img src="${categoryData.image_url}" style="width:24px; height:24px; object-fit:contain; margin-right:8px; vertical-align:middle; background:#fff; border-radius:3px;">`
                    : '';

                html += `
                <tr class="tr-category" data-cat="${p.category}" style="cursor:pointer; background:#e2e8f0;" onclick="AdminProducts.toggleCategory('${p.category}')" id="btn-cat-${p.category}">
                    <td colspan="9" style="padding:10px 15px; font-weight:800; color:#0f172a; text-transform:uppercase;">
                        <span class="cat-arrow" style="display:inline-block; transition:transform 0.2s; margin-right:8px;">▼</span> ${catImg} ${catName}
                    </td>
                </tr>`;
                lastCategory = p.category;
            }

            const img = (p.images && p.images[0]) ? p.images[0] : '';
            const imgTag = img
                ? `<img src="${img}" style="width:40px;height:40px;object-fit:contain;border:1px solid #eee;border-radius:4px;">`
                : '<div style="width:40px;height:40px;background:#f1f5f9;border-radius:4px;"></div>';

            const stockBadge = p.in_stock
                ? '<span class="badge badge-ok">✔</span>'
                : '<span class="badge badge-hidden" style="color:#ef4444; background:#fef2f2;">✖</span>';

            const visibleBadge = p.is_visible ?
                `<span class="badge badge-ok">${isUA ? 'Опубліковано' : 'Опубликовано'}</span>` :
                `<span class="badge badge-hidden">${isUA ? 'Приховано' : 'Скрыто'}</span>`;

            const displayTitle = isUA ? (p.title_ua || p.title_ru) : p.title_ru;

            const unitLabel = (p.unit_type === 'set') ? 'комплект.' : 'шт.';

            let actionsHtml = '';
            if (this.currentTab === 'deleted') {
                 actionsHtml = `<button class="btn-icon" title="Восстановить" onclick="AdminProducts.restore(${p.id})">♻️</button>`;
            } else {
                // ПЕРЕТАСКИВАНИЕ:
                // Добавляем ручку, только если сортировка "По умолчанию" (def) и нет поиска
                let dragHandle = '';
                if (isGrouped) {
                    // class="drag-handle" - за это будем хватать
                    dragHandle = `<div class="btn-icon drag-handle" style="cursor:grab; background:#f8fafc;" title="Перетащить">:::</div>`;
                }

                const pJson = JSON.stringify(p).replace(/"/g, '&quot;');

                actionsHtml = `
                     ${dragHandle}
                     <button class="btn-icon" title="Копировать" onclick="AdminProducts.copy(${p.id})">📄</button>
                     <button class="btn-icon" title="Скрыть/Показать" onclick="AdminProducts.toggleVisibility(${p.id}, ${p.is_visible})">${p.is_visible ? '👁️' : '🙈'}</button>
                     <button class="btn-icon" title="Редактировать" onclick="AdminProducts.openModal(${pJson})">✏️</button>
                     <button class="btn-icon red" title="Удалить" onclick="AdminProducts.delete(${p.id})">🗑️</button>
                `;
            }

            // Чекбокс витрины
            const indexCheckbox = this.currentTab === 'deleted' ? '' :
                `<input type="checkbox" ${p.on_index ? 'checked' : ''}
                  style="cursor:pointer; width:16px; height:16px;"
                  onchange="AdminProducts.toggleIndex(${p.id}, this.checked)">`;

            // Подкатегория (если есть)
            let subCatHtml = '';
            if (p.subcategory) {
                subCatHtml = `<div style="font-size:11px; color:#64748b; margin-top:2px;">${isUA?'Підкатегорія':'Подкатегория'}: ${p.subcategory}</div>`;
            }

            // ВАЖНО: Добавляем класс cat-group-КАТЕГОРИЯ для работы сворачивания
            const rowClass = isGrouped ? `cat-group-${p.category}` : '';

            html += `
            <tr class="${rowClass}" data-id="${p.id}" style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:10px;">${imgTag}</td>
                <td style="padding:10px;">
                    <div style="font-weight:600; font-size:14px;">${displayTitle}</div>
                    ${subCatHtml}
                    <div style="font-size:12px; color:#64748b;">SKU: ${p.sku || '-'}</div>
                </td>
                <td style="padding:10px; font-size:13px; color:#64748b;">${catMap[p.category] || this.categories[p.category] || p.category}</td>
                <td style="padding:10px; font-weight:700;">${parseFloat(p.price).toFixed(2)} ₴</td>
                <td style="padding:10px;"><b>${p.qty_stock || 0}</b> ${unitLabel}</td>
                <td style="padding:10px;">${stockBadge}</td>
                <td style="padding:10px; font-size:13px; color:#64748b;">${p.created_at ? p.created_at.split(' ')[0] : '-'}</td>

                <td style="text-align:center;">${indexCheckbox}</td>

                <td style="padding:10px;">${visibleBadge}</td>
                <td style="text-align:right; padding:10px;">
                    <div class="action-group">
                        ${actionsHtml}
                    </div>
                </td>
            </tr>
            `;
        });

        tbody.innerHTML = html;

        if (isGrouped) {
            if (this.sortableInstance) this.sortableInstance.destroy(); // Убиваем старый, если был

            this.sortableInstance = new Sortable(tbody, {
                handle: '.drag-handle', // Тянуть можно только за ручку :::
                animation: 150,
                ghostClass: 'sortable-ghost', // Класс для элемента в полете
                onEnd: function (evt) {
                    // Когда бросили - собираем новый порядок
                    AdminProducts.saveOrder();
                }
            });
        }
    },

    // === НОВАЯ ФУНКЦИЯ КОПИРОВАНИЯ ===
    copy: function(id) {
        // Находим товар в памяти
        const original = this.allLoadedProducts.find(p => p.id === id);
        if (!original) return;

        // Создаем копию объекта (через JSON, чтобы разорвать ссылки)
        const copyData = JSON.parse(JSON.stringify(original));

        // Очищаем ID, чтобы сервер создал новый
        copyData.id = null;

        // Опционально: можно добавить пометку в название, чтобы не путаться
        copyData.title_ru += ' (Копия)';
        if(copyData.title_ua) copyData.title_ua += ' (Копія)';
        copyData.sku += '-COPY';

        // Открываем модалку с этими данными
        this.openModal(copyData);
    },

    // === СИНХРОНИЗАЦИЯ С KEEPINCRM ===
    syncCrm: async function() {
        const isUA = this.lang === 'ua';
        const msg = isUA
            ? 'Синхронізувати ціни та залишки з KeepinCRM?\nЦе оновить товари за збігом Артикулу (SKU).'
            : 'Синхронизировать цены и остатки из KeepinCRM?\nЭто обновит товары по совпадению Артикула (SKU).';

        if(!confirm(msg)) return;

        // Ищем кнопку, чтобы показать анимацию загрузки
        const btn = document.querySelector('button[onclick="AdminProducts.syncCrm()"]');
        const oldText = btn ? btn.textContent : '';

        if(btn) {
            btn.textContent = '⏳...';
            btn.disabled = true;
        }

        try {
            const res = await fetch('/api/admin/sync_keepincrm', { method: 'POST' });
            const data = await res.json();

            if(btn) {
                btn.textContent = oldText;
                btn.disabled = false;
            }

            if(data.success) {
                alert(data.message); // Покажет, сколько товаров обновлено
                this.load(); // Перезагружаем таблицу, чтобы увидеть новые цены/остатки
            } else {
                alert('Ошибка: ' + (data.error || 'Неизвестная ошибка'));
            }
        } catch(e) {
            console.error(e);
            alert('Ошибка сети / Server Error');
            if(btn) {
                btn.textContent = oldText;
                btn.disabled = false;
            }
        }
    },

    // === НОВАЯ ФУНКЦИЯ ГАЛОЧКИ ВИТРИНЫ ===
    toggleIndex: async function(id, isChecked) {
        try {
            await fetch('/api/admin/product/index', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({id: id, on_index: isChecked ? 1 : 0})
            });
            // Не перезагружаем таблицу полностью, чтобы не сбивать фокус, но обновляем данные в памяти
            const p = this.allLoadedProducts.find(x => x.id === id);
            if(p) p.on_index = isChecked ? 1 : 0;
        } catch(e) {
            console.error(e);
            alert('Ошибка связи с сервером');
        }
    },

    move: async function(id, direction) {
        try {
            const res = await fetch('/api/admin/product/move', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({id: id, direction: direction})
            });
            const data = await res.json();
            if(data.success) this.load();
        } catch(e) { console.error(e); }
    },

    // === 1. ОТКРЫТИЕ МОДАЛКИ (Заполнение полей) ===
    openModal: function(product = null) {
        const modal = document.getElementById('productModal');
        const title = document.getElementById('modalTitle');
        const form = document.getElementById('productForm');
        if(!modal) return;

        form.reset();

        // Очищаем фото
        document.getElementById('path_main').value = '';
        document.getElementById('preview_main').style.display = 'none';
        document.getElementById('placeholder_main').style.display = 'block';
        document.getElementById('gallery_container').innerHTML = '';

        if (product) {
            title.textContent = product.id ? (this.lang==='ua'?'Редагування':'Редактирование') : (this.lang==='ua'?'Створення копії':'Создание копии');
            document.getElementById('p_id').value = product.id || '';

            document.getElementById('p_title').value = product.title_ru;
            document.getElementById('p_title_ua').value = product.title_ua || product.title_ru;
            document.getElementById('p_sku').value = product.sku;
            document.getElementById('p_price').value = product.price;
            document.getElementById('p_qty_stock').value = product.qty_stock || 0;
            document.getElementById('p_unit').value = product.unit_type || 'pcs';
            document.getElementById('p_category').value = product.category;
            document.getElementById('p_stock').value = product.in_stock;
            document.getElementById('p_desc_ru').value = product.description_ru || '';
            document.getElementById('p_desc_ua').value = product.description_ua || '';
            document.getElementById('p_on_index').checked = (product.on_index == 1);

            // Новые SEO поля
            document.getElementById('p_seo_title').value = product.seo_title || '';
            document.getElementById('p_seo_desc').value = product.seo_description || '';

            // --- ЗАГРУЗКА ФОТО ---
            // --- ЗАГРУЗКА ФОТО/ВИДЕО (ОБНОВЛЕНО) ---
            if(product.images && product.images.length > 0) {
                 const mainImg = product.images[0];

                 if(mainImg) {
                     // Устанавливаем путь в скрытое поле
                     document.getElementById('path_main').value = mainImg;

                     // Находим контейнер превью (квадратик)
                     const previewImg = document.getElementById('preview_main');
                     const container = previewImg.parentElement;

                     // Генерируем HTML в зависимости от типа файла
                     let mediaHtml = '';
                     if (this.isVideo(mainImg)) {
                         // Если видео — тег video с контролами
                         mediaHtml = `<video id="preview_main" src="${mainImg}" style="width:100%; height:100%; object-fit:contain; display:block;" controls muted></video>`;
                     } else {
                         // Если фото — тег img
                         mediaHtml = `<img id="preview_main" src="${mainImg}" style="width:100%; height:100%; object-fit:contain; display:block;">`;
                     }

                     // Переписываем содержимое квадратика: Медиа + Скрытая надпись "Нет фото"
                     container.innerHTML = mediaHtml + `<span id="placeholder_main" style="display:none; font-size:11px; color:#94a3b8; text-align:center;">Нет фото</span>`;
                 }

                 // Загружаем остальные файлы в галерею
                 for(let i = 1; i < product.images.length; i++) {
                     this.addGalleryItem(product.images[i]);
                 }
            }
        } else {
            title.textContent = this.lang==='ua'?'Новий товар':'Новый товар';
            document.getElementById('p_id').value = '';
        }
        modal.classList.add('active');
    },

    // === 2. СОХРАНЕНИЕ ===
    save: async function() {
        const pid = document.getElementById('p_id').value;

        // Собираем фото: Сначала главное, потом все из галереи
        const mainPath = document.getElementById('path_main').value;
        const galleryPaths = Array.from(document.querySelectorAll('.gallery-item-path')).map(input => input.value);

        let allImages = [];
        if(mainPath) allImages.push(mainPath);
        allImages = allImages.concat(galleryPaths);

        const data = {
            id: pid ? pid : null,
            title_ru: document.getElementById('p_title').value,
            title_ua: document.getElementById('p_title_ua').value,
            sku: document.getElementById('p_sku').value,
            price: document.getElementById('p_price').value,
            qty_stock: document.getElementById('p_qty_stock').value,
            unit_type: document.getElementById('p_unit').value,
            category: document.getElementById('p_category').value,
            in_stock: document.getElementById('p_stock').value,
            description_ru: document.getElementById('p_desc_ru').value,
            description_ua: document.getElementById('p_desc_ua').value,
            on_index: document.getElementById('p_on_index').checked ? 1 : 0,

            // Новые поля
            seo_title: document.getElementById('p_seo_title').value,
            seo_description: document.getElementById('p_seo_desc').value,

            images: allImages
        };

        const res = await fetch('/api/admin/product/save', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if(result.success) { this.closeModal(); this.load(); }
        else { alert('Ошибка сохранения'); }
    },

    // === 3. ЗАГРУЗКА ГЛАВНОГО ФОТО ===
    uploadSingle: async function(input) {
        if (!input.files || !input.files[0]) return;
        const formData = new FormData();
        formData.append('file', input.files[0]);

        try {
            const res = await fetch('/api/admin/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if(data.success) {
                document.getElementById('path_main').value = data.path;

                // Логика отображения (Видео или Фото)
                const container = document.getElementById('placeholder_main').parentElement;
                // Ищем или создаем элемент
                const isVid = this.isVideo(data.path);

                // Очищаем контейнер (там был img#preview_main и span#placeholder)
                // Но нам нужно сохранить структуру для чистоты, или просто перезаписать

                let html = '';
                if(isVid) {
                    html = `<video src="${data.path}" style="width:100%; height:100%; object-fit:contain;" controls autoplay muted></video>`;
                } else {
                    html = `<img id="preview_main" src="${data.path}" style="width:100%; height:100%; object-fit:contain;">`;
                }

                // Добавляем плейсхолдер (скрытый), чтобы структура не ломалась при следующем открытии
                html += `<span id="placeholder_main" style="display:none; font-size:11px; color:#94a3b8; text-align:center;">Нет фото</span>`;

                container.innerHTML = html;

            } else { alert('Ошибка: ' + data.error); }
        } catch(e) { console.error(e); }
        input.value = ''; // Сброс, чтобы можно было перезалить тот же файл
    },

    // === 4. ЗАГРУЗКА ГАЛЕРЕИ ===
    uploadGallery: async function(input) {
        if (!input.files || input.files.length === 0) return;

        for (let i = 0; i < input.files.length; i++) {
            const formData = new FormData();
            formData.append('file', input.files[i]);
            try {
                const res = await fetch('/api/admin/upload', { method: 'POST', body: formData });
                const data = await res.json();
                if(data.success) {
                    this.addGalleryItem(data.path);
                }
            } catch(e) { console.error(e); }
        }
        // Очищаем инпут, чтобы можно было загрузить те же файлы снова
        input.value = '';
    },

    // Вспомогательная: рисует квадратик фото или видео в галерее
    addGalleryItem: function(path) {
        const container = document.getElementById('gallery_container');
        const div = document.createElement('div');
        div.style.cssText = 'position:relative; width:60px; height:60px; border:1px solid #ddd; border-radius:4px; background:#f8fafc; overflow:hidden;';

        let mediaHtml = '';
        if (this.isVideo(path)) {
            // Если видео — показываем тег video
            mediaHtml = `<video src="${path}" style="width:100%; height:100%; object-fit:cover;" muted></video>
                         <div style="position:absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; pointer-events:none;">
                            <span style="color:white; font-size:20px; text-shadow:0 0 5px black;">▶</span>
                         </div>`;
        } else {
            // Если фото
            mediaHtml = `<img src="${path}" style="width:100%; height:100%; object-fit:cover;">`;
        }

        div.innerHTML = `
            ${mediaHtml}
            <input type="hidden" class="gallery-item-path" value="${path}">
            <button type="button" onclick="this.parentElement.remove()"
                    style="position:absolute; top:0px; right:0px; background:rgba(239, 68, 68, 0.9); color:white; border:none; width:18px; height:18px; font-size:14px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center;">×</button>
        `;
        container.appendChild(div);
    },

    uploadImage: async function(input) {
        if (!input.files || !input.files[0]) return;
        const formData = new FormData();
        formData.append('file', input.files[0]);
        try {
            const res = await fetch('/api/admin/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if(data.success) {
                document.getElementById('p_image_path').value = data.path;
                document.getElementById('img_preview').src = data.path;
                document.getElementById('img_preview').style.display = 'block';
            } else { alert('Ошибка загрузки: ' + data.error); }
        } catch(e) { console.error(e); alert('Ошибка сети'); }
    },

    toggleVisibility: async function(id, currentStatus) {
        await fetch('/api/admin/product/visibility', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({id: id, is_visible: currentStatus ? 0 : 1})
        });
        this.load();
    },

    delete: async function(id) {
        if(!confirm('Переместить товар в корзину?')) return;
        try {
            await fetch('/api/admin/product/delete', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({id: id})
            });
            this.load();
        } catch(e) { alert('Ошибка сети'); }
    },

    restore: async function(id) {
        if(!confirm('Восстановить товар?')) return;
        try {
            await fetch('/api/admin/product/restore', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({id: id})
            });
            this.load();
        } catch(e) { alert('Ошибка сети'); }
    },

    closeModal: function() {
        const modal = document.getElementById('productModal');
        if(modal) modal.classList.remove('active');
    }
};

// === АВТО-ПОДСВЕТКА МЕНЮ ===
document.addEventListener('DOMContentLoaded', () => {
    const currentPath = window.location.pathname; // Например: "/admin/ru/products"
    const menuLinks = document.querySelectorAll('.nav-links a');

    menuLinks.forEach(link => {
        // 1. Сначала убираем "active" у всех (на всякий случай)
        link.classList.remove('active');

        // 2. Получаем ссылку из кнопки
        const href = link.getAttribute('href');

        // 3. Если ссылка не пустая (не #) и она есть в текущем адресе
        if (href && href !== '#' && currentPath.includes(href)) {
            link.classList.add('active');
        }
    });
});

// === УПРАВЛЕНИЕ ВИТРИНОЙ (СОРТИРОВКА) ===
const AdminShowcase = {
    items: [],

    init: function() {
        if (!document.getElementById('showcaseContainer')) return;
        this.load();
    },

    load: async function() {
        const container = document.getElementById('showcaseContainer');
        container.innerHTML = '<div style="text-align:center; padding:20px;">Загрузка...</div>';

        // Запрашиваем ВСЕ товары, но потом отфильтруем только витрину
        // (Или можно сделать отдельный API, но используем существующий для простоты)
        try {
            const res = await fetch('/api/admin/products?sort_by=def&sort_dir=asc');
            const data = await res.json();
            if (data.success) {
                // Берем только те, что on_index == 1
                // И сортируем их по позиции (backend уже отдал их отсортированными по position ASC)
                this.items = data.products.filter(p => p.on_index == 1);
                this.render();
            }
        } catch(e) { console.error(e); }
    },

    render: function() {
        const container = document.getElementById('showcaseContainer');
        const isUA = document.documentElement.lang === 'uk';

        if(this.items.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding:20px;">${isUA?'Немає товарів':'Нет товаров'}</div>`;
            return;
        }

        container.innerHTML = this.items.map((p, index) => {
            const img = (p.images && p.images[0]) ? p.images[0] : '';
            const title = isUA ? (p.title_ua || p.title_ru) : p.title_ru;
            const unitLabel = (p.unit_type === 'set') ? 'комплект.' : 'шт.';

            return `
            <div class="showcase-item" data-id="${p.id}">
                <div class="drag-handle" style="cursor:grab; padding:10px; font-size:20px; color:#cbd5e1;">:::</div>

                <img src="${img || '/assets/no-photo.png'}" class="item-img">
                <div class="item-info">
                    <div class="item-title">${title}</div>
                    <div class="item-sku">SKU: ${p.sku} | ${p.price} ₴</div>
                </div>
            </div>
            `;
        }).join('');

        // ВКЛЮЧАЕМ DRAG-AND-DROP
        new Sortable(container, {
            handle: '.drag-handle',
            animation: 150,
            onEnd: function () {
                AdminShowcase.saveRealTime();
            }
        });
    },

    // Функция авто-сохранения для витрины
    saveRealTime: async function() {
        const container = document.getElementById('showcaseContainer');
        const ids = Array.from(container.querySelectorAll('.showcase-item')).map(el => el.getAttribute('data-id'));

        await fetch('/api/admin/reorder', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ ids: ids })
        });
    }
};

// === УПРАВЛЕНИЕ КАТЕГОРИЯМИ ===
const AdminCats = {
    allCats: [],

    init: function() {
        this.load();
    },

    load: async function() {
        try {
            const res = await fetch('/api/categories');
            const data = await res.json();
            if (data.success) {
                this.allCats = data.categories;
                this.renderTree();
                this.updateSelects(); // Обновляем выпадающие списки (в товарах и в редакторе категорий)
            }
        } catch(e) { console.error(e); }
    },

    // Рисуем список для управления
    renderTree: function() {
        const container = document.getElementById('catsList');
        if (!container) return;

        const isUA = this.lang === 'ua';
        // 1. Корневые категории
        const roots = this.allCats.filter(c => !c.parent_slug);

        let html = '';
        roots.forEach(root => {
            const rootName = isUA ? (root.title_ua || root.title_ru) : root.title_ru;
            // 2. Подкатегории (уровень 2)
            const childs = this.allCats.filter(c => c.parent_slug === root.slug);

            html += `
            <div class="cat-item-row" data-id="${root.id}" style="border:1px solid #e2e8f0; background:#fff; margin-bottom:10px; border-radius:6px; overflow:hidden;">
                <div style="padding:10px; display:flex; justify-content:space-between; align-items:center; background:#f8fafc;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span class="drag-handle-cat" style="cursor:grab; color:#94a3b8;">:::</span>
                        <strong style="font-size:15px;">${rootName}</strong>
                        <span style="font-size:11px; color:#94a3b8;">${root.slug}</span>
                    </div>
                    <div class="action-group">
                        <button class="btn-icon" onclick="AdminCats.openEditModal(${root.id})">✎</button>
                        <button class="btn-icon red" onclick="AdminCats.delete(${root.id})">🗑</button>
                    </div>
                </div>

                <div class="subcat-container" style="padding:5px 10px 10px 40px;">
                    ${childs.map(sub => {
                        const subName = isUA ? (sub.title_ua || sub.title_ru) : sub.title_ru;
                        // 3. Подподкатегории (уровень 3)
                        const subChilds = this.allCats.filter(c => c.parent_slug === sub.slug);

                        return `
                        <div style="margin-bottom:10px; border-bottom:1px solid #f1f5f9; padding-bottom:5px;">
                            <div class="subcat-row" data-id="${sub.id}" style="display:flex; justify-content:space-between; align-items:center;">
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <span class="drag-handle-cat" style="cursor:grab; color:#ccc; font-size:12px;">::</span>
                                    <span style="font-weight:600;">${subName}</span>
                                </div>
                                <div class="action-group" style="scale:0.8;">
                                    <button class="btn-icon" onclick="AdminCats.openEditModal(${sub.id})">✎</button>
                                    <button class="btn-icon red" onclick="AdminCats.delete(${sub.id})">🗑</button>
                                </div>
                            </div>

                            <div style="padding-left:25px; margin-top:5px;">
                                ${subChilds.map(ss => {
                                    const ssName = isUA ? (ss.title_ua || ss.title_ru) : ss.title_ru;
                                    return `
                                    <div style="display:flex; justify-content:space-between; font-size:13px; padding:2px 0;">
                                        <span>└ ${ssName} <small style="color:#94a3b8">${ss.slug}</small></span>
                                        <div class="action-group" style="scale:0.7;">
                                            <button class="btn-icon" onclick="AdminCats.openEditModal(${ss.id})">✎</button>
                                            <button class="btn-icon red" onclick="AdminCats.delete(${ss.id})">🗑</button>
                                        </div>
                                    </div>`;
                                }).join('')}
                                <button onclick="AdminCats.openEditModal(null, '${sub.slug}')" style="background:none; border:none; color:#189BFF; font-size:11px; cursor:pointer; padding:0;">+ подподкатегория</button>
                            </div>
                        </div>`;
                    }).join('')}
                    <button onclick="AdminCats.openEditModal(null, '${root.slug}')" style="margin-top:5px; background:none; border:1px dashed #cbd5e1; color:#64748b; font-size:12px; padding:4px 10px; border-radius:4px; cursor:pointer;">+ Подкатегория</button>
                </div>
            </div>`;
        });
        container.innerHTML = html || 'Категории не созданы';

        // 1. Сортировка РОДИТЕЛЕЙ (Уровень 1)
        new Sortable(container, {
            handle: '.drag-handle-cat',
            animation: 150,
            onEnd: () => AdminCats.saveOrder(container)
        });

        // 2. Сортировка ПОДКАТЕГОРИЙ (Уровень 2 внутри каждого родителя)
        document.querySelectorAll('.subcat-container').forEach(subContainer => {
            new Sortable(subContainer, {
                handle: '.drag-handle-cat',
                animation: 150,
                // Фильтруем, чтобы не захватывать кнопки и под-под-контейнеры при перетаскивании
                draggable: '.subcat-group, .subcat-row',
                onEnd: () => AdminCats.saveOrder(container) // Сохраняем общий порядок
            });
        });

        // 3. Сортировка ПОДПОДКАТЕГОРИЙ (Уровень 3)
        document.querySelectorAll('.sub-subcat-container').forEach(ssContainer => {
            new Sortable(ssContainer, {
                handle: '.drag-handle-cat',
                animation: 150,
                draggable: '.sub-subcat-row',
                onEnd: () => AdminCats.saveOrder(container)
            });
        });
    },

    // Обновляем <select> во всех формах (фильтры, создание товара)
    updateSelects: function() {
        const filterSel = document.getElementById('f_category');
        const productSel = document.getElementById('p_category');
        const parentSel = document.getElementById('c_parent');
        const isUA = this.lang === 'ua';

        let htmlOpts = `<option value="">${isUA ? '-- Оберіть --' : '-- Выберите --'}</option>`;
        let parentOpts = `<option value="">${isUA ? '-- Немає (Коренева) --' : '-- Нет (Корневая) --'}</option>`;

        this.allCats.filter(c => !c.parent_slug).forEach(root => {
            const rootName = isUA ? (root.title_ua || root.title_ru) : root.title_ru;
            htmlOpts += `<option value="${root.slug}" style="font-weight:bold;">${rootName}</option>`;
            parentOpts += `<option value="${root.slug}">${rootName}</option>`;

            this.allCats.filter(c => c.parent_slug === root.slug).forEach(sub => {
                const subName = isUA ? (sub.title_ua || sub.title_ru) : sub.title_ru;
                htmlOpts += `<option value="${sub.slug}">&nbsp;&nbsp;↳ ${subName}</option>`;
                parentOpts += `<option value="${sub.slug}">&nbsp;&nbsp;↳ ${subName}</option>`;

                // ТРЕТИЙ УРОВЕНЬ
                this.allCats.filter(c => c.parent_slug === sub.slug).forEach(ss => {
                    const ssName = isUA ? (ss.title_ua || ss.title_ru) : ss.title_ru;
                    htmlOpts += `<option value="${ss.slug}">&nbsp;&nbsp;&nbsp;&nbsp;↳ ${ssName}</option>`;
                    parentOpts += `<option value="${ss.slug}">&nbsp;&nbsp;&nbsp;&nbsp;↳ ${ssName}</option>`;
                });
            });
        });

        if(filterSel) filterSel.innerHTML = `<option value="">${isUA ? 'Всі категорії' : 'Все категории'}</option>` + htmlOpts;
        if(productSel) productSel.innerHTML = htmlOpts;
        if(parentSel) parentSel.innerHTML = parentOpts;

        // Обновляем словарь для таблицы
        if (typeof AdminProducts !== 'undefined') {
            AdminProducts.categories = {};
            this.allCats.forEach(c => {
                AdminProducts.categories[c.slug] = isUA ? (c.title_ua || c.title_ru) : c.title_ru;
            });
            if(document.getElementById('productsTableBody')) AdminProducts.renderLocal();
        }
    },

    openManager: function() {
        document.getElementById('catsModal').classList.add('active');
        this.load();
    },
    closeManager: function() {
        document.getElementById('catsModal').classList.remove('active');
        // Обновляем товары, вдруг названия поменялись
        if(typeof AdminProducts !== 'undefined') AdminProducts.load();
    },

    // Редактирование / Создание
    openEditModal: function(id, parentSlug = null) {
        const modal = document.getElementById('catEditModal');
        const form = modal.querySelector('form');
        form.reset();

        document.getElementById('c_img_preview').style.display = 'none';
        document.getElementById('c_img_placeholder').style.display = 'block';
        document.getElementById('c_image_url').value = '';

        if (id) {
            const cat = this.allCats.find(c => c.id === id);
            document.getElementById('c_id').value = cat.id;
            document.getElementById('c_title_ru').value = cat.title_ru;
            document.getElementById('c_title_ua').value = cat.title_ua;
            document.getElementById('c_slug').value = cat.slug;
            document.getElementById('c_parent').value = cat.parent_slug || '';
            document.getElementById('c_image_url').value = cat.image_url || '';
            if(cat.image_url) {
                const img = document.getElementById('c_img_preview');
                img.src = cat.image_url;
                img.style.display = 'block';
                document.getElementById('c_img_placeholder').style.display = 'none';
            }
            document.getElementById('catModalTitle').textContent = 'Редактирование';
        } else {
            document.getElementById('c_id').value = '';
            document.getElementById('c_parent').value = parentSlug || '';
            document.getElementById('catModalTitle').textContent = 'Новая группа';
        }
        modal.classList.add('active');
    },

    uploadImage: async function(input) {
        if (!input.files || !input.files[0]) return;
        const formData = new FormData();
        formData.append('file', input.files[0]);
        try {
            const res = await fetch('/api/admin/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if(data.success) {
                document.getElementById('c_image_url').value = data.path;
                const img = document.getElementById('c_img_preview');
                img.src = data.path;
                img.style.display = 'block';
                document.getElementById('c_img_placeholder').style.display = 'none';
            }
        } catch(e) { console.error(e); }
    },

    save: async function() {
        const data = {
            id: document.getElementById('c_id').value || null,
            slug: document.getElementById('c_slug').value.trim(),
            parent_slug: document.getElementById('c_parent').value || null,
            title_ru: document.getElementById('c_title_ru').value,
            title_ua: document.getElementById('c_title_ua').value,
            image_url: document.getElementById('c_image_url').value
        };

        try {
            const res = await fetch('/api/admin/category/save', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body: JSON.stringify(data)
            });
            const ans = await res.json();
            if(ans.success) {
                document.getElementById('catEditModal').classList.remove('active');
                this.load(); // Перезагружаем список
            } else { alert('Ошибка сохранения'); }
        } catch(e) { console.error(e); }
    },

    delete: async function(id) {
        if(!confirm('Удалить категорию? Товары могут остаться без группы.')) return;
        await fetch('/api/admin/category/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id}) });
        this.load();
    },

    saveOrder: async function(container) {
        // Собираем ID родителей
        const ids = Array.from(container.querySelectorAll('.cat-item-row')).map(el => el.getAttribute('data-id'));
        await fetch('/api/admin/category/reorder', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ids}) });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Определяем страницу и запускаем нужное
    if (document.getElementById('ordersTableBody')) {
        Admin.init();
    }
    if (document.getElementById('productsTableBody')) {
        AdminProducts.init();
    }
    if (document.getElementById('showcaseContainer')) {
        AdminShowcase.init();
    }
    // Для категорий (Только если есть модалка категорий)
    if (document.getElementById('catsModal')) {
        AdminCats.init();
    }
    if (document.getElementById('reviewsContainer')) {
        AdminReviews.init();
    }
    // 2. Инициализация глобальных элементов (Меню есть на ВСЕХ страницах)
    // Ставим это в конец, без проверок if, так как сайдбар есть везде.
    if (typeof AdminSidebar !== 'undefined') {
        AdminSidebar.init();
    }
    if (document.getElementById('s_site_url')) {
        AdminSettings.init();
    }
});

// === УПРАВЛЕНИЕ БАННЕРАМИ (ФОТО + ВИДЕО CROP) ===
const AdminBanners = {
    cropper: null,
    currentFile: null,
    isEditMode: false, // Редактируем старый или грузим новый?
    editId: null,      // ID баннера при редактировании

    init: function() {
        if (!document.getElementById('bannersGrid')) return;
        this.lang = document.documentElement.lang === 'uk' ? 'ua' : 'ru';
        this.load();
    },

    load: async function() {
        const container = document.getElementById('bannersGrid');
        try {
            const res = await fetch('/api/admin/banners');
            const data = await res.json();
            if (data.success) this.render(data.banners);
        } catch(e) { console.error(e); }
    },

    render: function(list) {
        const container = document.getElementById('bannersGrid');
        const isUA = this.lang === 'ua';

        if (list.length === 0) {
            container.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:#94a3b8;">${isUA ? 'Банерів немає.' : 'Баннеров нет.'}</div>`;
            return;
        }

        container.innerHTML = list.map(b => {
            let mediaHtml = '';

            if (b.file_type === 'video') {
                // ИЗМЕНЕНИЯ:
                // 1. Убрал autoplay
                // 2. onmouseenter/leave перенес на DIV-обертку
                // 3. pointer-events: none осталось на видео, чтобы не было кнопок браузера
                mediaHtml = `
                <div style="position:relative; width:100%; height:120px; overflow:hidden; background:#000; cursor: pointer;"
                     onmouseenter="const v = this.querySelector('video'); v.play();"
                     onmouseleave="const v = this.querySelector('video'); v.pause(); v.currentTime = 0;">

                    <video src="${b.filename}"
                           style="width:100%; height:100%; object-fit:contain; ${b.css_style}; pointer-events: none;"
                           muted loop playsinline disablepictureinpicture tabindex="-1">
                    </video>

                    <div style="position:absolute; top:0; left:0; width:100%; height:100%; z-index:10;"></div>
                </div>`;
            } else {
                mediaHtml = `<img src="${b.filename}" class="banner-preview">`;
            }

            const visBadge = b.is_visible
                ? `<span class="badge badge-vis">OK</span>`
                : `<span class="badge badge-hid">OFF</span>`;

            const btnEditTitle = isUA ? 'Змінити область' : 'Изменить область';

            return `
            <div class="banner-card" data-id="${b.id}" data-type="${b.file_type}" data-src="${b.filename}">
                ${mediaHtml}
                <div class="banner-footer">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div class="drag-handle" title="Move">:::</div>
                        ${visBadge}
                    </div>
                    <div class="action-group">
                        <button class="btn-icon" title="${btnEditTitle}" onclick="AdminBanners.editCrop(${b.id}, '${b.filename}', '${b.file_type}')">✂️</button>
                        <button class="btn-icon" onclick="AdminBanners.toggleVis(${b.id}, ${b.is_visible})">${b.is_visible ? '👁️' : '🙈'}</button>
                        <button class="btn-icon red" onclick="AdminBanners.delete(${b.id})">🗑️</button>
                    </div>
                </div>
            </div>`;
        }).join('');

        new Sortable(container, {
            handle: '.drag-handle',
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: () => this.saveOrder()
        });
    },

    // === 1. ЗАГРУЗКА НОВОГО ФАЙЛА ===
    handleFileSelect: async function(input) {
        if (!input.files || !input.files[0]) return;
        this.currentFile = input.files[0];
        this.isEditMode = false;

        const isVideo = this.currentFile.type.startsWith('video/');

        if (isVideo) {
            // Для видео: извлекаем кадр для Кроппера
            await this.openVideoCropper(this.currentFile);
        } else {
            // Для фото: обычный ридер
            const reader = new FileReader();
            reader.onload = (e) => this.initCropper(e.target.result, false);
            reader.readAsDataURL(this.currentFile);
        }
        input.value = '';
    },

    // === 2. РЕДАКТИРОВАНИЕ СУЩЕСТВУЮЩЕГО ===
    editCrop: async function(id, src, type) {
        this.isEditMode = true;
        this.editId = id;

        if (type === 'video') {
            // Грузим видео как Blob (чтобы захватить кадр), или пробуем captureVideoFrame по URL
            // Упростим: просто создадим видео элемент с src
            this.captureFrameFromUrl(src);
        } else {
            // Для картинок редактирование кропа невозможно без оригинала.
            // Но пользователь просил "править".
            // Если картинка уже обрезана, мы можем только обрезать её ЕЩЕ раз.
            this.initCropper(src, false);
        }
    },

    // --- ЛОГИКА ВИДЕО: Получить кадр ---
    openVideoCropper: function(file) {
        const url = URL.createObjectURL(file);
        this.captureFrameFromUrl(url);
    },

    captureFrameFromUrl: function(url) {
        const video = document.createElement('video');
        video.src = url;
        video.muted = true;
        video.crossOrigin = "anonymous"; // важно для существующих файлов
        video.currentTime = 1; // Берем кадр на 1й секунде

        video.onloadeddata = async () => {
             // Ждем чуть-чуть, чтобы кадр точно отрендерился
             video.play(); // Запускаем на миг
             setTimeout(() => {
                 video.pause();
                 const canvas = document.createElement('canvas');
                 canvas.width = video.videoWidth;
                 canvas.height = video.videoHeight;
                 const ctx = canvas.getContext('2d');
                 ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                 const dataUrl = canvas.toDataURL();
                 this.initCropper(dataUrl, true); // true = isVideo
             }, 300);
        };
        video.load();
    },

    // --- ЗАПУСК КРОППЕРА (ОБЩИЙ) ---
    initCropper: function(imgSrc, isVideoContext) {
        const image = document.getElementById('cropImage');
        image.src = imgSrc;
        this.isVideoContext = isVideoContext;

        document.getElementById('cropModal').classList.add('active');

        // Удаляем старый, если был
        if (this.cropper) this.cropper.destroy();

        this.cropper = new Cropper(image, {
            viewMode: 1, // Ограничить рамками
            autoCropArea: 0.8,
            zoomable: true,
            movable: true,
            // Для видео свободный аспект (или можно задать 3/1 как у баннера)
            aspectRatio: NaN,
        });
    },

    // === 3. ПОДТВЕРЖДЕНИЕ ===
    confirmCrop: function() {
        if (!this.cropper) return;

        // A) Если это КАРТИНКА и мы грузим НОВУЮ -> Физическая обрезка
        if (!this.isVideoContext && !this.isEditMode) {
            this.cropper.getCroppedCanvas().toBlob((blob) => {
                const ext = this.currentFile.name.split('.').pop() || 'jpg';
                const newFile = new File([blob], "banner." + ext, { type: "image/" + ext });
                this.uploadFile(newFile, ''); // Стиль пустой, так как файл обрезан
                this.closeCropModal();
            });
            return;
        }

        // B) Если это ВИДЕО или РЕДАКТИРОВАНИЕ -> Виртуальная обрезка (CSS)
        // Считаем проценты
        const data = this.cropper.getData(); // x, y, width, height (px)
        const imgData = this.cropper.getImageData(); // naturalWidth, naturalHeight

        // Формула CSS для зума в точку:
        // Контейнер (на сайте) имеет overflow:hidden.
        // Видео внутри должно быть растянуто так, чтобы видимая зона заполнила контейнер.

        // 1. Считаем Scale (насколько кроп меньше оригинала)
        // scale = naturalWidth / cropWidth
        const scaleX = imgData.naturalWidth / data.width;
        const scaleY = imgData.naturalHeight / data.height;
        // Берем максимальный скейл, чтобы заполнить (обычно cover)
        // Но для точного позиционирования:

        // Простой CSS метод:
        // width: (100 * scaleX)%
        // transform: translate( -x_percent%, -y_percent% )

        const widthPct = (imgData.naturalWidth / data.width) * 100;
        const heightPct = (imgData.naturalHeight / data.height) * 100;

        const xPct = (data.x / imgData.naturalWidth) * 100;
        const yPct = (data.y / imgData.naturalHeight) * 100;

        // Чтобы сместить правильно при увеличенной ширине:
        // margin-left = - (x / crop_width) * 100% ... это сложно для margin.
        // Используем object-position? Нет, он не зумит (только позиционирует внутри cover).
        // Используем transform: scale и transform-origin?

        // САМЫЙ НАДЕЖНЫЙ ВАРИАНТ:
        // width: ${widthPct}%;
        // height: ${heightPct}%;
        // margin-left: -${xPct * (widthPct/100)}%;  <-- нет, это от родителя
        // transform: translate(-${(data.x / data.width) * 100}%, -${(data.y / data.height) * 100}%) <-- нет, это от самого элемента

        // Давайте проще:
        // Мы растягиваем видео до widthPct.
        // И сдвигаем его влево на data.x (в процентах от НОВОЙ ширины).

        const cssStyle = `
            width: ${widthPct.toFixed(2)}% !important;
            height: ${heightPct.toFixed(2)}% !important;
            max-width: none !important;
            transform: translate(-${((data.x / imgData.naturalWidth)*100).toFixed(2)}%, -${((data.y / imgData.naturalHeight)*100).toFixed(2)}%) !important;
            transform-origin: 0 0 !important;
            object-fit: fill !important;
        `;

        if (this.isEditMode) {
            // Просто обновляем стиль в БД
            this.updateStyle(this.editId, cssStyle);
        } else {
            // Грузим файл + стиль
            this.uploadFile(this.currentFile, cssStyle);
        }
        this.closeCropModal();
    },

    closeCropModal: function() {
        document.getElementById('cropModal').classList.remove('active');
        if (this.cropper) { this.cropper.destroy(); this.cropper = null; }
    },

    // --- API ЗАПРОСЫ ---
    uploadFile: async function(file, cssStyle) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('css_style', cssStyle);

        const btn = document.querySelector('.btn-primary');
        const oldText = btn.textContent;
        btn.textContent = '⏳...'; btn.disabled = true;

        try {
            const res = await fetch('/api/admin/banner/upload', { method: 'POST', body: formData });
            const d = await res.json();
            if (d.success) this.load();
            else alert('Error: ' + d.error);
        } catch(e) { console.error(e); }
        btn.textContent = oldText; btn.disabled = false;
    },

    updateStyle: async function(id, cssStyle) {
        try {
            await fetch('/api/admin/banner/update_style', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({id, css_style: cssStyle})
            });
            this.load();
        } catch(e) { console.error(e); }
    },

    delete: async function(id) {
        if(!confirm('Удалить?')) return;
        await fetch('/api/admin/banner/delete', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({id})
        });
        this.load();
    },

    toggleVis: async function(id, cur) {
        await fetch('/api/admin/banner/visibility', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({id, is_visible: !cur})
        });
        this.load();
    },

    saveOrder: async function() {
        const ids = Array.from(document.querySelectorAll('.banner-card')).map(el => el.getAttribute('data-id'));
        await fetch('/api/admin/banner/reorder', {
            method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ids})
        });
    }
};

// === АДМИНКА ОТЗЫВОВ ===
const AdminReviews = {
    lang: 'ru', // По умолчанию

    init: function() {
        // Определяем язык по тегу html или URL
        this.lang = document.documentElement.lang === 'uk' || window.location.pathname.includes('/ua/') ? 'ua' : 'ru';

        if (document.getElementById('reviewsContainer')) {
            this.load();
        }
    },

    load: async function() {
        const container = document.getElementById('reviewsContainer');
        const loadingText = this.lang === 'ua' ? 'Завантаження...' : 'Загрузка...';
        container.innerHTML = `<div style="text-align:center; padding:20px;">${loadingText}</div>`;

        try {
            const res = await fetch('/api/admin/reviews');
            const data = await res.json();
            if (data.success) {
                this.render(data.reviews);
            } else {
                container.innerHTML = 'Error';
            }
        } catch (e) {
            console.error(e);
            container.innerHTML = 'Connection Error';
        }
    },

    render: function(list) {
        const container = document.getElementById('reviewsContainer');
        const isUA = this.lang === 'ua';

        if (list.length === 0) {
            container.innerHTML = `<div style="text-align:center;">${isUA ? 'Відгуків поки немає' : 'Отзывов пока нет'}</div>`;
            return;
        }

        const TEXT = {
            replyLabel: isUA ? 'Відповідь адміністратора:' : 'Ответ администратора:',
            placeholder: isUA ? 'Напишіть відповідь...' : 'Напишите ответ...',
            visible: isUA ? '👁️ Видно' : '👁️ Виден',
            hidden: isUA ? '🙈 Приховано' : '🙈 Скрыт',
            delete: isUA ? 'Видалити' : 'Удалить',
            save: isUA ? 'Зберегти' : 'Сохранить',
            confirmDel: isUA ? 'Видалити цей відгук безповоротно?' : 'Удалить этот отзыв безвозвратно?',
            saved: isUA ? 'Збережено!' : 'Сохранено!'
        };

        container.innerHTML = list.map(r => {
            const replyVal = r.reply || '';
            const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);

            const isVis = (r.is_visible == 1) ? 1 : 0;
            const isHiddenClass = isVis ? '' : 'hidden-rev';
            const visBtnText = isVis ? TEXT.visible : TEXT.hidden;

            return `
            <div class="rev-admin-card ${isHiddenClass}" id="arev-${r.id}">
                <div class="ra-head">
                    <div>
                        <span class="ra-author">${r.author}</span>
                        <span style="color:#f59e0b; margin-left:8px;">${stars}</span>
                    </div>
                    <div class="ra-date">${r.date}</div>
                </div>
                <div class="ra-text">${r.comment}</div>

                <div class="ra-reply-box">
                    <label class="ra-reply-label">${TEXT.replyLabel}</label>
                    <textarea class="ra-textarea" id="reply-${r.id}" placeholder="${TEXT.placeholder}">${replyVal}</textarea>
                    <div class="ra-actions">
                        <div>
                            <button class="btn-small btn-vis" onclick="AdminReviews.toggleVis(${r.id}, ${isVis})">${visBtnText}</button>
                            <button class="btn-small btn-red" onclick="AdminReviews.delete(${r.id}, '${TEXT.confirmDel}')">${TEXT.delete}</button>
                        </div>
                        <button class="btn-small btn-blue" onclick="AdminReviews.saveReply(${r.id}, '${TEXT.saved}')">${TEXT.save}</button>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    },

    saveReply: async function(id, successMsg) {
        const text = document.getElementById(`reply-${id}`).value;
        try {
            const res = await fetch('/api/admin/review/reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id, reply: text })
            });
            const d = await res.json();
            if(d.success) {
                alert(successMsg);
                this.load();
            }
        } catch(e){ alert('Error'); }
    },

    toggleVis: async function(id, curState) {
        const newState = (curState == 1) ? 0 : 1;
        try {
            const res = await fetch('/api/admin/review/visibility', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id, is_visible: newState })
            });
            if (res.ok) {
                this.load();
            } else {
                alert('Server Error');
            }
        } catch(e){ console.error(e); }
    },

    delete: async function(id, confirmMsg) {
        if(!confirm(confirmMsg)) return;
        try {
            await fetch('/api/admin/review/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id })
            });
            document.getElementById(`arev-${id}`).remove();
        } catch(e){ alert('Error'); }
    }
};

// === СИСТЕМА УВЕДОМЛЕНИЙ В МЕНЮ ===
const AdminSidebar = {
    init: function() {
        this.checkReviewsBadge();
    },

    checkReviewsBadge: async function() {
        // Ищем ссылку "Отзывы" в меню (ищем по части ссылки 'reviews')
        const links = document.querySelectorAll('.nav-links a');
        let reviewLink = null;
        links.forEach(a => {
            const href = a.getAttribute('href');
            if (href && href.includes('reviews')) reviewLink = a;
        });

        if (!reviewLink) return;

        try {
            // 1. Узнаем, сколько всего отзывов в базе
            const res = await fetch('/api/admin/reviews/count_all');
            const data = await res.json();

            if (data.success) {
                const serverCount = data.count;

                // 2. Узнаем, сколько мы видели в последний раз
                const localCount = parseInt(localStorage.getItem('admin_reviews_seen_count') || '0');

                // 3. Если мы сейчас НА странице отзывов — обновляем просмотры сразу
                if (window.location.href.includes('/reviews')) {
                    localStorage.setItem('admin_reviews_seen_count', serverCount);
                    return; // Бейдж не нужен, мы уже тут и всё видим
                }

                // 4. Считаем разницу
                const newItems = serverCount - localCount;

                if (newItems > 0) {
                    // Рисуем кружочек
                    const badge = document.createElement('span');
                    badge.style.background = '#ef4444';
                    badge.style.color = 'white';
                    badge.style.fontSize = '11px';
                    badge.style.fontWeight = 'bold';
                    badge.style.padding = '2px 6px';
                    badge.style.borderRadius = '10px';
                    badge.style.marginLeft = '8px';
                    badge.style.verticalAlign = 'middle';
                    badge.textContent = `+${newItems}`;

                    reviewLink.appendChild(badge);
                }
            }
        } catch (e) {
            console.error('Ошибка проверки уведомлений:', e);
        }
    }
};

// === НАСТРОЙКИ И БЭКАПЫ ===
const AdminSettings = {
    init: function() {
        if (!document.getElementById('s_site_url')) return;
        this.load();
        this.loadBackups();
    },

    openTab: function(tabName) {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

        document.getElementById(`tab-${tabName}`).classList.add('active');
        // Находим кнопку, на которую нажали (по тексту или onclick, но проще перебором)
        // В данном простом варианте подсветим нужную кнопку по индексу или просто логикой в HTML
        // Упростим:
        const btns = document.querySelectorAll('.tab-btn');
        if(tabName === 'seo') btns[0].classList.add('active');
        if(tabName === 'backups') btns[1].classList.add('active');
        if(tabName === 'crm') btns[2].classList.add('active');
    },

    load: async function() {
        try {
            const res = await fetch('/api/admin/settings');
            const data = await res.json();
            if (data.success) {
                const s = data.settings;
                if(document.getElementById('s_site_url')) document.getElementById('s_site_url').value = s.site_url || '';
                if(document.getElementById('s_google_ver')) document.getElementById('s_google_ver').value = s.google_verification || '';
                if(document.getElementById('s_robots')) document.getElementById('s_robots').value = s.robots_txt || '';
                if(document.getElementById('s_crm_key')) document.getElementById('s_crm_key').value = s.crm_api_key || '';
            }
        } catch(e) { console.error(e); }
    },

    save: async function() {
        const data = {
            site_url: document.getElementById('s_site_url').value,
            google_verification: document.getElementById('s_google_ver').value,
            robots_txt: document.getElementById('s_robots').value,
            crm_api_key: document.getElementById('s_crm_key').value
        };

        try {
            const res = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
            const ans = await res.json();
            if(ans.success) alert('Настройки сохранены!');
            else alert('Ошибка');
        } catch(e) { alert('Ошибка сети'); }
    },

    loadBackups: async function() {
        const list = document.getElementById('backupsContainer');
        if(!list) return;

        try {
            const res = await fetch('/api/admin/backups');
            const data = await res.json();

            if(data.success && data.backups.length > 0) {
                list.innerHTML = data.backups.map(file => `
                    <li class="backup-item">
                        <div>
                            <strong>${file}</strong>
                        </div>
                        <button class="btn-restore" onclick="AdminSettings.restore('${file}')">Восстановить</button>
                    </li>
                `).join('');
            } else {
                list.innerHTML = '<li style="padding:10px;">Бэкапов нет</li>';
            }
        } catch(e) { console.error(e); }
    },

    restore: async function(filename) {
        if(!confirm(`ВНИМАНИЕ! \nВсе текущие изменения в базе (заказы, товары) будут потеряны и заменены версией от ${filename}.\n\nВы уверены?`)) return;

        try {
            const res = await fetch('/api/admin/backup/restore', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ filename })
            });
            const data = await res.json();
            if(data.success) {
                alert('База восстановлена! Страница будет перезагружена.');
                location.reload();
            } else {
                alert('Ошибка: ' + data.error);
            }
        } catch(e) { alert('Ошибка сети'); }
    }
};