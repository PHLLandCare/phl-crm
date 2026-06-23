#!/usr/bin/env python3
"""
PHL Land Care — Warehouse Scanner Station
Reads employee QR badges from Zebra DS2278 via USB HID
POSTs to Supabase scanner-clockin edge function
Run: python3 phl_scanner.py
Install deps: pip3 install requests
Auto-start:   sudo systemctl enable phl-scanner
"""

import sys, time, re, signal, logging, requests
from datetime import datetime
from urllib.parse import urlparse, parse_qs

# ── CONFIG ─────────────────────────────────────────────────────────────────────
SUPABASE_URL   = "https://gmblbltckwipghqutkhw.supabase.co"
EDGE_FUNCTION  = f"{SUPABASE_URL}/functions/v1/scanner-clockin"
SCANNER_SECRET = "phl-scanner-2024"   # must match SCANNER_SECRET env var in edge function
STATION_ID     = "warehouse-main"     # change to "warehouse-dock" for 2nd station
TIMEOUT_SECS   = 8
DEBOUNCE_SECS  = 3.0                  # ignore same badge re-scanned within this window

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("/home/pi/phl_scanner.log"),
        logging.StreamHandler(sys.stdout),
    ]
)
log = logging.getLogger("phl-scanner")

last_scan_id, last_scan_time = None, 0.0

# ── PARSE QR ───────────────────────────────────────────────────────────────────
def extract_employee_id(raw):
    raw = raw.strip()
    if not raw:
        return None
    # Full URL with hash fragment: .../phl-crm/#/clockin?emp=PHL-0001
    if raw.startswith("http"):
        if "#" in raw:
            fragment = raw.split("#", 1)[1]
            if "?" in fragment:
                qs = fragment.split("?", 1)[1]
                emp = parse_qs(qs).get("emp", [None])[0]
                if emp:
                    return emp.upper()
        try:
            emp = parse_qs(urlparse(raw).query).get("emp", [None])[0]
            if emp:
                return emp.upper()
        except Exception:
            pass
    # Bare ID: PHL-0001 or PHL0001
    m = re.match(r"^(PHL-?\d+)$", raw.upper().strip())
    if m:
        emp = m.group(1)
        return emp if "-" in emp else emp[:3] + "-" + emp[3:]
    log.warning(f"Could not parse employee ID from: {repr(raw)}")
    return None

# ── CLOCK IN/OUT ────────────────────────────────────────────────────────────────
def clock_in_out(employee_id):
    try:
        resp = requests.post(
            EDGE_FUNCTION,
            json={"employee_id": employee_id, "station": STATION_ID, "secret": SCANNER_SECRET},
            headers={"x-scanner-secret": SCANNER_SECRET},
            timeout=TIMEOUT_SECS,
        )
        data = resp.json()
        if data.get("ok"):
            action = data.get("action", "?")
            name   = data.get("name", employee_id)
            t      = datetime.now().strftime("%H:%M:%S")
            log.info(f"OK  {name} ({employee_id}) clocked {action.upper()} at {t}")
            print(f"\n{'='*40}\n  {'CLOCKED IN' if action=='in' else 'CLOCKED OUT'}\n  {name}\n  {t}\n{'='*40}\n")
        else:
            log.error(f"FAIL  {employee_id}: {data.get('error','Unknown error')}")
    except requests.Timeout:
        log.error(f"TIMEOUT  {employee_id} — check network")
    except requests.ConnectionError:
        log.error(f"NO NETWORK  check WiFi, could not clock in {employee_id}")
    except Exception as e:
        log.error(f"ERROR  {employee_id}: {e}")

# ── DEBOUNCE + DISPATCH ─────────────────────────────────────────────────────────
def handle_scan(raw_scan):
    global last_scan_id, last_scan_time
    emp = extract_employee_id(raw_scan)
    if not emp:
        return
    now = time.monotonic()
    if emp == last_scan_id and (now - last_scan_time) < DEBOUNCE_SECS:
        log.debug(f"Debounced: {emp}")
        return
    last_scan_id, last_scan_time = emp, now
    log.info(f"SCAN  {emp}  raw={repr(raw_scan[:60])}")
    clock_in_out(emp)

# ── MAIN ────────────────────────────────────────────────────────────────────────
def main():
    log.info(f"PHL Scanner starting — station={STATION_ID}")
    log.info(f"Edge function: {EDGE_FUNCTION}")
    log.info("Waiting for scans... (Ctrl+C to stop)\n")
    def shutdown(sig, frame):
        log.info("Scanner stopped.")
        sys.exit(0)
    signal.signal(signal.SIGINT,  shutdown)
    signal.signal(signal.SIGTERM, shutdown)
    # DS2278 USB cradle = USB HID keyboard → sends keystrokes + Enter per scan
    for line in sys.stdin:
        raw = line.strip()
        if raw:
            handle_scan(raw)

if __name__ == "__main__":
    main()
