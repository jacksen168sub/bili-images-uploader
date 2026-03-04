// ===================================
// B站图片上传器 - SPA应用
// ===================================

// API基础URL
const API_BASE = '/api';

// 全局状态
const state = {
    isAuthenticated: false,
    token: null,
    config: {
        biliCsrf: '',
        biliSessdata: '',
        biliOid: ''
    },
    uploadQueue: [],
    history: [],
    isChecking: false,
    isUploading: false,  // 上传锁定状态
    toastQueue: [],      // toast消息队列
    activeToasts: 0      // 当前显示的toast数量
};

// ===================================
// 初始化
// ===================================
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    // 初始化事件监听
    initEventListeners();
    
    // 检查登录状态（等待完成）
    await checkAuth();
    
    // 渲染页面
    render();
}

// ===================================
// API请求封装
// ===================================
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
        ...options.headers
    };
    
    // 添加Token认证
    if (state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
    }
    
    try {
        const response = await fetch(url, {
            ...options,
            headers
        });
        
        const data = await response.json();
        
        if (response.status === 401) {
            // Token失效，清除登录状态
            logout();
            showToast('登录已失效，请重新登录', 'error');
            return null;
        }
        
        return data;
    } catch (error) {
        console.error('API请求失败:', error);
        showToast('网络请求失败', 'error');
        return null;
    }
}

// ===================================
// 认证管理
// ===================================
async function checkAuth() {
    const savedToken = localStorage.getItem('token');
    if (savedToken) {
        // 验证Token是否有效
        const result = await apiRequest('/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: savedToken })
        });
        
        if (result && result.success) {
            state.isAuthenticated = true;
            state.token = savedToken;
            showNavigation();
        } else {
            localStorage.removeItem('token');
        }
    }
}

async function login(token) {
    const result = await apiRequest('/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
    });
    
    if (result && result.success) {
        state.isAuthenticated = true;
        state.token = token;
        localStorage.setItem('token', token);
        showNavigation();
        navigateTo('upload');
        showToast('登录成功', 'success');
        return true;
    } else {
        return false;
    }
}

function logout() {
    state.isAuthenticated = false;
    state.token = null;
    localStorage.removeItem('token');
    hideNavigation();
    navigateTo('login');
    showToast('已退出登录', 'info');
}

// ===================================
// 导航管理
// ===================================
function showNavigation() {
    document.getElementById('main-nav').classList.remove('hidden');
}

function hideNavigation() {
    document.getElementById('main-nav').classList.add('hidden');
}

function navigateTo(page) {
    // 重置检查页进度条
    document.getElementById('check-progress').classList.add('hidden');
    document.getElementById('check-progress-fill').style.width = '0%';
    document.getElementById('check-progress-text').textContent = '0%';
    
    // 隐藏所有页面
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
    });
    
    // 显示目标页面
    const targetPage = document.getElementById(`page-${page}`);
    if (targetPage) {
        targetPage.classList.add('active');
    }
    
    // 更新导航按钮状态
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.page === page) {
            btn.classList.add('active');
        }
    });
    
    // 特定页面初始化
    if (page === 'history') {
        loadHistory();
    } else if (page === 'check') {
        loadUrlsForCheck();
    } else if (page === 'upload') {
        renderUploadQueue();
    } else if (page === 'config') {
        loadConfigFromServer();
    }
}

// ===================================
// 配置管理
// ===================================
async function loadConfigFromServer() {
    const result = await apiRequest('/config');
    
    if (result && result.success) {
        state.config = {
            biliCsrf: result.data.csrf || '',
            biliSessdata: result.data.sessdata || '',
            biliOid: result.data.oid || ''
        };
        
        document.getElementById('config-csrf').value = state.config.biliCsrf;
        document.getElementById('config-sessdata').value = state.config.biliSessdata;
        document.getElementById('config-oid').value = state.config.biliOid;
    }
    
    // 加载版本信息
    loadVersionInfo();
}

