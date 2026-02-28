"""
数据库模块
- SQLite存储上传历史记录
"""

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any


class Database:
    """SQLite数据库管理"""
    
    DB_FILE = "history.db"
    
    def __init__(self, db_dir: str = None):
        if db_dir:
            self.db_path = Path(db_dir) / self.DB_FILE
        else:
            # 默认在项目根目录的data文件夹下
            self.db_path = Path(__file__).parent.parent.parent / "data" / self.DB_FILE
        
        self._init_db()
    
    def _get_connection(self) -> sqlite3.Connection:
        """获取数据库连接"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn
    
    def _init_db(self):
        """初始化数据库表"""
        # 确保目录存在
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS upload_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                http_url TEXT DEFAULT '',
                https_url TEXT DEFAULT '',
                remote_filename TEXT DEFAULT '',
                remote_name_without_ext TEXT DEFAULT '',
                file_size INTEGER DEFAULT 0,
                upload_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'success',
                error_msg TEXT DEFAULT ''
            )
        ''')
        
        # 检查是否需要添加新列（兼容旧数据库）
        cursor.execute("PRAGMA table_info(upload_history)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'http_url' not in columns:
            cursor.execute('ALTER TABLE upload_history ADD COLUMN http_url TEXT DEFAULT ""')
        if 'https_url' not in columns:
            cursor.execute('ALTER TABLE upload_history ADD COLUMN https_url TEXT DEFAULT ""')
        if 'remote_filename' not in columns:
            cursor.execute('ALTER TABLE upload_history ADD COLUMN remote_filename TEXT DEFAULT ""')
        if 'remote_name_without_ext' not in columns:
            cursor.execute('ALTER TABLE upload_history ADD COLUMN remote_name_without_ext TEXT DEFAULT ""')
        
        conn.commit()
        conn.close()
    
    def add_record(self, filename: str, http_url: str, https_url: str,
                   remote_filename: str = '', remote_name_without_ext: str = '',
                   file_size: int = 0, status: str = 'success', 
                   error_msg: str = '') -> int:
        """添加上传记录"""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        # 使用本地时间
        local_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        cursor.execute('''
            INSERT INTO upload_history (filename, http_url, https_url, remote_filename, remote_name_without_ext, file_size, upload_time, status, error_msg)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (filename, http_url, https_url, remote_filename, remote_name_without_ext, file_size, local_time, status, error_msg))
        
        record_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return record_id
    
    def get_records(self, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """获取上传记录列表"""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, filename, http_url, https_url, remote_filename, remote_name_without_ext, file_size, upload_time, status, error_msg
            FROM upload_history
            ORDER BY upload_time DESC
            LIMIT ? OFFSET ?
        ''', (limit, offset))
        
        rows = cursor.fetchall()
        conn.close()
        
        return [dict(row) for row in rows]
    
    def get_all_urls(self) -> List[Dict[str, Any]]:
        """获取所有图片URL（用于失效检查）"""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, filename, http_url, https_url, remote_filename, remote_name_without_ext, upload_time
            FROM upload_history
            WHERE status = 'success'
            ORDER BY upload_time DESC
        ''')
        
        rows = cursor.fetchall()
        conn.close()
        
        return [dict(row) for row in rows]
    
    def get_record_by_id(self, record_id: int) -> Optional[Dict[str, Any]]:
        """根据ID获取记录"""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, filename, http_url, https_url, remote_filename, remote_name_without_ext, file_size, upload_time, status, error_msg
            FROM upload_history
            WHERE id = ?
        ''', (record_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        return dict(row) if row else None
    
    def delete_record(self, record_id: int) -> bool:
        """删除记录"""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute('DELETE FROM upload_history WHERE id = ?', (record_id,))
        affected = cursor.rowcount
        
        conn.commit()
        conn.close()
        
        return affected > 0
    
    def get_count(self) -> int:
        """获取记录总数"""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT COUNT(*) FROM upload_history')
        count = cursor.fetchone()[0]
        
        conn.close()
        return count


# 全局数据库实例
db = Database()
