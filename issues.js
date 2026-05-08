// ==========================================
// 問題商品追蹤 (Issues Tracker) - 內嵌手風琴版
// ==========================================

let allIssues = [];
let issueNotifyDateCtrl = null;
let issueFilter = 'all';

// ==========================================
// 1. 手風琴初始化
// ==========================================
toggleAccordion(
    document.getElementById('issuesToggleBtn'),
    document.getElementById('issuesContent'),
    document.getElementById('issuesArrowIcon')
);

// 手風琴展開時自動載入
// 注意：toggleAccordion 的 handler 先執行並已切換 open 類別
// 所以當此 listener 執行時，isOpen = true 代表「剛展開」
document.getElementById('issuesToggleBtn').addEventListener('click', () => {
    const isOpen = document.getElementById('issuesContent').classList.contains('open');
    if (isOpen && storeSelect && storeSelect.value) {
        fetchIssues();
    }
});

// 切換分店時若已展開則重新載入
if (storeSelect) {
    storeSelect.addEventListener('change', () => {
        if (document.getElementById('issuesContent').classList.contains('open')) {
            fetchIssues();
        }
    });
}

// ==========================================
// 2. 告知廠商日期 Tag 控制項
// ==========================================
issueNotifyDateCtrl = setupTagControls(
    document.getElementById('issueAddNotifyDate'),
    document.getElementById('issueStampNotifyDate'),
    document.getElementById('issueNotifyDateInput'),
    document.getElementById('issueNotifyDateTags'),
    document.getElementById('issueNotifyDateHidden')
);

// ==========================================
// 3. 照片上傳
// ==========================================
let issuePhotoBase64      = '';
let issuePhotoMimeType    = '';
let issueExistingPhotoUrl = '';

const issuePhotoInput       = document.getElementById('issuePhotoInput');
const issuePhotoPreview     = document.getElementById('issuePhotoPreview');
const issuePhotoPreviewWrap = document.getElementById('issuePhotoPreviewContainer');
const issueRemovePhotoBtn   = document.getElementById('issueRemovePhotoBtn');

if (issuePhotoInput) {
    issuePhotoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { alert('請選擇圖片檔案'); issuePhotoInput.value = ''; return; }
        if (file.size > 5 * 1024 * 1024) { alert('圖片大小不能超過 5MB'); issuePhotoInput.value = ''; return; }
        const reader = new FileReader();
        reader.onload = (ev) => {
            const dataUrl = ev.target.result;
            issuePhotoPreview.src = dataUrl;
            issuePhotoPreviewWrap.classList.remove('hidden');
            const parts = dataUrl.split(',');
            issuePhotoBase64   = parts[1];
            issuePhotoMimeType = file.type;
        };
        reader.readAsDataURL(file);
    });
}

if (issueRemovePhotoBtn) {
    issueRemovePhotoBtn.addEventListener('click', () => {
        issuePhotoBase64 = ''; issuePhotoMimeType = ''; issueExistingPhotoUrl = '';
        if (issuePhotoInput) issuePhotoInput.value = '';
        if (issuePhotoPreview) issuePhotoPreview.src = '';
        if (issuePhotoPreviewWrap) issuePhotoPreviewWrap.classList.add('hidden');
    });
}

// ==========================================
// 4. 資料讀取
// ==========================================
async function fetchIssues() {
    const storeName = getSelectedStoreName();
    if (!storeName) return;

    const loader    = document.getElementById('issuesLoader');
    const noData    = document.getElementById('issuesNoData');
    const container = document.getElementById('issuesTableContainer');
    const tbody     = document.getElementById('issuesTableBody');

    if (loader) loader.classList.remove('hidden');
    if (noData) noData.classList.add('hidden');
    if (container) container.classList.add('hidden');

    try {
        const resp = await fetch(`${SCRIPT_URL}?action=get_issues&store=${encodeURIComponent(storeName)}`);
        const json = await resp.json();
        allIssues = json.rows || [];
        renderIssuesList(allIssues);
    } catch (e) {
        console.error('fetchIssues error:', e);
        if (tbody) tbody.innerHTML = '<tr><td colspan="10" class="py-6 text-center text-red-500">資料讀取失敗，請稍後再試</td></tr>';
        if (container) container.classList.remove('hidden');
    } finally {
        if (loader) loader.classList.add('hidden');
    }
}