async function loadVersionInfo() {
    try {
        const result = await apiRequest('/version');
        const versionLink = document.getElementById('version-link');
        
        if (result && result.success && result.data) {
            const { version, commitSha, commitLink } = result.data;
            
            if (commitSha && commitLink) {
                versionLink.href = commitLink;
                versionLink.textContent = commitSha.substring(0, 7);
            } else if (version) {
                versionLink.textContent = version;
                versionLink.removeAttribute('href');
                versionLink.style.cursor = 'default';
            } else {
                versionLink.textContent = 'dev';
                versionLink.removeAttribute('href');
                versionLink.style.cursor = 'default';
            }
        }
    } catch (error) {
        console.error('加载版本信息失败:', error);
        document.getElementById('version-link').textContent = 'dev';
    }
}

async function saveConfigToServer() {
    const config = {
        csrf: document.getElementById('config-csrf').value.trim(),
        sessdata: document.getElementById('config-sessdata').value.trim(),
        oid: document.getElementById('config-oid').value.trim()
    };
    
    const result = await apiRequest('/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    });
    
    if (result && result.success) {
        state.config = config;
        showToast('配置已保存', 'success');
    } else {
        showToast(result?.detail || '保存失败', 'error');
    }
}

// ===================================
// 上传队列管理
// ===================================
function addToQueue(files) {
    // 只清理已完成和失败的项，保留正在上传和等待上传的项
    state.uploadQueue = state.uploadQueue.filter(item => 
        item.status === 'uploading' || item.status === 'pending'
    );
    
    files.forEach(file => {
        const queueItem = {
            id: Date.now() + Math.random(),
            name: file.name,
            size: file.size,
            file: file,
            status: 'pending',
            httpUrl: null,
            httpsUrl: null,
            error: null,
            isNew: true  // 标记为新添加
        };
        state.uploadQueue.push(queueItem);
    });
    renderUploadQueue();
    
    // 动画完成后移除isNew标记
    setTimeout(() => {
        state.uploadQueue.forEach(item => item.isNew = false);
    }, 300);
    
    showToast(`已添加 ${files.length} 个文件到队列`, 'info');
}

function removeFromQueue(id) {
    // 先找到DOM元素并添加动画类
    const queueItem = document.querySelector(`.queue-item[data-id="${id}"]`);
    if (queueItem) {
        queueItem.classList.add('removing');
        // 等待动画完成后再从状态中移除
        setTimeout(() => {
            state.uploadQueue = state.uploadQueue.filter(item => item.id !== id);
            renderUploadQueue();
        }, 300);
    } else {
        state.uploadQueue = state.uploadQueue.filter(item => item.id !== id);
        renderUploadQueue();
    }
}

function renderUploadQueue() {
    const queueList = document.getElementById('queue-list');
    
    if (state.uploadQueue.length === 0) {
        queueList.innerHTML = '<p style="color: var(--p5-light-gray); text-align: center; padding: 20px;">队列为空</p>';
        return;
    }
    
    queueList.innerHTML = state.uploadQueue.map(item => {
        let statusText = '';
        let statusClass = '';
        
        switch(item.status) {
            case 'pending':
                statusText = '等待上传';
                statusClass = 'status-pending';
                break;
            case 'uploading':
                // 显示分组进度
                if (item.groupId) {
                    statusText = `上传中... [组${item.groupId} ${item.groupIndex}/${item.groupTotal}]`;
                } else {
                    statusText = '上传中...';
                }
                statusClass = 'status-uploading';
                break;
            case 'completed':
                statusText = '已完成';
                statusClass = 'status-completed';
                break;
            case 'error':
                statusText = item.error || '上传失败';
                statusClass = 'status-error';
                break;
        }
        
        return `
            <div class="queue-item ${statusClass} ${item.isNew ? 'new-item' : ''}" data-id="${item.id}">
                <div class="queue-item-info">
                    <div class="queue-item-name">${item.name}</div>
                    <div class="queue-item-size">${formatFileSize(item.size)}</div>
                    <div class="queue-item-status">${statusText}</div>
                </div>
                <div class="queue-item-actions">
                    ${item.status === 'pending' ? `<button class="p5-button action-btn queue-item-delete" onclick="removeFromQueue(${item.id})">删除</button>` : ''}
                    ${item.httpsUrl ? `
                        <button class="p5-button action-btn queue-item-copy" onclick="copyToClipboard('${item.httpsUrl}', 'HTTPS URL')">复制URL</button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ===================================
// 上传功能
// ===================================

/**
 * 开始分组上传
 * - 将pending状态的图片按9张一组分割
 * - 每组生成唯一ID
 * - 上传完成后自动发送评论
 */
async function startUpload() {
    // 检查是否正在上传
    if (state.isUploading) {
        showToast('上传正在进行中，请稍候', 'warning');
        return;
    }
    
    const pendingItems = state.uploadQueue.filter(item => item.status === 'pending');
    
    if (pendingItems.length === 0) {
        showToast('没有待上传的文件', 'warning');
        return;
    }
    
    // 创建分组
    const groups = createUploadGroups();
    
    if (groups.length === 0) {
        showToast('没有待上传的文件', 'warning');
        return;
    }
    
    // 锁定上传状态
    state.isUploading = true;
    updateUploadButtonState();
    
    showToast(`开始上传 ${pendingItems.length} 个文件，分为 ${groups.length} 组`, 'info');
    
    let totalCompleted = 0;
    let totalFailed = 0;
    
    // 按组上传
    for (const group of groups) {
        const { groupId, images, totalCount } = group;
        let groupHasError = false;
        
        // 逐个上传组内图片
        for (let i = 0; i < images.length; i++) {
            const item = images[i];
            const currentIndex = i + 1;
            
            item.status = 'uploading';
            item.groupId = groupId;
            item.groupIndex = currentIndex;
            item.groupTotal = totalCount;
            renderUploadQueue();
            
            // 创建FormData
            const formData = new FormData();
            formData.append('files', item.file);
            formData.append('group_id', groupId);
            formData.append('total_count', totalCount.toString());
            formData.append('current_index', currentIndex.toString());
            
            try {
                const response = await fetch(`${API_BASE}/upload`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${state.token}`
                    },
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success && result.results && result.results.length > 0) {
                    const uploadResult = result.results[0];
                    
                    if (uploadResult.success) {
                        item.status = 'completed';
                        item.httpUrl = uploadResult.httpUrl;
                        item.httpsUrl = uploadResult.httpsUrl;
                        item.remoteFilename = uploadResult.remoteFilename;
                        item.remoteNameWithoutExt = uploadResult.remoteNameWithoutExt;
                        totalCompleted++;
                        
                        // 如果是组内最后一张，显示评论结果
                        if (currentIndex === totalCount && result.commentResult) {
                            if (result.commentResult.success) {
                                showToast(`第${groups.indexOf(group) + 1}组: ${result.commentResult.message}`, 'success');
                            } else {
                                showToast(`第${groups.indexOf(group) + 1}组评论失败: ${result.commentResult.message}`, 'error');
                            }
                        }
                    } else {
                        item.status = 'error';
                        item.error = uploadResult.error;
                        totalFailed++;
                        groupHasError = true;
                    }
                } else {
                    item.status = 'error';
                    item.error = result.detail || '上传失败';
                    totalFailed++;
                    groupHasError = true;
                }
            } catch (error) {
                item.status = 'error';
                item.error = '网络错误';
                totalFailed++;
                groupHasError = true;
            }
            
            renderUploadQueue();
        }
        
        // 如果组内有错误且不是最后一张，尝试强制完成已上传的图片
        if (groupHasError) {
            const successItems = images.filter(img => img.status === 'completed');
            if (successItems.length > 0 && successItems.length < totalCount) {
                // 调用finalize API让已上传的图片单独评论
                try {
                    const formData = new FormData();
                    formData.append('group_id', groupId);
                    await fetch(`${API_BASE}/group/finalize`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${state.token}`
                        },
                        body: formData
                    });
                } catch (e) {
                    console.error('Finalize group failed:', e);
                }
            }
        }
    }
    
    // 释放上传锁定
    state.isUploading = false;
    updateUploadButtonState();
    
    // 显示完成提示
    if (totalFailed === 0) {
        showToast(`所有文件上传完成 (${totalCompleted}个)`, 'success');
    } else {
        showToast(`上传完成: 成功${totalCompleted}个, 失败${totalFailed}个`, 'warning');
    }
}

/**
 * 更新上传按钮状态
 */
function updateUploadButtonState() {
    const uploadBtn = document.getElementById('start-upload');
    if (uploadBtn) {
        if (state.isUploading) {
            uploadBtn.disabled = true;
            uploadBtn.classList.add('disabled');
        } else {
            uploadBtn.disabled = false;
            uploadBtn.classList.remove('disabled');
        }
        // 更新按钮文本，保留SVG元素
        const textNode = Array.from(uploadBtn.childNodes).find(node => 
            node.nodeType === Node.TEXT_NODE && node.textContent.trim()
        );
        if (textNode) {
            textNode.textContent = state.isUploading ? '上传中...' : '开始上传';
        }
    }
}

/**
 * 清除上传队列
 */
function clearQueue() {
    if (state.isUploading) {
        showToast('上传进行中，无法清除队列', 'warning');
        return;
    }
    
    state.uploadQueue = [];
    renderUploadQueue();
    showToast('队列已清除', 'success');
}

/**
 * 复制所有成功上传的图片URL到剪贴板
 */
async function copySuccessUrls() {
    const successItems = state.uploadQueue.filter(item => item.status === 'completed' && item.httpsUrl);
    
    if (successItems.length === 0) {
        showToast('没有成功上传的图片', 'warning');
        return;
    }
    
    const urls = successItems.map(item => item.httpsUrl).join('\n');
    await copyToClipboard(urls, `${successItems.length} 个URL`);
}

// ===================================
// 历史记录管理
// ===================================
async function loadHistory() {
    const result = await apiRequest('/history');
    
    if (result && result.success) {
        state.history = result.data || [];
        renderHistory();
    }
}

function renderHistory() {
    const tbody = document.getElementById('history-table-body');
    
    if (state.history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--p5-light-gray);">暂无历史记录</td></tr>';
        return;
    }
    
    tbody.innerHTML = state.history.map(item => `
        <tr>
            <td>${item.id}</td>
            <td>${formatDateTime(item.uploadTime)}</td>
            <td>${item.filename}</td>
            <td>${formatFileSize(item.fileSize)}</td>
            <td><span class="p5-status ${item.status === 'success' ? 'p5-status-success' : 'p5-status-error'}">${item.status === 'success' ? '成功' : '失败'}</span></td>
            <td>
                <div class="action-buttons">
                    ${item.httpsUrl ? `
                        <button class="p5-button action-btn" onclick="openImageModal('${item.httpsUrl}')">
                            查看
                        </button>
                        <button class="p5-button action-btn" onclick="copyToClipboard('${item.httpUrl}', 'HTTP URL')">
                            复制HTTP
                        </button>
                        <button class="p5-button action-btn" onclick="copyToClipboard('${item.httpsUrl}', 'HTTPS URL')">
                            复制HTTPS
                        </button>
                    ` : '-'}
                </div>
            </td>
        </tr>
    `).join('');
}

