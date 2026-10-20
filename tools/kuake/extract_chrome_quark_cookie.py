import os, json, base64, sqlite3, shutil, tempfile, ctypes, ctypes.wintypes, sys
from pathlib import Path

try:
    from Cryptodome.Cipher import AES
except ImportError:
    try:
        from Crypto.Cipher import AES
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pycryptodome", "-q"])
        from Cryptodome.Cipher import AES


class DATA_BLOB(ctypes.Structure):
    _fields_ = [("cbData", ctypes.wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]


def dpapi_decrypt(encrypted_bytes: bytes) -> bytes:
    blob_in = DATA_BLOB(len(encrypted_bytes), ctypes.create_string_buffer(encrypted_bytes, len(encrypted_bytes)))
    blob_out = DATA_BLOB()
    if not ctypes.windll.crypt32.CryptUnprotectData(
        ctypes.byref(blob_in), None, None, None, None, 0, ctypes.byref(blob_out)
    ):
        raise OSError("CryptUnprotectData failed")
    try:
        return ctypes.string_at(blob_out.pbData, blob_out.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(blob_out.pbData)


userdata = Path(os.environ["LOCALAPPDATA"]) / "Google" / "Chrome" / "User Data"
local_state = json.loads((userdata / "Local State").read_text(encoding="utf-8"))
enc_key = base64.b64decode(local_state["os_crypt"]["encrypted_key"])[5:]
key = dpapi_decrypt(enc_key)

cookie_src = userdata / "Default" / "Network" / "Cookies"
tmpdir = Path(tempfile.mkdtemp())
cookie_copy = tmpdir / "Cookies"
shutil.copy2(cookie_src, cookie_copy)

conn = sqlite3.connect(cookie_copy)
rows = conn.execute(
    """
    SELECT host_key, name, encrypted_value, value
    FROM cookies
    WHERE host_key LIKE '%quark%'
       OR host_key LIKE '%uc.cn%'
       OR name IN ('__pus','__puus','__kp','__kps','__uid')
    """
).fetchall()
print("rows", len(rows))


def decrypt(ev):
    if not ev:
        return ""
    if isinstance(ev, str):
        ev = ev.encode("utf-8")
    if ev[:3] in (b"v10", b"v11", b"v20"):
        nonce = ev[3:15]
        cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
        return cipher.decrypt_and_verify(ev[15:-16], ev[-16:]).decode("utf-8", errors="replace")
    try:
        return dpapi_decrypt(ev).decode("utf-8", errors="replace")
    except Exception as e:
        return f"<decrypt_fail:{e}>"


cookie_map = {}
for host, name, ev, val in rows:
    plain = val or decrypt(ev)
    print(f"{host}\t{name}\tlen={len(plain)}\tpreview={plain[:48]!r}")
    if plain and not str(plain).startswith("<decrypt"):
        cookie_map[name] = plain

print("HAS_PUS", "__pus" in cookie_map, "HAS_PUUS", "__puus" in cookie_map)
out = Path(r"D:\咸鱼自动化\tools\kuake\.env")
if "__pus" in cookie_map and "__puus" in cookie_map:
    full = "; ".join(f"{k}={v}" for k, v in cookie_map.items())
    out.write_text(f"KUAKE_COOKIE={full}\n", encoding="utf-8")
    print("WROTE", out)
else:
    # also dump all hosts/names for debug
    print("MISSING_REQUIRED_COOKIES names=", sorted(cookie_map.keys()))
conn.close()
