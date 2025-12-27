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
            sort_dir: this.sortDir
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

        const statusList = ['Новый', 'Необработанный', 'Принятие решения', 'Оплаченный', 'Выполнение', 'Отменено', 'Выполнен'];

        tbody.innerHTML = orders.map(order => {
            // ... (КОД ГЕНЕРАЦИИ ТАБЛИЦЫ ОСТАЕТСЯ ТЕМ ЖЕ, ЧТО И БЫЛ) ...
            // Вставьте сюда код рендеринга из прошлой версии admin.js (itemsHtml, deliveryName и т.д.)
            // Чтобы не дублировать огромный кусок, я его сокращу, но ВЫ ОСТАВЬТЕ СТАРЫЙ renderTable внутри map

            // --- НАЧАЛО ВСТАВКИ ИЗ СТАРОГО КОДА ---
            let itemsHtml = '';
            if(order.items && order.items.length > 0) {
                 itemsHtml = order.items.map(i => {
                    const imgUrl = i.image ? i.image : '';
                    const imgTag = imgUrl
                        ? `<img src="${imgUrl}" style="width:40px; height:40px; object-fit:cover; border-radius:4px; border:1px solid #eee;">`
                        : '<div style="width:40px; height:40px; background:#f1f5f9; border-radius:4px;"></div>';
                    return `<div style="display:flex; align-items:center; gap:10px; border-bottom:1px solid #f1f5f9; padding:6px 0;">
                        ${imgTag}
                        <div style="line-height:1.3;">
                            <div style="font-size:12px; font-weight:600; color:#334155;">${i.title}</div>
                            <div style="font-size:11px; color:#64748b;">Арт: ${i.sku || '-'} | <b>${i.qty} шт.</b></div>
                        </div>
                    </div>`;
                }).join('');
            } else { itemsHtml = '<span style="color:#ccc;">—</span>'; }

            const commentHtml = order.comment ? `<div style="margin-top:8px; padding:8px; background:#fff7ed; border:1px solid #ffedd5; border-radius:4px; font-size:12px; color:#9a3412;">💬 ${order.comment}</div>` : '';

            let deliveryName = order.delivery;
            if(deliveryName === 'np') deliveryName = 'Новая Почта';
            if(deliveryName === 'up') deliveryName = 'Укрпочта Стандарт';
            if(deliveryName === 'upe') deliveryName = 'Укрпочта Экспресс';

            let payMethod = order.payment;
            if(payMethod === 'cod') payMethod = 'Наложенный';

            const options = statusList.map(st => `<option value="${st}" ${order.status === st ? 'selected' : ''}>${st}</option>`).join('');

            // --- КОНЕЦ ВСТАВКИ ---

            return `
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="vertical-align:top; padding:12px;"><strong>#${order.id}</strong></td>
                <td style="vertical-align:top; padding:12px; font-size:12px;">${order.date.split(' ')[0]}<br><span style="color:#999">${order.date.split(' ')[1]}</span></td>
                <td style="vertical-align:top; padding:12px;">
                    <div style="font-weight:600">${order.name}</div>
                    <div style="font-size:12px; color:#64748b;">${order.phone}</div>
                </td>
                <td style="vertical-align:top; padding:8px; font-size:12px;">${itemsHtml}${commentHtml}</td>
                <td style="vertical-align:top; padding:12px;"><strong>${order.total} ₴</strong></td>
                <td style="vertical-align:top; padding:12px; font-size:12px;">
                    <div style="font-weight:700; margin-bottom:4px;">${deliveryName}</div>
                    <div style="color:#555; margin-bottom:8px;">${order.address}</div>
                    <input type="text" placeholder="ТТН..." value="${order.ttn}" onchange="Admin.saveTTN(${order.id}, this.value)" style="width:100%; padding:4px; border:1px solid #ccc; border-radius:4px;">
                    <div style="margin-top:6px; font-style:italic;">${payMethod} ${order.pay_status==='paid'?'<b style="color:green">(Опл)</b>':''}</div>
                </td>
                <td style="vertical-align:top; padding:12px;">
                    <select class="status-select" style="width:100%" onchange="Admin.changeStatus(${order.id}, this.value)">${options}</select>
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

    categories: {
        'solder': 'Паяльное оборудование', 'meas': 'Измерительные приборы',
        'osc': 'Осциллографы', 'prog': 'Программаторы', 'repair': 'Инструменты',
        'consum': 'Расходные материалы', 'rmods': 'Модули',
        'rparts': 'Радиодетали', 'psu': 'Источники питания', 'cables': 'Кабели'
    },

    init: function() {
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
        document.getElementById('f_category').value = '';
        document.getElementById('f_date_from').value = '';
        document.getElementById('f_date_to').value = '';
        document.getElementById('f_search').value = '';
        this.searchQuery = '';
        this.applyFilter();
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

    render: function(list) {
        const tbody = document.getElementById('productsTableBody');
        if(!tbody) return;

        if(list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Нет товаров</td></tr>';
            return;
        }

        const isUA = document.documentElement.lang === 'uk';
        const isGrouped = (this.sortField === 'def' && !this.searchQuery);

        let lastCategory = null;
        let html = '';

        list.forEach(p => {
            if (isGrouped && p.category !== lastCategory) {
                const catName = this.categories[p.category] || p.category;
                html += `<tr class="tr-category"><td colspan="9">${catName}</td></tr>`;
                lastCategory = p.category;
            }

            const img = (p.images && p.images[0]) ? p.images[0] : '';
            const imgTag = img ? `<img src="${img}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;">` : '<div style="width:40px;height:40px;background:#eee;border-radius:4px;"></div>';

            const stockBadge = p.in_stock ? '<span style="color:green; font-weight:bold;">✔</span>' : '<span style="color:red; font-weight:bold;">✖</span>';

            const visibleBadge = p.is_visible ?
                '<span class="badge badge-ok">Опубликовано</span>' :
                '<span class="badge badge-hidden">Скрыто</span>';

            const displayTitle = isUA ? (p.title_ua || p.title_ru) : p.title_ru;

            let actionsHtml = '';
            if (this.currentTab === 'deleted') {
                 actionsHtml = `<button class="btn-icon" title="Восстановить" onclick="AdminProducts.restore(${p.id})">♻️</button>`;
            } else {
                let moveBtns = '';
                if (isGrouped) {
                    moveBtns = `
                        <button class="btn-icon" onclick="AdminProducts.move(${p.id}, 'up')" title="Вверх">⬆️</button>
                        <button class="btn-icon" onclick="AdminProducts.move(${p.id}, 'down')" title="Вниз">⬇️</button>
                    `;
                }

                // Кнопка КОПИРОВАНИЯ добавлена сюда (первая, иконка файла)
                actionsHtml = `
                     ${moveBtns}
                     <button class="btn-icon" title="Копировать" onclick="AdminProducts.copy(${p.id})">📄</button>
                     <button class="btn-icon" title="Скрыть/Показать" onclick="AdminProducts.toggleVisibility(${p.id}, ${p.is_visible})">${p.is_visible ? '👁️' : '🙈'}</button>
                     <button class="btn-icon" title="Редактировать" onclick="AdminProducts.openModal(${JSON.stringify(p).replace(/"/g, '&quot;')})">✏️</button>
                     <button class="btn-icon red" title="Удалить" onclick="AdminProducts.delete(${p.id})">🗑️</button>
                `;
            }

            // НОВАЯ КОЛОНКА "ВИТРИНА" С ЧЕКБОКСОМ
            const indexCheckbox = this.currentTab === 'deleted' ? '' :
                `<input type="checkbox" ${p.on_index ? 'checked' : ''}
                  style="cursor:pointer; width:16px; height:16px;"
                  onchange="AdminProducts.toggleIndex(${p.id}, this.checked)">`;

            html += `
            <tr>
                <td>${imgTag}</td>
                <td>
                    <div style="font-weight:600; font-size:14px;">${displayTitle}</div>
                    <div style="font-size:12px; color:#64748b;">${p.sku || '-'}</div>
                </td>
                <td>${this.categories[p.category] || p.category}</td>
                <td style="font-weight:700;">${p.price} ₴</td>
                <td>${stockBadge}</td>
                <td style="font-size:13px; color:#64748b;">${p.created_at || '-'}</td>

                <td style="text-align:center;">${indexCheckbox}</td>

                <td>${visibleBadge}</td>
                <td style="text-align:right;">
                    <div class="action-group">
                        ${actionsHtml}
                    </div>
                </td>
            </tr>
            `;
        });

        tbody.innerHTML = html;
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

    openModal: function(product = null) {
        const modal = document.getElementById('productModal');
        const title = document.getElementById('modalTitle');
        const form = document.getElementById('productForm');
        if(!modal) return;

        form.reset();
        document.getElementById('img_preview').style.display = 'none';

        if (product) {
            // Если ID есть - это редактирование. Если null (как при копировании) - Создание.
            title.textContent = product.id ? 'Редактирование' : 'Создание копии';
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

            if(product.images && product.images.length > 0) {
                 const path = product.images[0];
                 document.getElementById('p_image_path').value = path;
                 document.getElementById('img_preview').src = path;
                 document.getElementById('img_preview').style.display = 'block';
            }
        } else {
            title.textContent = 'Новый товар';
            document.getElementById('p_id').value = '';
        }
        modal.classList.add('active');
    },

    save: async function() {
        const pid = document.getElementById('p_id').value;
        const imgPath = document.getElementById('p_image_path').value;
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
            images: imgPath ? [imgPath] : []
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

document.addEventListener('DOMContentLoaded', () => {
    // Определяем страницу и запускаем нужное
    if (document.getElementById('ordersTableBody')) {
        Admin.init();
    }
    if (document.getElementById('productsTableBody')) {
        AdminProducts.init();
    }
});