// ===================================
// 失效检查
// ===================================
async function loadUrlsForCheck() {
    // 重置检查页进度条
    document.getElementById('check-progress').classList.add('hidden');
    document.getElementById('check-progress-fill').style.width = '0%';
    document.getElementById('check-progress-text').textContent = '0%';

    const result = await apiRequest('/urls');
    
    if (result && result.success) {
        state.history = result.data || [];
        renderCheckTable();
    }
}

/**
 * 检查单个图片URL是否有效（通过加载图片判断）
 */
function checkImageValid(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
        // 设置超时，防止长时间无响应
        setTimeout(() => resolve(false), 10000);
    });
}

async function startCheck() {
    if (state.isChecking) {
        showToast('检查正在进行中', 'warning');
        return;
    }
    
    if (state.history.length === 0) {
        showToast('没有需要检查的图片', 'warning');
        return;
    }
    
    state.isChecking = true;
    document.getElementById('check-progress').classList.remove('hidden');
    
    const progressFill = document.getElementById('check-progress-fill');
    const progressText = document.getElementById('check-progress-text');
    const total = state.history.length;
    let checked = 0;
    let invalidCount = 0;
    
    for (const item of state.history) {
        // 通过加载图片检查URL有效性
        item.isValid = await checkImageValid(item.httpsUrl);
        if (!item.isValid) {
            invalidCount++;
        }
        
        checked++;
        const progress = Math.round((checked / total) * 100);
        progressFill.style.width = `${progress}%`;
        progressText.textContent = `${progress}%`;
        
        // 实时更新表格
        renderCheckTable();
    }
    
    state.isChecking = false;
    
    // 检查完成提示，报告失效数量
    if (invalidCount > 0) {
        showToast(`检查完成，发现 ${invalidCount} 张失效图片`, 'warning');
    } else {
        showToast('检查完成，所有图片均有效', 'success');
    }
    
    // 更新清除按钮状态
    updateClearInvalidButtonState();
    
    setTimeout(() => {
        document.getElementById('check-progress').classList.add('hidden');
    }, 2000);
}

