"""
依赖注入模块
- Token验证
- 配置获取
"""

from fastapi import Header, HTTPException, status
from typing import Optional

from .config import config_manager


async def verify_token(authorization: Optional[str] = Header(None)) -> str:
    """
    验证Token
    
    从Authorization header获取Token并验证
    
    Returns:
        token: 验证通过的原始Token
    
    Raises:
        HTTPException: Token无效或缺失
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未提供访问令牌"
        )
    
    # 支持 Bearer token 格式
    if authorization.startswith("Bearer "):
        token = authorization[7:]
    else:
        token = authorization
    
    if not config_manager.verify_token(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="访问令牌无效"
        )
    
    return token


def get_token_from_header(authorization: Optional[str]) -> Optional[str]:
    """从header提取token"""
    if not authorization:
        return None
    if authorization.startswith("Bearer "):
        return authorization[7:]
    return authorization
