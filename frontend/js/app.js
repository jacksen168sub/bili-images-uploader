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
    isChecking: false
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
                statusText = '上传中...';
                statusClass = 'status-uploading';
                break;
            case 'completed':
                statusText = item.url || '已完成';
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
async function startUpload() {
    const pendingItems = state.uploadQueue.filter(item => item.status === 'pending');
    
    if (pendingItems.length === 0) {
        showToast('没有待上传的文件', 'warning');
        return;
    }
    
    showToast('开始上传...', 'info');
    
    for (const item of pendingItems) {
        item.status = 'uploading';
        renderUploadQueue();
        
        // 创建FormData
        const formData = new FormData();
        formData.append('files', item.file);
        
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
                    
                    if (uploadResult.warning) {
                        showToast(uploadResult.warning, 'warning');
                    }
                } else {
                    item.status = 'error';
                    item.error = uploadResult.error;
                }
            } else {
                item.status = 'error';
                item.error = result.detail || '上传失败';
            }
        } catch (error) {
            item.status = 'error';
            item.error = '网络错误';
        }
        
        renderUploadQueue();
    }
    
    // 显示完成提示
    const completed = state.uploadQueue.filter(item => item.status === 'completed').length;
    const failed = state.uploadQueue.filter(item => item.status === 'error').length;
    
    if (failed === 0) {
        showToast(`所有文件上传完成 (${completed}个)`, 'success');
    } else {
        showToast(`上传完成: 成功${completed}个, 失败${failed}个`, 'warning');
    }
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
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--p5-light-gray);">暂无历史记录</td></tr>';
        return;
    }
    
    tbody.innerHTML = state.history.map(item => `
        <tr>
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
    const result = await apiRequest('/urls');
    
    if (result && result.success) {
        state.history = result.data || [];
        renderCheckTable();
    }
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
    
    for (const item of state.history) {
        try {
            // 前端直接请求图片URL检查有效性
            const response = await fetch(item.httpsUrl, { 
                method: 'HEAD',
                mode: 'no-cors' // 跨域情况下只能判断是否抛出错误
            });
            // no-cors模式下response.ok不可用，只能假设不抛错就是成功
            item.isValid = true;
        } catch (error) {
            item.isValid = false;
        }
        
        checked++;
        const progress = Math.round((checked / total) * 100);
        progressFill.style.width = `${progress}%`;
        progressText.textContent = `${progress}%`;
        
        // 实时更新表格
        renderCheckTable();
    }
    
    state.isChecking = false;
    showToast('检查完成', 'success');
    
    setTimeout(() => {
        document.getElementById('check-progress').classList.add('hidden');
    }, 2000);
}

function renderCheckTable() {
    const tbody = document.getElementById('check-table-body');
    
    if (state.history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--p5-light-gray);">暂无历史记录</td></tr>';
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
        
        return `
            <tr>
                <td>${formatDateTime(item.uploadTime)}</td>
                <td>${item.filename}</td>
                <td><a href="${item.httpsUrl}" target="_blank" rel="noopener noreferrer">${item.httpsUrl}</a></td>
                <td>${statusHtml}</td>
            </tr>
        `;
    }).join('');
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
    
    // 配置表单
    document.getElementById('config-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveConfigToServer();
    });
    
    // 开始检查按钮
    document.getElementById('start-check').addEventListener('click', startCheck);

    // 模态框事件
    document.getElementById('modal-close').addEventListener('click', closeImageModal);

    // 点击遮罩关闭模态框
    document.querySelector('.p5-modal-mask').addEventListener('click', (e) => {
        if (e.target.classList.contains('p5-modal-mask')) {
            closeImageModal();
        }
    });
}

// ===================================
// 工具函数
// ===================================
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
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `p5-toast ${type}`;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
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
    try {
        await navigator.clipboard.writeText(text);
        showToast(`${label} 已复制到剪贴板`, 'success');
    } catch (err) {
        // 降级方案
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showToast(`${label} 已复制到剪贴板`, 'success');
        } catch (e) {
            showToast('复制失败，请手动复制', 'error');
        }
        document.body.removeChild(textarea);
    }
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
