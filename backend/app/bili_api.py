"""
B站API模块
- 图片上传到B站图床
- 发送带图评论实现持久化
"""

import time
import json
from datetime import datetime
import httpx
from typing import Optional, Dict, Any, Tuple
from pathlib import Path
from urllib.parse import urlparse


class BiliAPI:
    """B站API封装"""
    
    UPLOAD_URL = "https://api.bilibili.com/x/dynamic/feed/draw/upload_bfs"
    COMMENT_URL = "https://api.bilibili.com/x/v2/reply/add"
    
    def __init__(self, csrf: str, sessdata: str, oid: str):
        self.csrf = csrf
        self.sessdata = sessdata
        self.oid = oid
    
    def _get_headers(self) -> Dict[str, str]:
        """获取通用请求头"""
        return {
            "Referer": "https://member.bilibili.com/",
            "Cookie": f"SESSDATA={self.sessdata}",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
        }
    
    def _extract_remote_filename(self, image_url: str) -> Tuple[str, str]:
        """
        从图片URL提取远端文件名
        
        Returns:
            (remote_filename, remote_name_without_ext): 远端文件名和不含后缀的文件名
        """
        parsed = urlparse(image_url)
        path = parsed.path  # /bfs/new_dyn/xxx.jpg
        remote_filename = Path(path).name  # xxx.jpg
        remote_name_without_ext = Path(path).stem  # xxx
        return remote_filename, remote_name_without_ext
    
    async def upload_image(self, file_content: bytes, filename: str) -> Tuple[bool, Dict[str, Any]]:
        """
        上传图片到B站图床
        
        Args:
            file_content: 图片二进制内容
            filename: 文件名
        
        Returns:
            (success, data): 成功状态和数据
        """
        async with httpx.AsyncClient(timeout=120) as client:
            files = {
                "file_up": (filename, file_content, "image/png")
            }
            data = {
                "csrf": self.csrf,
                "biz": "article"
            }
            
            try:
                response = await client.post(
                    self.UPLOAD_URL,
                    headers=self._get_headers(),
                    files=files,
                    data=data
                )
                
                result = response.json()
                
                if result.get("code") == 0 and result.get("data"):
                    return True, result["data"]
                else:
                    return False, {
                        "code": result.get("code"),
                        "message": result.get("message", "上传失败")
                    }
            except Exception as e:
                return False, {"error": str(e)}
    
    async def send_comment(self, image_url: str, local_filename: str, remote_name_without_ext: str,
                           image_width: int = 0, image_height: int = 0) -> Tuple[bool, str]:
        """
        发送带图评论实现图片持久化
        
        Args:
            image_url: B站图片URL
            local_filename: 本地原始文件名（不含后缀）
            remote_name_without_ext: 远端文件名（不含后缀）
            image_width: 图片宽度
            image_height: 图片高度
        
        Returns:
            (success, message): 成功状态和消息
        """
        # 新评论模板
        timestamp = int(time.time())
        datetime_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        message = f"文件名: {local_filename}\n远端文件名: {remote_name_without_ext}\n时间戳: {timestamp}\n时间: {datetime_str}"
        
        # 构造pictures参数（数组格式的JSON字符串）
        picture_data = {
            "img_src": image_url,
            "img_width": image_width,
            "img_height": image_height
        }
        
        async with httpx.AsyncClient(timeout=30) as client:
            data = {
                "csrf": self.csrf,
                "plat": 1,
                "oid": self.oid,
                "type": 11,
                "message": message,
                "at_name_to_mid": "{}",
                "pictures": f'[{json.dumps(picture_data, ensure_ascii=False)}]',
                "gaia_source": "main_web",
                "statistics": '{"appId":100,"platform":5}'
            }
            
            headers = self._get_headers()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
            
            try:
                response = await client.post(
                    self.COMMENT_URL,
                    headers=headers,
                    data=data
                )
                
                result = response.json()
                
                if result.get("code") == 0:
                    return True, "评论发送成功"
                else:
                    error_msg = result.get("message", "评论发送失败")
                    return False, f"[{result.get('code')}] {error_msg}"
            except Exception as e:
                return False, str(e)
    
    async def upload_and_persist(self, file_content: bytes, filename: str) -> Tuple[bool, Dict[str, Any]]:
        """
        上传图片并发送评论持久化
        
        Args:
            file_content: 图片二进制内容
            filename: 文件名
        
        Returns:
            (success, data): 成功状态和数据
        """
        # Step 1: 上传图片
        success, data = await self.upload_image(file_content, filename)
        
        if not success:
            return False, {
                "stage": "upload",
                "error": data.get("message") or data.get("error", "上传失败")
            }
        
        image_url = data.get("image_url")
        
        if not image_url:
            return False, {
                "stage": "upload",
                "error": "未获取到图片URL"
            }
        
        # 提取远端文件名信息
        remote_filename, remote_name_without_ext = self._extract_remote_filename(image_url)
        
        # 本地文件名（不含后缀）
        local_name_without_ext = Path(filename).stem
        
        # Step 2: 发送评论持久化
        comment_success, comment_msg = await self.send_comment(
            image_url, 
            local_name_without_ext,
            remote_name_without_ext,
            data.get("image_width", 0), 
            data.get("image_height", 0)
        )
        
        if not comment_success:
            # 上传成功但评论失败，仍返回URL但标记警告
            return True, {
                "image_url": image_url,
                "remote_filename": remote_filename,
                "remote_name_without_ext": remote_name_without_ext,
                "image_width": data.get("image_width"),
                "image_height": data.get("image_height"),
                "warning": f"图片上传成功但评论持久化失败: {comment_msg}"
            }
        
        return True, {
            "image_url": image_url,
            "remote_filename": remote_filename,
            "remote_name_without_ext": remote_name_without_ext,
            "image_width": data.get("image_width"),
            "image_height": data.get("image_height")
        }