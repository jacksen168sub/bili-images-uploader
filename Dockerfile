# Bili Images Uploader
FROM python:3.11-slim

# 构建参数
ARG BUILD_VERSION=dev
ARG BUILD_COMMIT_SHA=""
ARG BUILD_COMMIT_LINK=""

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 复制项目文件
COPY backend/pyproject.toml ./backend/
COPY backend/app ./backend/app
COPY frontend ./frontend

# 安装uv并安装依赖
RUN pip install uv && \
    cd backend && \
    uv pip install --system .

# 创建数据目录
RUN mkdir -p /app/config /app/data

# 设置环境变量
ENV PYTHONUNBUFFERED=1
ENV BUILD_VERSION=${BUILD_VERSION}
ENV BUILD_COMMIT_SHA=${BUILD_COMMIT_SHA}
ENV BUILD_COMMIT_LINK=${BUILD_COMMIT_LINK}

# 暴露端口
EXPOSE 8000

# 启动命令
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]