"""运营稳定性回归测试；仅使用本地桩，不访问外部服务。"""
from __future__ import annotations

import asyncio
import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def silent_logger():
    return types.SimpleNamespace(
        debug=lambda *args, **kwargs: None,
        info=lambda *args, **kwargs: None,
        warning=lambda *args, **kwargs: None,
        error=lambda *args, **kwargs: None,
    )


def load_module(name: str, relative_path: str, stubs: dict[str, types.ModuleType]):
    with patch.dict(sys.modules, stubs):
        spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"无法加载测试模块: {relative_path}")
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
    return module


class InsufficientBalanceTests(unittest.TestCase):
    def setUp(self):
        aiohttp = types.ModuleType("aiohttp")
        aiohttp.ClientSession = object
        aiohttp.ClientTimeout = lambda total: total
        aiohttp.ClientError = Exception
        utils = types.ModuleType("common.utils.xianyu_utils")
        utils.generate_sign = lambda *args: "sign"
        utils.trans_cookies = lambda value: {}
        self.module = load_module(
            "im_token_api_under_test",
            "common/services/im_token_api.py",
            {"aiohttp": aiohttp, "common.utils.xianyu_utils": utils},
        )

    def test_detects_balance_errors_without_matching_other_failures(self):
        self.assertTrue(self.module.is_insufficient_balance_response({
            "success": False,
            "message": "账户余额不足，本次调用需要 ¥0.0300",
        }))
        self.assertTrue(self.module.is_insufficient_balance_response({
            "ret": ["FAIL::账户余额不足"],
        }))
        self.assertFalse(self.module.is_insufficient_balance_response({
            "message": "网络超时",
        }))
        self.assertFalse(self.module.is_insufficient_balance_response(None))


class SellerSummaryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        test_case = self
        aiohttp = types.ModuleType("aiohttp")
        aiohttp.ClientError = Exception
        aiohttp.ClientTimeout = lambda total: total

        class FakeResponse:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return None

            async def json(self, content_type=None):
                return test_case.payload

        class FakeSession:
            calls = 0

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return None

            def post(self, *args, **kwargs):
                type(self).calls += 1
                return FakeResponse()

        aiohttp.ClientSession = FakeSession
        self.session_class = FakeSession
        loguru = types.ModuleType("loguru")
        loguru.logger = silent_logger()
        utils = types.ModuleType("common.utils.xianyu_utils")
        utils.generate_sign = lambda *args: "sign"
        utils.trans_cookies = lambda value: {"_m_h5_tk": "token_suffix"}
        self.module = load_module(
            "data_analysis_service_under_test",
            "backend-web/app/services/data_analysis_service.py",
            {
                "aiohttp": aiohttp,
                "loguru": loguru,
                "common.utils.xianyu_utils": utils,
            },
        )

    async def test_permission_denied_returns_without_retry(self):
        self.session_class.calls = 0
        self.payload = {"ret": ["FAIL_BIZ_IDLE_USER_UNAUTHORIZED::无权限访问"]}
        with patch("asyncio.sleep", new=AsyncMock()) as sleep:
            result = await self.module.fetch_seller_summary("unb=1")
        self.assertFalse(result["success"])
        self.assertEqual(result["error_code"], "PERMISSION_DENIED")
        self.assertFalse(result["retryable"])
        self.assertIn("闲鱼商家后台", result["message"])
        self.assertEqual(self.session_class.calls, 1)
        sleep.assert_not_awaited()

    async def test_other_business_errors_keep_existing_retry_policy(self):
        self.session_class.calls = 0
        self.payload = {"ret": ["FAIL_BIZ_OTHER::临时失败"]}
        with patch("asyncio.sleep", new=AsyncMock()):
            result = await self.module.fetch_seller_summary("unb=1")
        self.assertFalse(result["success"])
        self.assertEqual(self.session_class.calls, self.module.MAX_RETRY)
        self.assertIn("已重试", result["message"])


class TokenCircuitTests(unittest.IsolatedAsyncioTestCase):
    async def test_main_exits_without_disabling_account(self):
        aiohttp = types.ModuleType("aiohttp")
        aiohttp.ClientSession = object
        loguru = types.ModuleType("loguru")
        loguru.logger = silent_logger()
        utils = types.ModuleType("common.utils.xianyu_utils")
        utils.trans_cookies = lambda value: {}
        utils.generate_device_id = lambda value: "device"
        utils.generate_mid = lambda: "mid"
        time_utils = types.ModuleType("common.utils.time_utils")
        time_utils.get_beijing_now_naive = lambda: None
        text_utils = types.ModuleType("common.utils.text_utils")
        text_utils.safe_str = str

        class ConnectionState:
            CLOSED = "closed"
            CONNECTING = "connecting"
            CONNECTED = "connected"
            RECONNECTING = "reconnecting"

        connection = types.ModuleType("app.services.xianyu.connection_manager")
        connection.ConnectionState = ConnectionState
        connection.ConnectionManager = object
        token = types.ModuleType("app.services.xianyu.token_manager")
        token.TokenManager = object
        module = load_module(
            "xianyu_async_under_test",
            "websocket/app/services/xianyu/xianyu_async.py",
            {
                "aiohttp": aiohttp,
                "loguru": loguru,
                "common.utils.xianyu_utils": utils,
                "common.utils.time_utils": time_utils,
                "common.utils.text_utils": text_utils,
                "app.services.xianyu.connection_manager": connection,
                "app.services.xianyu.token_manager": token,
            },
        )

        client = module.XianyuAsync.__new__(module.XianyuAsync)
        client.cookie_id = "local-test-account"
        client.cookies_str = "unb=1"
        client.current_token = None
        client.last_token_refresh_status = ""
        client.proxy_config = {"proxy_type": "none"}
        client.session = None
        client.create_session = AsyncMock()
        client.close_session = AsyncMock()
        client._load_runtime_account_state = AsyncMock(return_value=None)
        client._load_system_proxy_settings = AsyncMock(return_value=None)
        client._fetch_system_proxy_endpoint = AsyncMock(return_value=None)
        client._get_proxy_url = lambda: None
        client._cancel_background_tasks = AsyncMock()
        client._unregister_instance = lambda: None
        states = []

        class DummyConnectionManager:
            def set_connection_state(self, state, reason):
                states.append((state, reason))

        client.connection_manager = DummyConnectionManager()
        refresh_calls = 0

        async def failed_refresh():
            nonlocal refresh_calls
            refresh_calls += 1
            client.current_token = None
            client.last_token_refresh_status = "failed_insufficient_balance"
            client._token_balance_circuit_open = True

        client.refresh_token = failed_refresh
        client._interruptible_sleep = AsyncMock(
            side_effect=AssertionError("余额熔断后不应进入重试等待")
        )
        await client.main()

        self.assertEqual(refresh_calls, 1)
        client._interruptible_sleep.assert_not_awaited()
        self.assertNotIn("status", vars(client), "测试不应写入账号状态")
        self.assertEqual(states[-1][0], ConnectionState.CLOSED)
        self.assertIn("余额不足", states[-1][1])
        self.assertIn("人工处理余额后重新连接", states[-1][1])


if __name__ == "__main__":
    unittest.main()
