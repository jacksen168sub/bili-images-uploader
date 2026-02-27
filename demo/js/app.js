// ===================================
// B站图片上传器 - SPA应用
// ===================================

// 模拟Token
const VALID_TOKEN = 'TESTTOKEN1234567890ABCDEFGHIJKL';

// 全局状态
const state = {
    isAuthenticated: false,
    token: null,
    config: {
        biliCsrf: '',
        biliSessdata: '',
        biliOid: '',
        token: ''
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

function initApp() {
    // 检查登录状态
    checkAuth();
    
    // 初始化配置
    loadConfig();
    
    // 加载模拟历史数据
    loadMockHistory();
    
    // 初始化事件监听
    initEventListeners();
    
    // 渲染页面
    render();
}

// ===================================
// 认证管理
// ===================================
function checkAuth() {
    const savedToken = localStorage.getItem('token');
    if (savedToken === VALID_TOKEN) {
        state.isAuthenticated = true;
        state.token = savedToken;
        showNavigation();
    }
}

function login(token) {
    if (token === VALID_TOKEN) {
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
        renderHistory();
    } else if (page === 'check') {
        renderCheckTable();
    } else if (page === 'upload') {
        renderUploadQueue();
    } else if (page === 'config') {
        loadConfigToForm();
    }
}

// ===================================
// 配置管理
// ===================================
function loadConfig() {
    const savedConfig = localStorage.getItem('config');
    if (savedConfig) {
        state.config = JSON.parse(savedConfig);
    }
}

function saveConfig() {
    localStorage.setItem('config', JSON.stringify(state.config));
    showToast('配置已保存', 'success');
}

function loadConfigToForm() {
    document.getElementById('config-csrf').value = state.config.biliCsrf;
    document.getElementById('config-sessdata').value = state.config.biliSessdata;
    document.getElementById('config-oid').value = state.config.biliOid;
    document.getElementById('config-token').value = state.config.token;
}

// ===================================
// 上传队列管理
// ===================================
function addToQueue(files) {
    files.forEach(file => {
        const queueItem = {
            id: Date.now() + Math.random(),
            name: file.name,
            size: file.size,
            file: file,
            status: 'pending' // pending, uploading, completed, error
        };
        state.uploadQueue.push(queueItem);
    });
    renderUploadQueue();
    showToast(`已添加 ${files.length} 个文件到队列`, 'info');
}

function removeFromQueue(id) {
    state.uploadQueue = state.uploadQueue.filter(item => item.id !== id);
    renderUploadQueue();
}

function renderUploadQueue() {
    const queueList = document.getElementById('queue-list');
    
    if (state.uploadQueue.length === 0) {
        queueList.innerHTML = '<p style="color: var(--p5-light-gray); text-align: center; padding: 20px;">队列为空</p>';
        return;
    }
    
    queueList.innerHTML = state.uploadQueue.map(item => `
        <div class="queue-item" data-id="${item.id}">
            <div class="queue-item-info">
                <div class="queue-item-name">${item.name}</div>
                <div class="queue-item-size">${formatFileSize(item.size)}</div>
            </div>
            <div class="queue-item-actions">
                <button class="queue-item-delete" onclick="removeFromQueue(${item.id})">删除</button>
            </div>
        </div>
    `).join('');
}

// ===================================
// 模拟上传
// ===================================
async function startUpload() {
    if (state.uploadQueue.length === 0) {
        showToast('队列为空，请先添加文件', 'warning');
        return;
    }
    
    showToast('开始上传...', 'info');
    
    for (let i = 0; i < state.uploadQueue.length; i++) {
        const item = state.uploadQueue[i];
        item.status = 'uploading';
        renderUploadQueue();
        
        // 模拟上传延迟
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
        
        // 模拟成功
        item.status = 'completed';
        
        // 添加到历史记录
        addToHistory({
            name: item.name,
            size: item.size,
            status: 'success',
            time: new Date().toISOString()
        });
    }
    
    // 清空队列
    state.uploadQueue = [];
    renderUploadQueue();
    showToast('所有文件上传完成', 'success');
}

// ===================================
// 历史记录管理
// ===================================
function loadMockHistory() {
    const mockHistory = [];
    const now = Date.now();
    
    for (let i = 0; i < 15; i++) {
        const status = Math.random() > 0.1 ? 'success' : 'error';
        mockHistory.push({
            id: i,
            name: `image_${i + 1}.jpg`,
            size: Math.floor(Math.random() * 5000000) + 100000,
            status: status,
            time: new Date(now - i * 86400000).toISOString(),
            httpUrl: `http://example.com/image_${i + 1}.jpg`,
            httpsUrl: `https://example.com/image_${i + 1}.jpg`
        });
    }
    
    state.history = mockHistory;
}

function addToHistory(item) {
    state.history.unshift({
        id: Date.now(),
        httpUrl: item.httpUrl || '',
        httpsUrl: item.httpsUrl || '',
        ...item
    });
}

function renderHistory() {
    const tbody = document.getElementById('history-table-body');

    tbody.innerHTML = state.history.map(item => `
        <tr>
            <td>${formatDateTime(item.time)}</td>
            <td>${item.name}</td>
            <td>${formatFileSize(item.size)}</td>
            <td><span class="p5-status ${item.status === 'success' ? 'p5-status-success' : 'p5-status-error'}">${item.status === 'success' ? '成功' : '失败'}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="p5-button action-btn" onclick="openImageModal(${item.id})">
                        查看
                    </button>
                    <button class="p5-button action-btn" onclick="copyToClipboard('${item.httpUrl}', 'HTTP URL')">
                        复制HTTP
                    </button>
                    <button class="p5-button action-btn" onclick="copyToClipboard('${item.httpsUrl}', 'HTTPS URL')">
                        复制HTTPS
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// ===================================
// 失效检查
// ===================================
async function startCheck() {
    if (state.isChecking) {
        showToast('检查正在进行中', 'warning');
        return;
    }
    
    state.isChecking = true;
    document.getElementById('check-progress').classList.remove('hidden');
    
    const progressFill = document.getElementById('check-progress-fill');
    const progressText = document.getElementById('check-progress-text');
    const total = state.history.length;
    let checked = 0;
    
    for (let i = 0; i < state.history.length; i++) {
        // 模拟检查延迟
        await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));
        
        // 随机设置失效状态
        state.history[i].isValid = Math.random() > 0.2;
        
        checked++;
        const progress = Math.round((checked / total) * 100);
        progressFill.style.width = `${progress}%`;
        progressText.textContent = `${progress}%`;
    }
    
    state.isChecking = false;
    renderCheckTable();
    showToast('检查完成', 'success');
    
    setTimeout(() => {
        document.getElementById('check-progress').classList.add('hidden');
    }, 2000);
}

function renderCheckTable() {
    const tbody = document.getElementById('check-table-body');
    
    tbody.innerHTML = state.history.map(item => `
        <tr>
            <td>${formatDateTime(item.time)}</td>
            <td>${item.name}</td>
            <td><a href="${item.httpsUrl}" target="_blank" >${item.httpsUrl}</a></td>
            <td>
                <span class="p5-status ${item.isValid !== false ? 'p5-status-success' : 'p5-status-error'}">
                    ${item.isValid === false ? '失效' : '有效'}
                </span>
            </td>
        </tr>
    `).join('');
}

// ===================================
// 事件监听
// ===================================
function initEventListeners() {
    // 登录表单
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const token = document.getElementById('token-input').value.trim();
        const loginError = document.getElementById('login-error');
        
        if (login(token)) {
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
    document.getElementById('config-form').addEventListener('submit', (e) => {
        e.preventDefault();
        state.config.biliCsrf = document.getElementById('config-csrf').value.trim();
        state.config.biliSessdata = document.getElementById('config-sessdata').value.trim();
        state.config.biliOid = document.getElementById('config-oid').value.trim();
        state.config.token = document.getElementById('config-token').value.trim();
        saveConfig();
    });
    
    // 开始检查按钮
    document.getElementById('start-check').addEventListener('click', startCheck);

    // 模态框事件
    document.getElementById('modal-close').addEventListener('click', closeImageModal);

    // 点击遮罩关闭模态框（排除点击模态框容器本身的情况）
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
function openImageModal(id) {
    const item = state.history.find(h => h.id === id);
    if (!item) return;

    const modal = document.getElementById('image-modal');
    const modalImage = document.getElementById('modal-image');

    modalImage.src = item.httpsUrl;
    modal.classList.remove('hidden');
}

function closeImageModal() {
    const modal = document.getElementById('image-modal');
    modal.classList.add('hidden');

    // 清空图片源，避免下次打开时显示旧图片
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
        // 降级方案：使用传统方法
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
// 按钮跳动动画 (基于 code.html 的实现)
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

    // 存储每个按钮的动画定时器
    const animationTimers = new Map();

    function initAnimations() {
        // 为所有带有 .button-svg 的按钮添加动画
        const buttons = document.querySelectorAll('.p5-button .button-svg, .nav-btn .button-svg');
        console.log('找到的按钮数量:', buttons.length);

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

            // 鼠标进入时启动动画
            button.addEventListener('mouseenter', () => {
                if (!animationTimers.has(index)) {
                    const timer = setInterval(animate, animationSpeed);
                    animationTimers.set(index, timer);
                }
            });

            // 鼠标离开时停止动画
            button.addEventListener('mouseleave', () => {
                const timer = animationTimers.get(index);
                if (timer) {
                    clearInterval(timer);
                    animationTimers.delete(index);
                }
            });
        });
    }

    // 等待 DOM 和 SnapSVG 加载完成
    function checkReady() {
        if (typeof Snap !== 'undefined' && document.readyState === 'complete') {
            initAnimations();
        } else {
            setTimeout(checkReady, 100);
        }
    }

    // 开始检查
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkReady);
    } else {
        checkReady();
    }
})();