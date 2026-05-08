// ==========================================
// 1. 儀表板 (Dashboard)
// ==========================================
const dashboardModal = document.getElementById('dashboardModalBackdrop');
const dashboardBtn = document.getElementById('dashboardBtn');

// 顯示/隱藏儀表板按鈕 (攔截 updateStoreDisplay 確保初始讀取與分店標籤同步顯示)
const originalUpdateStoreDisplay = window.updateStoreDisplay;
window.updateStoreDisplay = function() {
    if (typeof originalUpdateStoreDisplay === 'function') {
        originalUpdateStoreDisplay();
    }
    if (dashboardBtn) {
        if (storeSelect && storeSelect.value) {
            dashboardBtn.classList.remove('hidden');
        } else {
            dashboardBtn.classList.add('hidden');
        }
    }
};

if (storeSelect) {
    storeSelect.addEventListener('change', () => {
        if (dashboardBtn) {
            if (storeSelect.value) {
                dashboardBtn.classList.remove('hidden');
            } else {
                dashboardBtn.classList.add('hidden');
            }
        }
    });
}

if (dashboardBtn) {
    dashboardBtn.addEventListener('click', () => {
        const storeName = getSelectedStoreName();
        if(!storeName) return;
        document.getElementById('dashboardTitle').textContent = `營運總覽 - ${storeName}`;
        calculateDashboardStats(storeName);
        if(dashboardModal) dashboardModal.classList.remove('hidden');
    });
}

const closeDashboardModalBtn = document.getElementById('closeDashboardModal');
if (closeDashboardModalBtn) {
    closeDashboardModalBtn.addEventListener('click', () => {
        if(dashboardModal) dashboardModal.classList.add('hidden');
    });
}

