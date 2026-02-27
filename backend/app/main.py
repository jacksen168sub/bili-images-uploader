"""
B站图片上传器 - FastAPI主入口
"""

import os
import mimetypes
from pathlib import Path
from typing import List, Optional
from datetime import datetime

from fastapi import FastAPI, File, UploadFile, Form, Depends, HTTPException, status
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import config_manager
from .database import db
from .bili_api import BiliAPI
from .dependencies import verify_token


# 创建FastAPI应用
app = FastAPI(
    title="Bili Images Uploader",
    description="B站图片上传器API",
    version="1.0.0"
)

# CORS配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============ Pydantic模型 ============

class LoginRequest(BaseModel):
    token: str


class ConfigUpdate(BaseModel):
    csrf: str
    sessdata: str
    oid: str


class UploadResponse(BaseModel):
    success: bool
    filename: str
    url: Optional[str] = None
    error: Optional[str] = None


# ============ API路由 ============

@app.post("/api/auth")
async def login(request: LoginRequest):
    """
    Token验证登录
    """
    if config_manager.verify_token(request.token):
        return {"success": True, "message": "验证成功"}
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token无效"
        )


@app.get("/api/config")
async def get_config(token: str = Depends(verify_token)):
    """
    获取B站配置
    """
    config = config_manager.get_bili_config(token)
    return {
        "success": True,
        "data": {
            "csrf": config["csrf"],
            "sessdata": config["sessdata"],
            "oid": config["oid"]
        }
    }


@app.put("/api/config")
async def update_config(
    config: ConfigUpdate,
    token: str = Depends(verify_token)
):
    """
    更新B站配置
    """
    config_manager.set_bili_config(
        csrf=config.csrf,
        sessdata=config.sessdata,
        oid=config.oid,
        token=token
    )
    return {"success": True, "message": "配置已保存"}


@app.get("/api/version")
async def get_version():
    """
    获取构建版本信息
    """
    version = os.environ.get("BUILD_VERSION", "dev")
    commit_sha = os.environ.get("BUILD_COMMIT_SHA", "")
    commit_link = os.environ.get("BUILD_COMMIT_LINK", "")
    
    return {
        "success": True,
        "data": {
            "version": version,
            "commitSha": commit_sha,
            "commitLink": commit_link
        }
    }


@app.post("/api/upload")
async def upload_images(
    files: List[UploadFile] = File(...),
    token: str = Depends(verify_token)
):
    """
    批量上传图片到B站
    """
    # 检查B站配置
    bili_config = config_manager.get_bili_config(token)
    if not all([bili_config["csrf"], bili_config["sessdata"], bili_config["oid"]]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请先配置B站账号信息"
        )
    
    # 创建B站API实例
    bili = BiliAPI(
        csrf=bili_config["csrf"],
        sessdata=bili_config["sessdata"],
        oid=bili_config["oid"]
    )
    
    results = []
    
    for file in files:
        # 读取文件内容
        content = await file.read()
        file_size = len(content)
        filename = file.filename or "unknown.png"
        
        # 验证文件类型
        mime_type, _ = mimetypes.guess_type(filename)
        allowed_types = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"]
        
        if mime_type not in allowed_types:
            results.append({
                "success": False,
                "filename": filename,
                "error": f"不支持的文件类型: {mime_type}"
            })
            continue
        
        # 验证文件大小（10MB限制）
        if file_size > 10 * 1024 * 1024:
            results.append({
                "success": False,
                "filename": filename,
                "error": "文件大小超过10MB限制"
            })
            continue
        
        # 上传到B站
        success, data = await bili.upload_and_persist(content, filename)
        
        if success:
            image_url = data.get("image_url")
            # 正确生成http和https两种URL
            if image_url:
                if image_url.startswith("https://"):
                    http_url = image_url.replace("https://", "http://", 1)
                    https_url = image_url
                elif image_url.startswith("http://"):
                    http_url = image_url
                    https_url = image_url.replace("http://", "https://", 1)
                else:
                    http_url = f"http://{image_url}"
                    https_url = f"https://{image_url}"
            else:
                http_url = ""
                https_url = ""
            
            # 获取远端文件名信息
            remote_filename = data.get("remote_filename", "")
            remote_name_without_ext = data.get("remote_name_without_ext", "")
            
            # 保存到数据库
            db.add_record(
                filename=filename,
                http_url=http_url,
                https_url=https_url,
                remote_filename=remote_filename,
                remote_name_without_ext=remote_name_without_ext,
                file_size=file_size,
                status="success"
            )
            
            results.append({
                "success": True,
                "filename": filename,
                "httpUrl": http_url,
                "httpsUrl": https_url,
                "remoteFilename": remote_filename,
                "remoteNameWithoutExt": remote_name_without_ext,
                "width": data.get("image_width"),
                "height": data.get("image_height"),
                "warning": data.get("warning")
            })
        else:
            # 记录失败
            db.add_record(
                filename=filename,
                http_url="",
                https_url="",
                file_size=file_size,
                status="failed",
                error_msg=data.get("error", "上传失败")
            )
            
            results.append({
                "success": False,
                "filename": filename,
                "error": data.get("error", "上传失败")
            })
    
    return {"success": True, "results": results}


@app.get("/api/history")
async def get_history(
    limit: int = 100,
    offset: int = 0,
    token: str = Depends(verify_token)
):
    """
    获取上传历史记录
    """
    records = db.get_records(limit=limit, offset=offset)
    
    # 格式化返回数据
    formatted = []
    for record in records:
        formatted.append({
            "id": record["id"],
            "filename": record["filename"],
            "httpUrl": record["http_url"],
            "httpsUrl": record["https_url"],
            "remoteFilename": record["remote_filename"],
            "remoteNameWithoutExt": record["remote_name_without_ext"],
            "fileSize": record["file_size"],
            "uploadTime": record["upload_time"],
            "status": record["status"],
            "errorMsg": record["error_msg"]
        })
    
    return {
        "success": True,
        "data": formatted,
        "total": db.get_count()
    }


@app.delete("/api/history/{record_id}")
async def delete_history(
    record_id: int,
    token: str = Depends(verify_token)
):
    """
    删除历史记录
    """
    if db.delete_record(record_id):
        return {"success": True, "message": "记录已删除"}
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="记录不存在"
        )


@app.get("/api/urls")
async def get_all_urls(token: str = Depends(verify_token)):
    """
    获取所有图片URL（用于前端失效检查）
    """
    records = db.get_all_urls()
    
    formatted = []
    for record in records:
        formatted.append({
            "id": record["id"],
            "filename": record["filename"],
            "httpUrl": record["http_url"],
            "httpsUrl": record["https_url"],
            "uploadTime": record["upload_time"]
        })
    
    return {"success": True, "data": formatted}


# ============ 静态文件服务 ============

# 获取前端目录路径
FRONTEND_DIR = Path(__file__).parent.parent.parent / "frontend"

# 挂载静态文件
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/", response_class=HTMLResponse)
async def index():
    """
    返回前端页面
    """
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        with open(index_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    else:
        return HTMLResponse(content="<h1>Frontend not found</h1>", status_code=404)


# ============ 启动提示 ============

@app.on_event("startup")
async def startup_event():
    """应用启动时显示配置信息"""
    print("\n" + "=" * 50)
    print("Bili Images Uploader 已启动")
    print("=" * 50 + "\n")