function renderCheckTable() {
    const tbody = document.getElementById('check-table-body');
    
    if (state.history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--p5-light-gray);">暂无历史记录</td></tr>';
        return;
    }
    
    tbody.innerHTML = state.history.map(item => {
        let statusHtml = '';
        if (item.isValid === true) {
            statusHtml = '<span class="p5-status p5-status-success">有效</span>';
        } else if (item.isValid === false) {
            statusHtml = '<span class="p5-status p5-status-error">失效</span>';
        } else {
            statusHtml = '<span class="p5-status">未知</span>';
        }
        
        const isInvalid = item.isValid === false;
        
        return `
            <tr>
                <td>${item.id}</td>
                <td>${formatDateTime(item.uploadTime)}</td>
                <td>${item.filename}</td>
                <td>
                    <div class="action-buttons">
                        ${item.httpsUrl ? `
                            <button class="p5-button action-btn" onclick="window.open('${item.httpsUrl}', '_blank')">
                                打开
                            </button>
                            <button class="p5-button action-btn" onclick="copyToClipboard('${item.httpsUrl}', 'URL')">
                                复制
                            </button>
                            <button class="p5-button action-btn ${isInvalid ? '' : 'disabled'}" ${isInvalid ? `onclick="deleteRecord(${item.id})"` : 'disabled'}>
                                清除
                            </button>
                        ` : '-'}
                    </div>
                </td>
                <td>${statusHtml}</td>
            </tr>
        `;
    }).join('');
}

