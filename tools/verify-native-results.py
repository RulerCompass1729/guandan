"""Compare saved native UI result text with each authoritative room result."""
import argparse
import json
from pathlib import Path
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument('runs', nargs='+', type=Path)
parser.add_argument('--require-five', action='store_true')
args = parser.parse_args()
package = 'io.github.rulercompass1729.guandan'
cases, apks, viewers = set(), set(), 0
for run in args.runs:
    summary = json.loads((run / 'summary.json').read_text())
    apks.add(summary['apkSha256'])
    shots = Path.home() / 'Pictures/neomind-dogfood' / summary['startedAt'][:7] / ('guandan-native-' + summary['run'])
    for record in summary['modes']:
        key = (record['humans'], record['variant'])
        assert key not in cases, ('duplicate mode must not inflate the result', key)
        cases.add(key)
        label = f"mode-{key[0]}-{key[1]}"
        audit = json.loads((run / (label + '.json')).read_text())['audit']
        room, result = audit['room'], audit['room']['result']
        for index, seat in enumerate(record['humanSeats']):
            root = ET.parse(shots / (chr(65 + index) + '-' + label + '-result.xml')).getroot()
            texts = {node.get('text', '') for node in root.iter()}
            headers = [node.get('text') for node in root.iter() if node.get('resource-id') == package + ':id/header_code']
            assert headers == [room['code']], (label, seat, 'wrong native room')
            assert f"第{room['round']}副结束" in texts, (label, seat, 'wrong native round')
            for place, player in enumerate(result['order']):
                title = '双下' if result['doubleDown'] and place >= 2 else ['头游', '二游', '三游', '末游'][place]
                assert title + '　' + room['seats'][player]['name'] in texts, (label, seat, place, 'native ranking differs')
            side = '你们' if result['winner'] == seat % 2 else '另一队'
            assert side + '升' + str(result['upgrade']) + '级' in texts, (label, seat, 'native team outcome differs')
            viewers += 1
    if summary.get('fullMatch'):
        last = summary['fullMatch']['rounds'][-1]['result']
        assert last['matchWinner'] == summary['fullMatch']['winner']
        for seat in range(4):
            root = ET.parse(shots / (chr(65 + seat) + '-over-A.xml')).getroot()
            texts = {node.get('text', '') for node in root.iter()}
            assert '本场结束 · 已过 A' in texts or '本场结束 · 已过A' in texts
            side = '你们' if last['winner'] == seat % 2 else '另一队'
            assert side + '过A获胜' in texts, ('over-A', seat, 'native team outcome differs')
            viewers += 1
assert len(apks) == 1, 'combine only evidence from the exact same APK'
if args.require_five:
    assert cases == {(1, 'standard'), (2, 'standard'), (3, 'standard'), (4, 'standard'), (2, 'same-team')}
print(json.dumps({'passed': True, 'uniqueModes': len(cases), 'nativeResultViews': viewers, 'apkSha256': next(iter(apks))}))
