"""
上传分组临时存储模块
用于存储组内图片信息，等待一组完成后统一发送评论
"""

import time
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from threading import Lock

# 组数据过期时间（秒）- B站图片URL有效期30分钟
GROUP_EXPIRE_TIME = 30 * 60


@dataclass
class ImageInfo:
    """单张图片信息"""
    filename: str
    http_url: str
    https_url: str
    remote_filename: str
    remote_name_without_ext: str
    file_size: int
    image_width: int
    image_height: int
    upload_time: float = field(default_factory=time.time)


@dataclass
class UploadGroup:
    """上传分组"""
    group_id: str
    total_count: int
    images: List[ImageInfo] = field(default_factory=list)
    created_time: float = field(default_factory=time.time)


class UploadGroupManager:
    """上传分组管理器"""
    
    def __init__(self):
        self._groups: Dict[str, UploadGroup] = {}
        self._lock = Lock()
    
    def create_group(self, group_id: str, total_count: int) -> UploadGroup:
        """创建新的上传分组"""
        with self._lock:
            # 如果存在旧组，直接覆盖（相当于丢弃旧组数据）
            group = UploadGroup(
                group_id=group_id,
                total_count=total_count
            )
            self._groups[group_id] = group
            return group
    
    def get_group(self, group_id: str) -> Optional[UploadGroup]:
        """获取分组"""
        with self._lock:
            return self._groups.get(group_id)
    
    def add_image(self, group_id: str, image_info: ImageInfo) -> Optional[UploadGroup]:
        """向分组添加图片"""
        with self._lock:
            group = self._groups.get(group_id)
            if group:
                group.images.append(image_info)
                return group
            return None
    
    def remove_group(self, group_id: str) -> bool:
        """移除分组"""
        with self._lock:
            if group_id in self._groups:
                del self._groups[group_id]
                return True
            return False
    
    def is_group_complete(self, group_id: str) -> bool:
        """检查分组是否完成"""
        with self._lock:
            group = self._groups.get(group_id)
            if group:
                return len(group.images) >= group.total_count
            return False
    
    def get_and_remove_group(self, group_id: str) -> Optional[UploadGroup]:
        """获取并移除分组（原子操作）"""
        with self._lock:
            group = self._groups.get(group_id)
            if group:
                del self._groups[group_id]
            return group
    
    def cleanup_expired(self) -> int:
        """清理过期的分组，返回清理数量"""
        current_time = time.time()
        expired_count = 0
        
        with self._lock:
            expired_ids = [
                gid for gid, group in self._groups.items()
                if current_time - group.created_time > GROUP_EXPIRE_TIME
            ]
            
            for gid in expired_ids:
                del self._groups[gid]
                expired_count += 1
        
        return expired_count
    
    def get_group_count(self) -> int:
        """获取当前分组数量"""
        with self._lock:
            return len(self._groups)


# 全局单例
group_manager = UploadGroupManager()