// ==========================================
// 5. 衍生狀態
// ==========================================
function getIssueStatus(issue) {
    const notify = (issue['告知廠商日期'] || '').trim();
    const done   = (issue['完成日期']     || '').trim();
    const plan   = (issue['預計處理日期'] || '').trim();

    if (done)    return { label: '已完成',      cls: 'bg-green-100 text-green-700',        key: 'done' };
    if (!notify) return { label: '尚未通知廠商', cls: 'bg-gray-100 text-gray-600',          key: 'pending' };
    if (!plan)   return { label: '已通知廠商',  cls: 'bg-blue-100 text-blue-700',           key: 'processing' };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const planDate = new Date(plan.replace(/\//g, '-'));
    if (isNaN(planDate.getTime()) || planDate >= today)
                 return { label: '處理中',       cls: 'bg-yellow-100 text-yellow-700',       key: 'processing' };
    return           { label: '逾期未回',       cls: 'bg-red-100 text-red-700 font-bold',   key: 'processing' };
}

// ==========================================
// 5b. 書籤 Tabs
// ==========================================
function renderIssueTabs() {
    const container = document.getElementById('issuesTabs');
    if (!container) return;
    const TABS = [
        { key: 'all',        label: '全部' },
        { key: 'pending',    label: '尚未通知廠商' },
        { key: 'processing', label: '處理中' },
        { key: 'done',       label: '已完成' },
    ];
    container.innerHTML = TABS.map(t => `
        <button class="tab-btn ${issueFilter === t.key ? 'active' : ''} text-xs"
                onclick="setIssueFilter('${t.key}')">${t.label}</button>
    `).join('');
}

window.setIssueFilter = (key) => {
    issueFilter = key;
    renderIssueTabs();
    renderIssuesList(allIssues);
};

// ==========================================
// 6. 渲染清單
// ==========================================
function renderIssuesList(issues) {
    const noData    = document.getElementById('issuesNoData');
    const container = document.getElementById('issuesTableContainer');
    const tbody     = document.getElementById('issuesTableBody');

    // 依書籤篩選
    const filtered = (issues || []).filter(issue => {
        if (issueFilter === 'all') return true;
        return getIssueStatus(issue).key === issueFilter;
    });

    renderIssueTabs();

    if (filtered.length === 0) {
        if (tbody) tbody.innerHTML = '';
        if (noData) noData.classList.remove('hidden');
        if (container) container.classList.add('hidden');
        return;
    }
    if (noData) noData.classList.add('hidden');
    if (container) container.classList.remove('hidden');

    tbody.innerHTML = filtered.map(issue => {
        const status = getIssueStatus(issue);
        const notifyParts  = (issue['告知廠商日期'] || '').trim().split(/[,，;;\s]+/).filter(s => s);
        const lastNotify   = notifyParts.length ? notifyParts[notifyParts.length - 1] : '';
        const planDate     = (issue['預計處理日期'] || '').trim();
        const completeDate = (issue['完成日期']     || '').trim();
        const photoUrl     = (issue['圖片']         || '').trim();

        const photoHtml = photoUrl
            ? `<a href="${photoUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">
                 <img src="${photoUrl}" alt="照片" class="issue-thumb"
                      onerror="this.parentElement.innerHTML='<span class=\\'text-gray-300 text-xs\\'>圖片失效</span>'" />
               </a>`
            : '<span class="text-gray-300 text-xs">無</span>';

        const desc      = issue['問題描述'] || '';
        const descShort = desc.length > 18 ? desc.substring(0, 18) + '…' : desc;
        const hasPhoto  = photoUrl ? 'has-issue-photo' : '';
        // 已完成的列使用淡綠色底色
        const rowCls = status.key === 'done'
            ? `border-b border-gray-100 hover:bg-green-100 transition-colors cursor-pointer bg-green-50 ${hasPhoto}`
            : `border-b border-gray-100 hover:bg-amber-50 transition-colors cursor-pointer ${hasPhoto}`;

        return `<tr class="${rowCls}" onclick="openEditIssue(${issue.__row})">
            <td data-label="品名"    class="px-3 py-3 font-bold text-gray-800 text-sm">${issue['品名'] || '—'}</td>
            <td data-label="數量"    class="px-3 py-3 text-gray-600 text-sm text-center">${issue['數量'] || ''}</td>
            <td data-label="廠商"    class="px-3 py-3 text-gray-600 text-sm">${issue['廠商名'] || ''}</td>
            <td data-label="問題描述" class="px-3 py-3 text-gray-500 text-sm" title="${desc}">${descShort}</td>
            <td data-label="告知日期" class="px-3 py-3 text-gray-500 text-xs">${lastNotify ? formatDateMMDD(lastNotify) : '—'}</td>
            <td data-label="預計處理" class="px-3 py-3 text-gray-500 text-xs">${planDate ? formatDateMMDD(planDate) : '—'}</td>
            <td data-label="完成日期" class="px-3 py-3 text-green-600 text-xs font-medium">${completeDate ? formatDateMMDD(completeDate) : '—'}</td>
            <td data-label="狀態"    class="px-3 py-3"><span class="px-2 py-0.5 rounded-full text-xs ${status.cls}">${status.label}</span></td>
            <td data-label="照片"    class="px-3 py-3 issue-photo-cell" onclick="event.stopPropagation()">${photoHtml}</td>
            <td data-label="操作"    class="px-3 py-3" onclick="event.stopPropagation()">
                <button onclick="openEditIssue(${issue.__row})" class="btn bg-amber-100 text-amber-700 text-xs px-2 py-1 hover:bg-amber-200 whitespace-nowrap">編輯</button>
            </td>
        </tr>`;
    }).join('');
}

// ==========================================
// 7. 按鈕事件
// ==========================================
const addIssueBtn = document.getElementById('addIssueBtn');
if (addIssueBtn) addIssueBtn.addEventListener('click', () => openIssueForm(null));

const issuesRefreshBtn = document.getElementById('issuesRefreshBtn');
if (issuesRefreshBtn) issuesRefreshBtn.addEventListener('click', fetchIssues);

// ==========================================
// 8. 表單 Modal 開/關
// ==========================================
const issueFormModal = document.getElementById('issueFormModalBackdrop');

function openIssueForm(issue) {
    const isEdit = issue !== null;
    const titleEl = document.getElementById('issueFormTitle');
    if (titleEl) titleEl.textContent = isEdit ? '編輯問題商品' : '新增問題商品';
    document.getElementById('issueFormRow').value = isEdit ? issue.__row : '';

    // 重置照片
    issuePhotoBase64 = ''; issuePhotoMimeType = '';
    if (issuePhotoInput) issuePhotoInput.value = '';

    if (isEdit) {
        document.getElementById('issueName').value         = issue['品名'] || '';
        document.getElementById('issueQty').value          = issue['數量'] || '';
        document.getElementById('issueSupplier').value     = issue['廠商名'] || '';
        document.getElementById('issueDesc').value         = issue['問題描述'] || '';
        document.getElementById('issuePlanDate').value     = toDateOnly(issue['預計處理日期']) || '';
        document.getElementById('issueCompleteDate').value = toDateOnly(issue['完成日期']) || '';
        document.getElementById('issueNotes').value        = issue['備註'] || '';
        issueNotifyDateCtrl.setItems(parseMultiDateStringToArray(issue['告知廠商日期']));
        issueExistingPhotoUrl = issue['圖片'] || '';
        if (issueExistingPhotoUrl && issuePhotoPreview && issuePhotoPreviewWrap) {
            issuePhotoPreview.src = issueExistingPhotoUrl;
            issuePhotoPreviewWrap.classList.remove('hidden');
        } else if (issuePhotoPreviewWrap) {
            issuePhotoPreviewWrap.classList.add('hidden');
            if (issuePhotoPreview) issuePhotoPreview.src = '';
        }
        const delBtn = document.getElementById('issueDeleteBtn');
        if (delBtn) delBtn.classList.remove('hidden');
    } else {
        document.getElementById('issueName').value         = '';
        document.getElementById('issueQty').value          = '';
        document.getElementById('issueSupplier').value     = '';
        document.getElementById('issueDesc').value         = '';
        document.getElementById('issuePlanDate').value     = '';
        document.getElementById('issueCompleteDate').value = '';
        document.getElementById('issueNotes').value        = '';
        issueNotifyDateCtrl.setItems([]);
        issueExistingPhotoUrl = '';
        if (issuePhotoPreviewWrap) issuePhotoPreviewWrap.classList.add('hidden');
        if (issuePhotoPreview) issuePhotoPreview.src = '';
        const delBtn = document.getElementById('issueDeleteBtn');
        if (delBtn) delBtn.classList.add('hidden');
    }

    if (issueFormModal) issueFormModal.classList.remove('hidden');
}

function openEditIssue(rowNum) {
    const issue = allIssues.find(i => i.__row === rowNum);
    if (issue) openIssueForm(issue);
}

const closeIssueFormModalBtn = document.getElementById('closeIssueFormModal');
if (closeIssueFormModalBtn) {
    closeIssueFormModalBtn.addEventListener('click', () => {
        if (issueFormModal) issueFormModal.classList.add('hidden');
    });
}
if (issueFormModal) {
    issueFormModal.addEventListener('click', (e) => {
        if (e.target === issueFormModal) issueFormModal.classList.add('hidden');
    });
}

// ==========================================
// 9. 刪除
// ==========================================
const issueDeleteBtn = document.getElementById('issueDeleteBtn');
if (issueDeleteBtn) {
    issueDeleteBtn.addEventListener('click', async () => {
        const row = document.getElementById('issueFormRow').value;
        if (!row || !confirm('確定要刪除此筆記錄？')) return;
        issueDeleteBtn.disabled = true; issueDeleteBtn.textContent = '刪除中...';
        try {
            const fd = new FormData();
            fd.append('action', 'delete_issue'); fd.append('row', row);
            const json = await (await fetch(SCRIPT_URL, { method: 'POST', body: fd })).json();
            if (json.result === 'success') {
                if (issueFormModal) issueFormModal.classList.add('hidden');
                await fetchIssues();
            } else { alert('刪除失敗：' + (json.error || '未知錯誤')); }
        } catch (e) { alert('刪除失敗：' + e.message); }
        finally { issueDeleteBtn.disabled = false; issueDeleteBtn.textContent = '刪除'; }
    });
}

// ==========================================
// 10. 儲存
// ==========================================
const issueForm = document.getElementById('issueForm');
if (issueForm) {
    issueForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveBtn = document.getElementById('issueFormSaveBtn');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '儲存中...'; }
        try {
            const row       = document.getElementById('issueFormRow').value;
            const isEdit    = !!row;
            const storeName = getSelectedStoreName();

            // 上傳圖片
            let photoUrl = issueExistingPhotoUrl;
            if (issuePhotoBase64) {
                const imgFd = new FormData();
                imgFd.append('action', 'save_issue_image');
                imgFd.append('imageData', issuePhotoBase64);
                imgFd.append('mimeType', issuePhotoMimeType);
                imgFd.append('store', storeName);
                try {
                    const imgJson = await (await fetch(SCRIPT_URL, { method: 'POST', body: imgFd })).json();
                    if (imgJson.result === 'success') photoUrl = imgJson.url;
                    else alert('圖片上傳失敗，儲存繼續但不含圖片。');
                } catch (_) { alert('圖片上傳失敗，儲存繼續但不含圖片。'); }
            }

            const fd = new FormData();
            fd.append('action',       isEdit ? 'update_issue' : 'append_issue');
            if (isEdit) fd.append('row', row);
            fd.append('store',        storeName);
            fd.append('品名',          document.getElementById('issueName').value.trim());
            fd.append('數量',          document.getElementById('issueQty').value.trim());
            fd.append('廠商名',        document.getElementById('issueSupplier').value.trim());
            fd.append('問題描述',      document.getElementById('issueDesc').value.trim());
            fd.append('告知廠商日期',  document.getElementById('issueNotifyDateHidden').value);
            fd.append('預計處理日期',  document.getElementById('issuePlanDate').value);
            fd.append('完成日期',      document.getElementById('issueCompleteDate').value);
            fd.append('備註',          document.getElementById('issueNotes').value.trim());
            fd.append('圖片',          photoUrl);

            const json = await (await fetch(SCRIPT_URL, { method: 'POST', body: fd })).json();
            if (json.result === 'success') {
                if (issueFormModal) issueFormModal.classList.add('hidden');
                await fetchIssues();
            } else { alert('儲存失敗：' + (json.error || '未知錯誤')); }
        } catch (err) { alert('儲存失敗：' + err.message); }
        finally { if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '儲存'; } }
    });
}
