# Bili Images Uploader

Bili Images Uploader - 将图片上传到B站图床并通过评论实现持久化存储

## 预言信

<img width="1770" height="1300" alt="CallingCard" src="https://github.com/user-attachments/assets/35c02160-0f3d-4ac5-9d15-523a2e7822c6" />

## 截图预览

<details>
<img width="640" height="480" alt="" src="https://github.com/user-attachments/assets/8fabeb21-6f65-4b2a-93c6-c15fe164f8bd" />
<img width="640" height="480" alt="" src="https://github.com/user-attachments/assets/aebd227d-5f52-4556-b1ae-0ea204a037b8" />
<img width="640" height="480" alt="" src="https://github.com/user-attachments/assets/710aef91-b465-4a94-bdda-d6b4c719d5b0" />
<img width="640" height="480" alt="" src="https://github.com/user-attachments/assets/2aefa780-3ec8-4e21-b6ab-338f1fd5e286" />
<img width="640" height="480" alt="" src="https://github.com/user-attachments/assets/b52a943d-5c58-49b3-b0e2-d115535162d7" />
<img width="640" height="480" alt="" src="https://github.com/user-attachments/assets/2d585117-5eac-4144-b45a-6cf3dc66b97f" />
</details>

## 功能特性

- 图片上传到B站图床（支持 JPEG、PNG、WebP、GIF、BMP）
- 多图分组上传（每组最多9张图片）
- 通过发送带图评论实现图片持久化
- 上传历史记录管理
- 图片URL有效性检查
- Token认证保护
- 支持Docker部署（多架构：amd64/arm64）

## 快速开始

### Docker部署（推荐）

```bash
# 拉取镜像
docker pull jacksen168/bili-images-uploader:latest

# 运行容器
docker run -d -p 8000:8000 \
  -v ./config:/app/config \
  -v ./data:/app/data \
  jacksen168/bili-images-uploader:latest
```

访问 `http://localhost:8000` 即可使用。

### 本地开发

```bash
# 克隆项目
git clone https://github.com/jacksen168sub/bili-images-uploader.git
cd bili-images-uploader

# 安装依赖（使用uv）
cd backend
uv sync

# 启动服务
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

## 配置说明

### 首次启动

首次启动时,控制台会输出自动生成的32位Token,请妥善保存。如果丢失了你需要删除配置文件并重启服务重新生成。

### B站账号配置

在Web界面中配置以下信息：

| 参数 | 说明 | 获取方式 |
|------|------|----------|
| CSRF Token | B站CSRF凭证 | 登录B站后从Cookie中获取 `bili_jct` |
| SESSDATA | B站会话凭证 | 登录B站后从Cookie中获取 `SESSDATA` |
| OID | 评论目标ID | B站动态或文章的ID |

详细配置教程请参考 [Wiki](https://github.com/jacksen168sub/bili-images-uploader/wiki)

## 使用方法

1. **登录**: 输入Token进行身份验证
2. **配置**: 在配置页面填写B站账号信息
3. **上传**: 拖拽或点击选择图片，支持批量上传
4. **管理**: 查看上传历史，复制图片URL

## 技术栈

- **后端**: Python 3.10+ / FastAPI / uvicorn
- **前端**: 原生 HTML/CSS/JavaScript (SPA)
- **数据库**: SQLite
- **安全**: SHA-256 Token哈希 + AES-CBC 敏感数据加密

## API文档

启动服务后访问 `http://localhost:8000/docs` 查看Swagger API文档。

### 主要接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth` | Token验证登录 |
| GET | `/api/config` | 获取B站配置 |
| PUT | `/api/config` | 更新B站配置 |
| POST | `/api/upload` | 上传图片 |
| GET | `/api/history` | 获取上传历史 |

## 常见问题

### Token忘记了怎么办？

删除 `config/config.ini` 文件并重启服务，系统会重新生成Token。

### 图片上传失败？

1. 检查B站配置是否正确
2. 确认SESSDATA未过期
3. 检查图片格式和大小（限制10MB）

## 参考文章:
- [The UI Design of Persona 5](https://jiaxinwen.wordpress.com/2017/04/27/the-ui-design-of-persona-5/)
- [The UI and UX of Persona 5](https://ridwankhan.com/the-ui-and-ux-of-persona-5-183180eb7cce?gi=b908293303c1)
- [浅谈 Persona5 UI #1：How Pop X Punk？！](https://indienova.com/indie-game-development/p5-ui-design/)
- [热情之红，反抗之心！——《女神异闻录5》界面赏析（上）](https://api.xiaoheihe.cn/maxnews/app/share/detail/3016980)
- [p5-ui](https://github.com/q-mona/p5-ui)
- [Persona 5 Menu UI](https://codepen.io/dangodev/pen/qXdxOO)

## 有话说
尝试过模仿P5的美术后,再此被P5的美术折服。不愧于天下第一之名,很多设计都模仿不来,即使模仿过来要么阅读体验糟糕;要么兼容性雪崩。我只能尽力而为大概的模仿一下了[摊手]

## 许可证

MIT License
