"""Create/start only this project's clean AVDs. No existing device data is copied."""
from pathlib import Path
import json
import os
import subprocess
import sys
import socket
import shlex
import signal
import time

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / '.local' / 'android'
SDK = Path(os.environ.get('ANDROID_SDK_ROOT', str(Path.home() / 'Library/Android/sdk')))
AVDS = LOCAL / 'avd'

def ensure_ports_available(ports):
    """Refuse occupied console/ADB ports before launching anything."""
    reservations = []
    try:
        for port in ports:
            sock = socket.socket()
            reservations.append(sock)
            try:
                sock.bind(('127.0.0.1', port))
            except OSError as error:
                raise RuntimeError(f'Test port {port} is occupied; no emulator was launched.') from error
    finally:
        for sock in reservations:
            sock.close()

def ownership_matches(item, actual_name, command, opened_paths):
    """A serial alone never proves ownership, even if a ledger contains it."""
    name = item.get('name', '')
    if name not in ['Guandan_' + letter for letter in 'ABCD'] or actual_name != name:
        return False
    expected = (AVDS / (name + '.avd')).resolve()
    if Path(item.get('data_dir', '')).resolve() != expected:
        return False
    try:
        args = shlex.split(command)
        binary = Path(args[0]).resolve()
        if not binary.is_relative_to((SDK / 'emulator').resolve()):
            return False
        if args[args.index('-avd') + 1] != name:
            return False
        if '-datadir' in args:
            return Path(args[args.index('-datadir') + 1]).resolve() == expected
    except (ValueError, IndexError):
        return False
    # Compatibility with this project's earliest launch: prove its open disk.
    return any(Path(path).is_relative_to(expected) for path in opened_paths)

def check_owned(item):
    try:
        result = subprocess.run([str(SDK / 'platform-tools/adb'), '-s', item['serial'], 'emu', 'avd', 'name'], capture_output=True, text=True, timeout=4)
        name = result.stdout.splitlines()[0].strip() if result.returncode == 0 else ''
        if name != item.get('name'):
            return False
        pid = int(item['pid'])
        command = subprocess.run(['ps', '-p', str(pid), '-o', 'command='], capture_output=True, text=True, timeout=4).stdout.strip()
        opened = subprocess.run(['lsof', '-p', str(pid), '-Fn'], capture_output=True, text=True, timeout=5).stdout.splitlines()
        return ownership_matches(item, name, command, [line[1:] for line in opened if line.startswith('n')])
    except (OSError, ValueError, IndexError, subprocess.TimeoutExpired):
        return False

def start():
    image = 'system-images/android-33/google_apis/arm64-v8a/'
    if not (SDK / image).is_dir():
        raise SystemExit('Install the Android API 33 ARM64 Google APIs image first; existing AVDs are never modified.')
    AVDS.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, ANDROID_AVD_HOME=str(AVDS), ANDROID_SDK_ROOT=str(SDK))
    records = []
    previous = LOCAL / 'devices.json'
    if previous.exists():
        raise SystemExit('devices.json already exists. Inspect/stop the project devices before starting a new set.')
    ensure_ports_available(range(5554, 5562))
    for index, letter in enumerate('ABCD'):
        name = 'Guandan_' + letter
        path = AVDS / (name + '.avd')
        path.mkdir(exist_ok=True)
        config = {
            'AvdId': name, 'avd.ini.displayname': name, 'avd.ini.encoding': 'UTF-8',
            'abi.type': 'arm64-v8a', 'hw.cpu.arch': 'arm64', 'hw.cpu.ncore': '2',
            'hw.ramSize': '2048', 'hw.lcd.width': '1080', 'hw.lcd.height': '2340',
            'hw.lcd.density': '440', 'hw.keyboard': 'yes', 'hw.gpu.enabled': 'yes',
            'hw.gpu.mode': 'auto', 'hw.audioInput': 'no', 'hw.audioOutput': 'no',
            'hw.camera.back': 'none', 'hw.camera.front': 'none',
            'hw.device.name': 'guandan_test_phone', 'hw.device.manufacturer': 'Generic',
            'image.sysdir.1': image, 'tag.id': 'google_apis', 'tag.display': 'Google APIs',
            'disk.dataPartition.size': '4G', 'showDeviceFrame': 'no',
            'fastboot.forceColdBoot': 'yes', 'fastboot.forceFastBoot': 'no',
        }
        (path / 'config.ini').write_text(''.join(f'{k}={v}\n' for k, v in config.items()))
        (AVDS / (name + '.ini')).write_text(f'avd.ini.encoding=UTF-8\npath={path}\ntarget=android-33\n')
        port = 5554 + index * 2
        log = LOCAL / (letter + '.log')
        with log.open('w') as output:
            process = subprocess.Popen([str(SDK / 'emulator/emulator'), '-avd', name,
                '-port', str(port), '-datadir', str(path), '-no-window', '-no-audio', '-no-boot-anim',
                '-no-snapshot', '-no-metrics', '-gpu', 'swiftshader_indirect',
                '-memory', '2048', '-cores', '2'], env=env, stdout=output,
                stderr=subprocess.STDOUT, start_new_session=True)
        records.append({'name': name, 'serial': f'emulator-{port}', 'pid': process.pid, 'log': str(log), 'data_dir': str(path)})
        previous.write_text(json.dumps(records, indent=2))
    deadline = time.monotonic() + 45
    verified = []
    while time.monotonic() < deadline:
        verified = [check_owned(item) for item in records]
        if all(verified):
            break
        time.sleep(1)
    if not all(verified):
        raise SystemExit('Startup ownership was not confirmed. Inspect project logs; no foreign serial will be stopped.')
    print(json.dumps({'started': len(records), 'ownership_verified': True, 'serials': [r['serial'] for r in records]}))

def status():
    records = json.loads((LOCAL / 'devices.json').read_text())
    for item in records:
        p = subprocess.run([str(SDK / 'platform-tools/adb'), '-s', item['serial'], 'shell', 'getprop', 'sys.boot_completed'], capture_output=True, text=True, timeout=8)
        print(json.dumps({'name': item['name'], 'serial': item['serial'], 'boot_completed': p.stdout.strip() == '1', 'error': p.stderr.strip()}))

def stop():
    path = LOCAL / 'devices.json'
    if not path.exists():
        return
    records = json.loads(path.read_text())
    stopped, skipped = [], []
    for item in records:
        if not check_owned(item):
            skipped.append(item['serial'])
            continue
        # Signal the verified owned PID, never a possibly reused emulator serial.
        try:
            os.kill(int(item['pid']), signal.SIGTERM)
            stopped.append(item['serial'])
        except ProcessLookupError:
            skipped.append(item['serial'])
    print(json.dumps({'stop_requested': stopped, 'ownership_mismatch_skipped': skipped}))
    if skipped:
        raise SystemExit('Ownership mismatch: unverified devices were left untouched. Inspect the ledger before restarting.')
    path.rename(LOCAL / 'devices.stopped.json')

if __name__ == '__main__':
    {'start': start, 'status': status, 'stop': stop}[sys.argv[1] if len(sys.argv) > 1 else 'status']()
