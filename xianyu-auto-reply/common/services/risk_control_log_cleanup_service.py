"""
风控日志启动清理服务。

功能：
1. WebSocket 服务启动时结束上一次进程遗留的处理中日志
2. 保留历史数据，并记录服务重启导致任务中断的具体原因
3. 数据库操作失败时自动重试
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import update

from common.db.session import async_session_maker
from common.models.risk_control_log import XYRiskControlLog
from common.utils.time_utils import get_beijing_now_naive


WEBSOCKET_RESTART_RESULT = "WebSocket服务重启，原待处理风控任务已中断"
WEBSOCKET_RESTART_ERROR = "任务处理期间WebSocket服务发生重启，无法继续执行"


@dataclass(frozen=True, slots=True)
class RiskControlLogCleanupResult:
    """风控日志启动清理结果。"""

    success: bool
    updated_count: int = 0
    message: str = ""


async def fail_processing_risk_control_logs_on_restart(
    *,
    max_attempts: int = 3,
    retry_delay_seconds: float = 1.0,
) -> RiskControlLogCleanupResult:
    """将所有处理中风控日志标记为服务重启失败。

    Args:
        max_attempts: 数据库写入最大尝试次数。
        retry_delay_seconds: 相邻重试之间的等待秒数。
    Returns:
        成功时返回实际更新条数；重试耗尽后返回具体错误。
    """
    attempts = max(1, int(max_attempts))
    checked_at = get_beijing_now_naive()
    last_error = ""

    for attempt in range(1, attempts + 1):
        try:
            async with async_session_maker() as session:
                update_result = await session.execute(
                    update(XYRiskControlLog)
                    .where(XYRiskControlLog.processing_status == "processing")
                    .values(
                        processing_status="failed",
                        processing_result=WEBSOCKET_RESTART_RESULT,
                        error_message=WEBSOCKET_RESTART_ERROR,
                        updated_at=checked_at,
                    )
                )
                await session.commit()
                updated_count = int(update_result.rowcount or 0)
                return RiskControlLogCleanupResult(
                    True,
                    updated_count=updated_count,
                    message=(
                        f"已将 {updated_count} 条待处理风控日志标记为失败"
                        if updated_count
                        else "没有需要结束的待处理风控日志"
                    ),
                )
        except Exception as exc:
            last_error = f"{type(exc).__name__}: {exc}"
            if attempt < attempts:
                await asyncio.sleep(max(0.0, retry_delay_seconds))

    return RiskControlLogCleanupResult(
        False,
        message=f"待处理风控日志清理失败，已重试{attempts}次：{last_error}",
    )


async def fail_stale_processing_risk_control_logs(
    *,
    max_age_seconds: int = 300,
    max_attempts: int = 3,
    retry_delay_seconds: float = 1.0,
) -> RiskControlLogCleanupResult:
    """结束超过最大处理时长的风控任务，避免单次浏览器卡死永久阻塞账号。"""
    attempts = max(1, int(max_attempts))
    checked_at = get_beijing_now_naive()
    cutoff = checked_at - timedelta(seconds=max(1, int(max_age_seconds)))
    last_error = ""

    for attempt in range(1, attempts + 1):
        try:
            async with async_session_maker() as session:
                update_result = await session.execute(
                    update(XYRiskControlLog)
                    .where(
                        XYRiskControlLog.processing_status == "processing",
                        XYRiskControlLog.updated_at < cutoff,
                    )
                    .values(
                        processing_status="failed",
                        processing_result=(
                            f"风控任务超过 {max_age_seconds} 秒未完成，已由定时清理终止"
                        ),
                        error_message="风控任务超时，等待下一次 Token 刷新重试",
                        updated_at=checked_at,
                    )
                )
                await session.commit()
                updated_count = int(update_result.rowcount or 0)
                return RiskControlLogCleanupResult(
                    True,
                    updated_count=updated_count,
                    message=(
                        f"已终止 {updated_count} 条超时风控任务"
                        if updated_count
                        else "没有超时的待处理风控任务"
                    ),
                )
        except Exception as exc:
            last_error = f"{type(exc).__name__}: {exc}"
            if attempt < attempts:
                await asyncio.sleep(max(0.0, retry_delay_seconds))

    return RiskControlLogCleanupResult(
        False,
        message=f"超时风控任务清理失败，已重试{attempts}次：{last_error}",
    )


async def run_stale_risk_control_log_cleanup(
    *,
    interval_seconds: int = 60,
    max_age_seconds: int = 300,
) -> None:
    """定期清理超时风控任务；由服务生命周期创建并在退出时取消。"""
    while True:
        await asyncio.sleep(max(1, int(interval_seconds)))
        result = await fail_stale_processing_risk_control_logs(
            max_age_seconds=max_age_seconds
        )
        if not result.success:
            from loguru import logger
            logger.error(result.message)
        elif result.updated_count:
            from loguru import logger
            logger.warning(result.message)