/**
 * 更新清除失效按钮状态
 */
function updateClearInvalidButtonState() {
    const clearBtn = document.getElementById('clear-invalid');
    const invalidCount = state.history.filter(item => item.isValid === false).length;
    
    // 获取文本节点（SVG后面的文本）
    const textNode = Array.from(clearBtn.childNodes).find(node => 
        node.nodeType === Node.TEXT_NODE && node.textContent.trim()
    );
    
    if (invalidCount > 0) {
        clearBtn.disabled = false;
        if (textNode) {
            textNode.textContent = `清除失效 (${invalidCount})`;
        }
    } else {
        clearBtn.disabled = true;
        if (textNode) {
            textNode.textContent = '清除失效';
        }
    }
}

/**
 * 一键清除失效图片记录
 */
async function clearInvalidImages() {
    const invalidItems = state.history.filter(item => item.isValid === false);
    
    if (invalidItems.length === 0) {
        showToast('没有失效的图片', 'warning');
        return;
    }
    
    let deletedCount = 0;
    let failedCount = 0;
    
    for (const item of invalidItems) {
        const result = await apiRequest(`/history/${item.id}`, {
            method: 'DELETE'
        });
        
        if (result && result.success) {
            deletedCount++;
        } else {
            failedCount++;
        }
    }
    
    if (failedCount === 0) {
        showToast(`已清除 ${deletedCount} 条失效记录`, 'success');
    } else {
        showToast(`清除完成: 成功${deletedCount}条, 失败${failedCount}条`, 'warning');
    }
    
    // 重新加载数据
    await loadUrlsForCheck();
    updateClearInvalidButtonState();
}

/**
 * 删除单条记录
 */
async function deleteRecord(id) {
    const result = await apiRequest(`/history/${id}`, {
        method: 'DELETE'
    });
    
    if (result && result.success) {
        showToast('记录已删除', 'success');
        // 重新加载数据
        await loadUrlsForCheck();
        updateClearInvalidButtonState();
    } else {
        showToast('删除失败', 'error');
    }
}

