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
    const statusList = ['Новый', 'Принятие решения', 'Оплаченный', 'Выполнение', 'Отменено', 'Выполнен'];

    // Определяем язык
    const isUA = this.lang === 'ua';

    // 2. Словарь перевода статусов для отображения
    const statusTranslate = {
        'Новый': 'Новий',
        'Принятие решения': 'Прийняття рішення',
        'Оплаченный': 'Оплачений',
        'Выполнение': 'Виконання',
        'Отменено': 'Скасовано',
        'Выполнен': 'Виконано'
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
            list = list.filter(p => {
                const searchStr = (p.title_ru + ' ' + (p.sku || '')).toLowerCase();
                return searchStr.includes(this.searchQuery);
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
                const catName = catMap[p.category] || this.categories[p.category] || p.category;

                // ДОБАВЛЕН data-cat="${p.category}"
                html += `
                <tr class="tr-category" data-cat="${p.category}" style="cursor:pointer; background:#e2e8f0;" onclick="AdminProducts.toggleCategory('${p.category}')" id="btn-cat-${p.category}">
                    <td colspan="9" style="padding:10px 15px; font-weight:800; color:#0f172a; text-transform:uppercase;">
                        <span class="cat-arrow" style="display:inline-block; transition:transform 0.2s; margin-right:8px;">▼</span> ${catName}
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
            document.getElementById('p_category').value = product.category;
            document.getElementById('p_stock').value = product.in_stock;
            document.getElementById('p_desc_ru').value = product.description_ru || '';
            document.getElementById('p_desc_ua').value = product.description_ua || '';
            document.getElementById('p_on_index').checked = (product.on_index == 1);

            // Новые SEO поля
            document.getElementById('p_seo_title').value = product.seo_title || '';
            document.getElementById('p_seo_desc').value = product.seo_description || '';

            // --- ЗАГРУЗКА ФОТО ---
            if(product.images && product.images.length > 0) {
                 // 1. Главное фото (первое в массиве)
                 const mainImg = product.images[0];
                 if(mainImg) {
                     document.getElementById('path_main').value = mainImg;
                     document.getElementById('preview_main').src = mainImg;
                     document.getElementById('preview_main').style.display = 'block';
                     document.getElementById('placeholder_main').style.display = 'none';
                 }

                 // 2. Галерея (все остальные, начиная со 2-го)
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
                document.getElementById('preview_main').src = data.path;
                document.getElementById('preview_main').style.display = 'block';
                document.getElementById('placeholder_main').style.display = 'none';
            } else { alert('Ошибка: ' + data.error); }
        } catch(e) { console.error(e); }
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

    // Вспомогательная: рисует квадратик фото в галерее
    addGalleryItem: function(path) {
        const container = document.getElementById('gallery_container');
        const div = document.createElement('div');
        div.style.cssText = 'position:relative; width:60px; height:60px; border:1px solid #ddd; border-radius:4px;';
        div.innerHTML = `
            <img src="${path}" style="width:100%; height:100%; object-fit:cover; border-radius:4px;">
            <input type="hidden" class="gallery-item-path" value="${path}">
            <button type="button" onclick="this.parentElement.remove()"
                    style="position:absolute; top:-5px; right:-5px; background:red; color:white; border:none; border-radius:50%; width:16px; height:16px; font-size:10px; cursor:pointer; display:flex; align-items:center; justify-content:center;">×</button>
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

        const isUA = document.documentElement.lang === 'uk';
        // Отделяем родителей и детей
        const roots = this.allCats.filter(c => !c.parent_slug);
        const childs = this.allCats.filter(c => c.parent_slug);

        let html = '';

        roots.forEach(root => {
            const rootName = isUA ? (root.title_ua || root.title_ru) : root.title_ru;

            // Ищем детей этой группы
            const myChilds = childs.filter(c => c.parent_slug === root.slug);

            // Рендер родителя
            html += `
            <div class="cat-item-row" data-id="${root.id}" style="border:1px solid #e2e8f0; background:#fff; margin-bottom:10px; border-radius:6px; overflow:hidden;">
                <div style="padding:10px; display:flex; justify-content:space-between; align-items:center; background:#f8fafc;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span class="drag-handle-cat" style="cursor:grab; color:#94a3b8;">:::</span>
                        <strong style="font-size:15px;">${rootName}</strong>
                        <span style="font-size:12px; color:#64748b; background:#e2e8f0; padding:2px 6px; border-radius:4px;">${root.slug}</span>
                    </div>
                    <div class="action-group">
                        <button class="btn-icon" onclick="AdminCats.openEditModal(${root.id})">✎</button>
                        <button class="btn-icon red" onclick="AdminCats.delete(${root.id})">🗑</button>
                    </div>
                </div>

                <div class="subcat-container" data-parent="${root.id}" style="padding:5px 10px 10px 40px;">
                    ${myChilds.map(sub => {
                        const subName = isUA ? (sub.title_ua || sub.title_ru) : sub.title_ru;
                        return `
                        <div class="subcat-row" data-id="${sub.id}" style="display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px dashed #eee;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span class="drag-handle-cat" style="cursor:grab; color:#ccc; font-size:12px;">::</span>
                                <span>${subName}</span>
                                <span style="font-size:11px; color:#94a3b8;">${sub.slug}</span>
                            </div>
                            <div class="action-group" style="scale:0.8;">
                                <button class="btn-icon" onclick="AdminCats.openEditModal(${sub.id})">✎</button>
                                <button class="btn-icon red" onclick="AdminCats.delete(${sub.id})">🗑</button>
                            </div>
                        </div>`;
                    }).join('')}

                    <button onclick="AdminCats.openEditModal(null, '${root.slug}')" style="margin-top:5px; background:none; border:1px dashed #cbd5e1; color:#64748b; font-size:12px; padding:4px 10px; border-radius:4px; cursor:pointer;">+ Подкатегория</button>
                </div>
            </div>`;
        });

        container.innerHTML = html;

        // Включаем сортировку (только для родителей пока, чтобы не усложнять)
        new Sortable(container, {
            handle: '.drag-handle-cat',
            animation: 150,
            onEnd: () => AdminCats.saveOrder(container)
        });
    },

    // Обновляем <select> во всех формах (фильтры, создание товара)
    updateSelects: function() {
        // 1. Фильтр в таблице товаров
        const filterSel = document.getElementById('f_category');
        // 2. Выбор категории в модальном окне товара
        const productSel = document.getElementById('p_category');
        // 3. Выбор родителя в модальном окне категорий
        const parentSel = document.getElementById('c_parent');

        const isUA = document.documentElement.lang === 'uk';
        const roots = this.allCats.filter(c => !c.parent_slug);

        // Генерируем опции для селектов
        let htmlOpts = `<option value="">${isUA?'-- Оберіть --':'-- Выберите --'}</option>`;
        let parentOpts = `<option value="">${isUA?'-- Немає (Коренева) --':'-- Нет (Корневая) --'}</option>`;

        roots.forEach(root => {
            const rootName = isUA ? (root.title_ua || root.title_ru) : root.title_ru;

            // Группа
            htmlOpts += `<option value="${root.slug}" style="font-weight:bold;">${rootName}</option>`;
            parentOpts += `<option value="${root.slug}">${rootName}</option>`;

            // Подгруппы
            const childs = this.allCats.filter(c => c.parent_slug === root.slug);
            childs.forEach(sub => {
                const subName = isUA ? (sub.title_ua || sub.title_ru) : sub.title_ru;
                // Для товара значение будет "parent_slug", а подкатегорию сохраним в отдельное поле
                // НО! В вашей системе проще хранить slug подкатегории как category,
                // или нам нужно менять логику.
                // Давайте пока сделаем так: значение = slug подкатегории.
                htmlOpts += `<option value="${sub.slug}">&nbsp;&nbsp;&nbsp;↳ ${subName}</option>`;
            });
        });

        if(filterSel) {
            const oldVal = filterSel.value;
            filterSel.innerHTML = `<option value="">${isUA?'Всі категорії':'Все категории'}</option>` + htmlOpts;
            filterSel.value = oldVal;
        }
        if(productSel) {
            const oldVal = productSel.value;
            productSel.innerHTML = htmlOpts;
            productSel.value = oldVal;
        }
        if(parentSel) {
            parentSel.innerHTML = parentOpts;
        }

        // Обновляем словарь названий в AdminProducts (чтобы в таблице были красивые имена)
        if (typeof AdminProducts !== 'undefined') {
            AdminProducts.categories = {}; // Очищаем старый словарь
            this.allCats.forEach(c => {
                AdminProducts.categories[c.slug] = isUA ? (c.title_ua || c.title_ru) : c.title_ru;
            });
            // Перерисовываем таблицу товаров, если она есть, чтобы обновились названия
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

        if (id) {
            const cat = this.allCats.find(c => c.id === id);
            document.getElementById('c_id').value = cat.id;
            document.getElementById('c_title_ru').value = cat.title_ru;
            document.getElementById('c_title_ua').value = cat.title_ua;
            document.getElementById('c_slug').value = cat.slug;
            document.getElementById('c_parent').value = cat.parent_slug || '';
            document.getElementById('catModalTitle').textContent = 'Редактирование';
        } else {
            document.getElementById('c_id').value = '';
            document.getElementById('c_parent').value = parentSlug || '';
            document.getElementById('catModalTitle').textContent = 'Новая группа';
        }
        modal.classList.add('active');
    },

    save: async function() {
        const data = {
            id: document.getElementById('c_id').value || null,
            slug: document.getElementById('c_slug').value.trim(),
            parent_slug: document.getElementById('c_parent').value || null,
            title_ru: document.getElementById('c_title_ru').value,
            title_ua: document.getElementById('c_title_ua').value
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
});