function calculateDashboardStats(storeName) {
    const now = new Date();
    let pendingCount = 0;
    let purchasedCount = 0;
    let arrivedCount = 0;
    let overdueCount = 0;
    let todayCount = 0;
    
    const todayStr = todayLocalForInput();
    const productCounts = {};

    const allCurrentOrders = allOrders;

    allCurrentOrders.forEach(o => {
        const status = getStatus(o);
        
        if(status.key === '未處理') pendingCount++;
        if(status.key === '已採購') purchasedCount++;
        if(status.key === '已到貨') arrivedCount++;

        // 今日新增
        const createDate = formatDateMMDD(o['建立日期'] || o['creationDate'] || o['建立時間']);
        const todayFormatted = formatDateMMDD(todayStr);
        if(createDate === todayFormatted || toDateOnly(o['建立日期']) === todayStr) {
            todayCount++;
        }

        // 逾期 (大於5天)
        const isClosed = status.key === '已取貨';
        if(!isClosed) {
            const lastUpdateStr = toDateOnly(o['最後更新時間'] || o['建立日期']);
            if(lastUpdateStr) {
                const lastDate = new Date(lastUpdateStr);
                const diffTime = Math.abs(now - lastDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if(diffDays > 5) overdueCount++;
            }
        }

        // 熱門商品統計
        const pA = o['客訂商品A'];
        if(pA) productCounts[pA] = (productCounts[pA] || 0) + 1;
        const pB = o['客訂商品B'];
        if(pB) productCounts[pB] = (productCounts[pB] || 0) + 1;
    });

    // 黑名單數量過濾
    const blacklistCount = allBlacklistData.filter(b => {
        const data = resolveBlacklistRowData(b);
        return data.store === storeName;
    }).length;

    document.getElementById('dashPending').textContent = pendingCount;
    document.getElementById('dashPurchased').textContent = purchasedCount;
    document.getElementById('dashArrived').textContent = arrivedCount;
    document.getElementById('dashOverdue').textContent = overdueCount;
    document.getElementById('dashToday').textContent = todayCount;
    document.getElementById('dashBlacklist').textContent = blacklistCount;

    // 渲染進度排行
    const tbody = document.getElementById('dashStoreRankBody');
    const totalCount = allCurrentOrders.length;
    const overdueRatio = totalCount > 0 ? Math.round((overdueCount / totalCount) * 100) : 0;
    
    tbody.innerHTML = `
        <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors text-sm">
            <td class="py-3 px-2 text-gray-800">${storeName}</td>
            <td class="py-3 px-2 text-gray-600">${totalCount}</td>
            <td class="py-3 px-2 font-bold text-[#ea580c]">${pendingCount}</td>
            <td class="py-3 px-2 font-bold text-[#dc2626]">${overdueCount} <span class="text-xs">(${overdueRatio}%)</span></td>
            <td class="py-3 px-2 text-right">
                <button class="text-[#4f46e5] font-bold hover:text-indigo-800 text-sm" onclick="document.getElementById('closeDashboardModal').click();">查看清單 ➔</button>
            </td>
        </tr>
    `;

    // 渲染熱門商品
    const hotItemsContainer = document.getElementById('dashHotItems');
    const sortedItems = Object.entries(productCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    if(sortedItems.length === 0) {
        hotItemsContainer.innerHTML = '<div class="text-gray-400 text-sm text-center py-4">暫無商品資料</div>';
    } else {
        hotItemsContainer.innerHTML = sortedItems.map((item, index) => `
            <div class="flex items-center justify-between text-sm">
                <div class="flex items-center gap-3">
                    <span class="text-gray-400 font-medium w-4">${index + 1}.</span>
                    <span class="text-gray-700 truncate max-w-[150px]" title="${item[0]}">${item[0]}</span>
                </div>
                <span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs font-bold">${item[1]} 件</span>
            </div>
        `).join('');
    }
}

// ==========================================
// 2. 當前缺貨清單 (Out of Stock List)
// ==========================================
const outStockModal = document.getElementById('outStockModalBackdrop');
const showOutStockBtn = document.getElementById('showOutStockBtn');
const closeOutStockModalBtn = document.getElementById('closeOutStockModal');
const outStockList = document.getElementById('outStockList');
const outStockNoData = document.getElementById('outStockNoData');

if (showOutStockBtn) {
    showOutStockBtn.addEventListener('click', async () => {
        outStockList.innerHTML = '<li class="p-4 text-center text-gray-500">載入所有分店資料中，請稍候...</li>';
        outStockNoData.classList.add('hidden');
        outStockList.classList.remove('hidden');
        if(outStockModal) outStockModal.classList.remove('hidden');

        try {
            // 1. 若全域快取 allStoresCache 沒有資料，先試著載入
            let storesToFetch = allStoresCache || [];
            if (storesToFetch.length === 0) {
                const storeResp = await fetch(`${SCRIPT_URL}?action=stores`);
                const storeJson = await storeResp.json();
                storesToFetch = storeJson.stores || [];
            }
            
            // 2. 過濾出有效的店別
            const validStores = storesToFetch.filter(s => s.code && s.name !== '店名' && s.code !== '店編號');

            // 3. 同時向所有分店撈取資料
            const fetchPromises = validStores.map(store => 
                fetch(`${SCRIPT_URL}?store=${encodeURIComponent(store.code)}`)
                    .then(res => res.json())
                    .then(json => ({ storeName: store.name || store.code, rows: json.rows || [] }))
                    .catch(err => ({ storeName: store.name || store.code, rows: [] }))
            );

            const results = await Promise.all(fetchPromises);
            
            const outStockMap = {}; 

            // 4. 統整所有資料並過濾缺貨商品
            results.forEach(result => {
                const storeName = result.storeName;
                result.rows.forEach(order => {
                    const status = getStatus(order);
                    // 已取貨代表結案，不列入缺貨計算
                    if (status.key === '已取貨') return; 

                    if (isChecked(order['A缺貨']) && order['客訂商品A']) {
                        const name = String(order['客訂商品A']).trim();
                        const spec = String(order['A商品規格'] || '').trim();
                        const key = `${name}|${spec}`;
                        if (!outStockMap[key]) {
                            outStockMap[key] = { name: name, spec: spec, stores: new Set() };
                        }
                        outStockMap[key].stores.add(storeName);
                    }
                    if (isChecked(order['B缺貨']) && order['客訂商品B']) {
                        const name = String(order['客訂商品B']).trim();
                        const spec = String(order['B商品規格'] || '').trim();
                        const key = `${name}|${spec}`;
                        if (!outStockMap[key]) {
                            outStockMap[key] = { name: name, spec: spec, stores: new Set() };
                        }
                        outStockMap[key].stores.add(storeName);
                    }
                });
            });

            const uniqueItems = Object.values(outStockMap);
            outStockList.innerHTML = '';
            
            if (uniqueItems.length > 0) {
                // 依名稱排序
                uniqueItems.sort((a, b) => a.name.localeCompare(b.name));
                
                // 5. 渲染清單，加上分店標籤
                uniqueItems.forEach(item => {
                    const li = document.createElement('li');
                    li.className = 'p-4 bg-white hover:bg-red-50 transition-colors flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 border-l-4 border-red-500';
                    
                    const specHtml = item.spec ? `<span class="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-sm">${item.spec}</span>` : '';
                    const storesHtml = Array.from(item.stores).map(s => `<span class="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-bold">${s}</span>`).join(' ');
                    
                    li.innerHTML = `
                        <div class="flex items-center gap-2 flex-1">
                            <div class="w-2 h-2 rounded-full bg-red-500 shrink-0"></div>
                            <div class="text-gray-800 font-bold text-lg">${item.name}</div>
                            ${specHtml}
                        </div>
                        <div class="flex flex-wrap gap-1 mt-1 sm:mt-0">
                            ${storesHtml}
                        </div>
                    `;
                    outStockList.appendChild(li);
                });
            } else {
                outStockNoData.classList.remove('hidden');
                outStockList.classList.add('hidden');
            }
        } catch (err) {
            console.error(err);
            outStockList.innerHTML = `<li class="p-4 text-center text-red-500 font-bold">資料讀取失敗，請稍後再試</li>`;
        }
    });
}

if (closeOutStockModalBtn) {
    closeOutStockModalBtn.addEventListener('click', () => {
        if(outStockModal) outStockModal.classList.add('hidden');
    });
}