// ===================================
// 事件监听
// ===================================
function initEventListeners() {
    // 登录表单
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const token = document.getElementById('token-input').value.trim();
        const loginError = document.getElementById('login-error');
        
        if (!token) {
            loginError.textContent = '请输入Token';
            loginError.classList.remove('hidden');
            return;
        }
        
        const success = await login(token);
        
        if (success) {
            loginError.classList.add('hidden');
            document.getElementById('token-input').value = '';
        } else {
            loginError.textContent = 'Token无效，请重试';
            loginError.classList.remove('hidden');
        }
    });
    
    // 导航按钮
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const page = e.target.dataset.page;
            if (page) {
                navigateTo(page);
            }
        });
    });
    
    // 退出按钮
    document.querySelector('.logout-btn').addEventListener('click', logout);
    
    // 文件上传区域
    const uploadArea = document.getElementById('upload-zone').parentElement;
    const fileInput = document.getElementById('file-input');
    
    uploadArea.addEventListener('click', () => fileInput.click());
    
    // 阻止浏览器默认拖拽行为
    uploadArea.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (files.length > 0) {
            addToQueue(files);
        } else {
            showToast('请选择图片文件', 'warning');
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            addToQueue(files);
        }
        fileInput.value = '';
    });
    
    // 开始上传按钮
    document.getElementById('start-upload').addEventListener('click', startUpload);
    
    // 清除队列按钮
    document.getElementById('clear-queue').addEventListener('click', clearQueue);
    
    // 复制成功URL按钮
    document.getElementById('copy-success-urls').addEventListener('click', copySuccessUrls);
    
    // 配置表单
    document.getElementById('config-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveConfigToServer();
    });
    
    // 开始检查按钮
    document.getElementById('start-check').addEventListener('click', startCheck);

    // 清除失效按钮
    document.getElementById('clear-invalid').addEventListener('click', clearInvalidImages);

    // 图片预览模态框事件
    document.getElementById('modal-close').addEventListener('click', closeImageModal);

    // 点击遮罩关闭图片预览模态框
    document.querySelector('#image-modal .p5-modal-mask').addEventListener('click', (e) => {
        if (e.target.classList.contains('p5-modal-mask')) {
            closeImageModal();
        }
    });

    // 复制模态框事件
    document.getElementById('copy-modal-close').addEventListener('click', closeCopyModal);

    // 点击遮罩关闭复制模态框
    document.querySelector('#copy-modal .p5-modal-mask').addEventListener('click', (e) => {
        if (e.target.classList.contains('p5-modal-mask')) {
            closeCopyModal();
        }
    });
}

// ===================================
// 工具函数
// ===================================

/**
 * 生成8位随机组ID
 */
function generateGroupId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * 将pending状态的图片按9张一组分割
 * @returns {Array} 分组列表，每组包含 {groupId, images}
 */
function createUploadGroups() {
    const pendingItems = state.uploadQueue.filter(item => item.status === 'pending');
    const groups = [];
    
    for (let i = 0; i < pendingItems.length; i += 9) {
        const groupImages = pendingItems.slice(i, i + 9);
        groups.push({
            groupId: generateGroupId(),
            images: groupImages,
            totalCount: groupImages.length
        });
    }
    
    return groups;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatDateTime(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showToast(message, type = 'info') {
    // 添加到队列
    state.toastQueue.push({ message, type });
    
    // 尝试显示下一条toast
    processToastQueue();
}

/**
 * 处理toast队列，最多同时显示3条
 */
function processToastQueue() {
    const MAX_TOASTS = 3;
    
    // 如果没有待显示的toast或已达到最大数量，直接返回
    if (state.toastQueue.length === 0 || state.activeToasts >= MAX_TOASTS) {
        return;
    }
    
    // 获取下一条toast
    const toastData = state.toastQueue.shift();
    state.activeToasts++;
    
    // 创建toast元素
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `p5-toast ${toastData.type}`;
    toast.textContent = toastData.message;
    container.appendChild(toast);
    
    // 设置独立倒计时
    setTimeout(() => {
        // 添加消失动画
        toast.style.animation = 'slideOutRight 0.3s ease-out forwards';
        
        // 动画结束后移除元素
        setTimeout(() => {
            toast.remove();
            state.activeToasts--;
            // 处理队列中的下一条
            processToastQueue();
        }, 300);
    }, 3000);
}

// ===================================
// 渲染应用
// ===================================
function render() {
    if (state.isAuthenticated) {
        showNavigation();
        navigateTo('upload');
    } else {
        hideNavigation();
        navigateTo('login');
    }
}

// ===================================
// 模态框管理
// ===================================
function openImageModal(url) {
    const modal = document.getElementById('image-modal');
    const modalImage = document.getElementById('modal-image');

    modalImage.src = url;
    modal.classList.remove('hidden');
}

function closeImageModal() {
    const modal = document.getElementById('image-modal');
    modal.classList.add('hidden');
    document.getElementById('modal-image').src = '';
}

// ===================================
// 剪贴板操作
// ===================================
async function copyToClipboard(text, label) {
    // 检查是否在安全上下文（HTTPS或localhost）
    const isSecureContext = window.isSecureContext || 
                            location.protocol === 'https:' || 
                            location.hostname === 'localhost' || 
                            location.hostname === '127.0.0.1';
    
    // 优先尝试现代API（仅安全上下文可用）
    if (isSecureContext && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(text);
            showToast(`${label} 已复制到剪贴板`, 'success');
            return;
        } catch (err) {
            console.warn('clipboard.writeText failed:', err);
            // 继续尝试降级方案
        }
    }
    
    // 降级方案：使用execCommand
    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        // 确保textarea不可见但仍在文档流中
        textarea.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;outline:0;box-shadow:none;background:transparent;opacity:0;';
        textarea.setAttribute('readonly', ''); // 防止移动端键盘弹出
        document.body.appendChild(textarea);
        
        // 选中内容
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length); // iOS兼容
        
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        
        if (success) {
            showToast(`${label} 已复制到剪贴板`, 'success');
            return;
        }
    } catch (e) {
        console.error('execCommand copy failed:', e);
    }
    
    // 所有方法都失败，显示手动复制弹窗
    showCopyModal(text);
}

