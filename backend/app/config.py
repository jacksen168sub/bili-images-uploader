"""
配置管理模块
- INI文件读写
- Token生成与验证（SHA-256）
- AES加密解密敏感配置
"""

import os
import secrets
import string
import hashlib
import configparser
from pathlib import Path
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
from base64 import b64encode, b64decode


class ConfigManager:
    """配置管理器"""
    
    CONFIG_FILE = "config.ini"
    TOKEN_LENGTH = 32
    
    def __init__(self, config_dir: str = None):
        if config_dir:
            self.config_path = Path(config_dir) / self.CONFIG_FILE
        else:
            # 默认在项目根目录的config文件夹下
            self.config_path = Path(__file__).parent.parent.parent / "config" / self.CONFIG_FILE
        
        self.config = configparser.ConfigParser()
        self._ensure_config()
    
    def _ensure_config(self):
        """确保配置文件存在，不存在则创建并生成Token"""
        if not self.config_path.exists():
            self._create_default_config()
        else:
            self.config.read(self.config_path, encoding='utf-8')
    
    def _generate_token(self) -> str:
        """生成32位随机Token（大小写字母+数字）"""
        chars = string.ascii_letters + string.digits
        return ''.join(secrets.choice(chars) for _ in range(self.TOKEN_LENGTH))
    
    def _hash_token(self, token: str) -> str:
        """计算Token的SHA-256哈希值"""
        return hashlib.sha256(token.encode('utf-8')).hexdigest()
    
    def _create_default_config(self):
        """创建默认配置文件"""
        # 生成随机Token
        token = self._generate_token()
        token_hash = self._hash_token(token)
        
        # 输出到控制台
        print("\n" + "=" * 50)
        print("首次启动，已生成访问令牌：")
        print(f"Token: {token}")
        print("=" * 50 + "\n")
        
        # 创建配置
        self.config['auth'] = {
            'token_hash': token_hash
        }
        self.config['bili'] = {
            'csrf': '',
            'sessdata': '',
            'oid': ''
        }
        
        # 保存配置文件
        self._save_config()
    
    def _save_config(self):
        """保存配置文件"""
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.config_path, 'w', encoding='utf-8') as f:
            self.config.write(f)
    
    def verify_token(self, token: str) -> bool:
        """验证Token是否正确"""
        stored_hash = self.config.get('auth', 'token_hash', fallback='')
        if not stored_hash:
            return False
        return self._hash_token(token) == stored_hash
    
    def _get_aes_key(self, token: str) -> bytes:
        """从Token派生AES密钥（32字节）"""
        return hashlib.sha256(token.encode('utf-8')).digest()
    
    def _encrypt_value(self, value: str, token: str) -> str:
        """使用AES加密值"""
        if not value:
            return ''
        key = self._get_aes_key(token)
        cipher = AES.new(key, AES.MODE_CBC)
        ct_bytes = cipher.encrypt(pad(value.encode('utf-8'), AES.block_size))
        # IV + 密文，然后base64编码
        result = b64encode(cipher.iv + ct_bytes).decode('utf-8')
        return result
    
    def _decrypt_value(self, encrypted: str, token: str) -> str:
        """使用AES解密值"""
        if not encrypted:
            return ''
        try:
            key = self._get_aes_key(token)
            raw = b64decode(encrypted)
            iv = raw[:16]
            ct = raw[16:]
            cipher = AES.new(key, AES.MODE_CBC, iv)
            pt = unpad(cipher.decrypt(ct), AES.block_size)
            return pt.decode('utf-8')
        except Exception:
            return ''
    
    def get_bili_config(self, token: str) -> dict:
        """获取解密后的B站配置"""
        self.config.read(self.config_path, encoding='utf-8')
        return {
            'csrf': self._decrypt_value(self.config.get('bili', 'csrf', fallback=''), token),
            'sessdata': self._decrypt_value(self.config.get('bili', 'sessdata', fallback=''), token),
            'oid': self._decrypt_value(self.config.get('bili', 'oid', fallback=''), token)
        }
    
    def set_bili_config(self, csrf: str, sessdata: str, oid: str, token: str):
        """保存加密后的B站配置"""
        self.config.read(self.config_path, encoding='utf-8')
        self.config.set('bili', 'csrf', self._encrypt_value(csrf, token))
        self.config.set('bili', 'sessdata', self._encrypt_value(sessdata, token))
        self.config.set('bili', 'oid', self._encrypt_value(oid, token))
        self._save_config()
    
    def has_bili_config(self, token: str) -> bool:
        """检查B站配置是否完整"""
        config = self.get_bili_config(token)
        return all([config['csrf'], config['sessdata'], config['oid']])


# 全局配置实例
config_manager = ConfigManager()
