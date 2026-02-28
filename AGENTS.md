# Bili Images Uploader - 项目上下文

## 项目概述

B站图片上传器是一个用于将图片上传到B站图床并实现持久化的Web应用。用户通过Web界面上传图片，系统将图片上传到B站图床，并通过发送带图评论的方式实现图片的持久化存储。

### 核心功能
- 图片上传到B站图床（支持JPEG、PNG、WebP、GIF、BMP）
- 多图分组上传（每组最多9张图片）
- 通过发送带图评论实现图片持久化
- 上传历史记录管理
- 图片URL有效性检查
- Token认证保护

### 技术栈
- **后端**: Python 3.10+ / FastAPI / uvicorn
- **前端**: 原生HTML/CSS/JavaScript (SPA)
- **数据库**: SQLite
- **依赖管理**: uv / pyproject.toml
- **容器化**: Docker (多架构支持: linux/amd64, linux/arm64)
- **CI/CD**: GitHub Actions

## 项目结构

```
bili-images-uploader/
├── backend/                  # 后端代码
│   ├── pyproject.toml        # Python依赖配置
│   ├── uv.lock               # uv锁定文件
│   └── app/                  # FastAPI应用
│       ├── __init__.py
│       ├── main.py           # FastAPI主入口，API路由定义
│       ├── config.py         # 配置管理（Token、AES加密）
│       ├── database.py       # SQLite数据库操作
│       ├── dependencies.py   # 依赖注入（Token验证）
│       ├── bili_api.py       # B站API封装
│       └── upload_groups.py  # 上传分组临时存储
├── frontend/                 # 前端代码
│   ├── index.html            # 主页面
│   ├── css/style.css         # 样式
│   └── js/
│       ├── app.js            # 主应用逻辑
│       └── snap.svg-min.js   # SVG动画库
├── config/                   # 配置文件目录（运行时生成）
│   └── config.ini            # Token和B站凭证（AES加密）
├── data/                     # 数据目录（运行时生成）
│   └── history.db            # SQLite数据库
├── .github/workflows/        # GitHub Actions
│   ├── docker-publish.yml    # 发布镜像（tag触发）
│   └── docker-test.yml       # 测试镜像（main/master推送触发）
├── Dockerfile                # Docker构建文件
├── .dockerignore             # Docker忽略文件
├── .gitignore                # Git忽略文件
├── README.md
└── AGENTS.md
```

## 构建和运行

### 本地开发

```powershell
# 进入后端目录
cd backend

# 使用uv创建虚拟环境并安装依赖
uv venv
.venv\Scripts\activate
uv pip install -e ..

# 或使用pip
python -m venv .venv
.venv\Scripts\activate
pip install -e ..

# 运行开发服务器
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

### Docker部署

```powershell
# 构建镜像
docker build -t bili-images-uploader .

# 运行容器（挂载配置和数据目录）
docker run -d -p 8000:8000 -v ${PWD}/config:/app/config -v ${PWD}/data:/app/data bili-images-uploader
```

### 环境变量
- `BUILD_VERSION`: 构建版本（Docker构建时注入）
- `BUILD_COMMIT_SHA`: Git提交SHA
- `BUILD_COMMIT_LINK`: Git提交链接

## API接口

### 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth` | Token验证登录 |

### 配置
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/config` | 获取B站配置（需认证） |
| PUT | `/api/config` | 更新B站配置（需认证） |

### 上传
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/upload` | 分组上传图片（需认证） |
| POST | `/api/group/finalize` | 强制完成分组（需认证） |

**上传参数说明:**
- `files`: 图片文件
- `group_id`: 8位随机分组ID
- `total_count`: 组内图片总数(1-9)
- `current_index`: 当前图片序号(从1开始)
- 当 `current_index == total_count` 时自动发送多图评论

### 历史记录
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/history` | 获取上传历史（需认证） |
| DELETE | `/api/history/{id}` | 删除历史记录（需认证） |
| GET | `/api/urls` | 获取所有图片URL（需认证） |

### 系统
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/version` | 获取构建版本信息 |
| GET | `/` | 返回前端页面 |
| GET | `/static/*` | 静态文件服务 |

## 开发约定

### 代码风格
- **Python**: 使用类型提示，遵循PEP 8
- **文档字符串**: 使用三引号描述模块和函数
- **命名约定**:
  - Python: snake_case
  - 前端JS: camelCase
  - CSS: kebab-case

### 模块职责
| 模块 | 职责 |
|------|------|
| `main.py` | API路由定义，请求处理 |
| `bili_api.py` | B站API调用封装（上传、评论） |
| `config.py` | 配置读写、Token生成、AES加密 |
| `database.py` | SQLite数据持久化 |
| `upload_groups.py` | 上传分组临时内存存储（30分钟过期） |
| `dependencies.py` | FastAPI依赖注入（Token验证） |

### 安全机制
- Token使用SHA-256哈希存储
- 敏感配置（CSRF、SESSDATA、OID）使用AES-CBC加密存储
- Token同时作为加密密钥
- 首次启动自动生成32位随机Token（控制台输出）

### 前端特性
- 单页应用（SPA），无框架依赖
- P5风格UI设计（红蓝配色、几何动画）
- 支持拖拽上传
- 图片分组上传（每组最多9张）
- Snap.svg按钮动画效果

## 依赖说明

### 核心依赖 (pyproject.toml)
```
fastapi>=0.109.0
uvicorn[standard]>=0.27.0
python-multipart>=0.0.6    # 文件上传
pycryptodome>=3.20.0       # AES加密
aiofiles>=23.2.1           # 异步文件操作
httpx>=0.26.0              # HTTP客户端
```

## CI/CD流程

### docker-test.yml
- **触发条件**: push到main/master分支
- **输出**: `:test`标签镜像

### docker-publish.yml
- **触发条件**: 推送v*标签
- **输出**: 版本标签镜像
- **平台**: linux/amd64, linux/arm64

## 常见问题

### Token丢失
删除 `config/config.ini` 文件并重启服务，系统会重新生成Token并在控制台输出。

### 图片上传失败
1. 检查B站配置是否正确（CSRF、SESSDATA、OID）
2. 确认SESSDATA未过期
3. 检查图片格式和大小（限制10MB）

### 分组上传中断
调用 `POST /api/group/finalize` 强制完成已上传图片的评论。

### Docker挂载权限
确保挂载的config和data目录有正确的读写权限。