/**
 * 显示手动复制弹窗
 */
function showCopyModal(text) {
    const modal = document.getElementById('copy-modal');
    const textarea = document.getElementById('copy-modal-text');
    
    textarea.value = text;
    modal.classList.remove('hidden');
    
    // 自动选中文本
    setTimeout(() => {
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, text.length);
    }, 100);
}

/**
 * 关闭复制弹窗
 */
function closeCopyModal() {
    const modal = document.getElementById('copy-modal');
    modal.classList.add('hidden');
}

// ===================================
// 按钮跳动动画
// ===================================
(function initButtonAnimation() {
    const svgWidth = 100;
    const svgHeight = 50;
    const animationSpeed = 120;

    const horizontalEdgePadding = 0;
    const verticalEdgePadding = 0;
    const horizontalCenterPadding = 20;
    const verticalCenterPadding = 5;

    const centerX = svgWidth / 2;
    const centerY = svgHeight / 2;
    const w = centerX - horizontalCenterPadding - horizontalEdgePadding;
    const h = centerY - verticalCenterPadding - verticalEdgePadding;

    const animationTimers = new Map();

    function initAnimations() {
        const buttons = document.querySelectorAll('.p5-button .button-svg, .nav-btn .button-svg');

        buttons.forEach((svg, index) => {
            const button = svg.closest('.p5-button');
            const selector = Snap(svg);
            const red = selector.select('.red');
            const blue = selector.select('.blue');

            const animate = () => {
                [red, blue].forEach((layer) => {
                    layer.animate({
                        points: [
                            Math.random() * w + horizontalEdgePadding,
                            Math.random() * h + verticalEdgePadding,
                            Math.random() * w + centerX + horizontalCenterPadding,
                            Math.random() * h + verticalEdgePadding,
                            Math.random() * w + centerX + horizontalCenterPadding,
                            Math.random() * h + centerY + verticalCenterPadding,
                            Math.random() * w + horizontalEdgePadding,
                            Math.random() * h + centerY + verticalCenterPadding,
                        ],
                    }, animationSpeed);
                });
            };

            button.addEventListener('mouseenter', () => {
                if (!animationTimers.has(index)) {
                    const timer = setInterval(animate, animationSpeed);
                    animationTimers.set(index, timer);
                }
            });

            button.addEventListener('mouseleave', () => {
                const timer = animationTimers.get(index);
                if (timer) {
                    clearInterval(timer);
                    animationTimers.delete(index);
                }
            });
        });
    }

    function checkReady() {
        if (typeof Snap !== 'undefined' && document.readyState === 'complete') {
            initAnimations();
        } else {
            setTimeout(checkReady, 100);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkReady);
    } else {
        checkReady();
    }
})();
