#!/usr/bin/env python3
"""Headless visual + functional test for the Triangulum observatory."""
import sys, time, json
from playwright.sync_api import sync_playwright

URL = 'file:///home/hatch/workspace/stars-observatory/public/index.html'
OUT = '/home/hatch/workspace/stars-observatory/tests/shots'
NIGHT = 1790136000000  # 2026-09-23T04:00:00Z (10pm MDT, dark over Provo)

errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/opt/meta-chromium/chrome',
        args=['--allow-file-access-from-files', '--no-sandbox'])
    pg = browser.new_page(viewport={'width': 1440, 'height': 900})
    pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(getattr(e, 'stack', e))))
    pg.on('console', lambda m: errors.append(f'console-{m.type}: {m.text}') if m.type == 'error' else None)
    pg.goto(URL)
    pg.wait_for_timeout(1500)

    # briefing visible on first run?
    print('briefing visible:', pg.is_visible('#briefing'))
    pg.screenshot(path=f'{OUT}/01-briefing.png')
    pg.click('#btnBegin')
    pg.wait_for_timeout(300)

    # set night, pause time
    pg.evaluate(f'window.TRIANGULUM.setSimMs({NIGHT})')
    pg.evaluate('document.querySelector("#btnPlay").click()')  # pause
    pg.wait_for_timeout(1200)
    pg.screenshot(path=f'{OUT}/02-night-sky.png')

    # select the Summer Triangle: Vega, Altair, Deneb
    names = ['Vega', 'Altair', 'Deneb']
    for n in names:
        ok = pg.evaluate(
            "() => { const T = window.TRIANGULUM, s = T.starByName(" + json.dumps(n) + ");"
            " if (!s || !s.vis) return 'NOT-VISIBLE:' + " + json.dumps(n) + ";"
            " const p = T.toPx(s); T.handleClick(p[0], p[1]);"
            " return 'ok verts=' + T.verts().filter(Boolean).map(v => v.name).join(','); }")
        print(f'select {n}:', ok)
    pg.wait_for_timeout(600)
    pg.screenshot(path=f'{OUT}/03-triangle.png')

    reg = pg.evaluate('window.TRIANGULUM.registry().map(t => ({id: t.id, name: t.name, type: t.angleType + " " + t.sideType, sum: t.angleSum.toFixed(2)}))')
    print('registry:', json.dumps(reg, indent=1))
    print('verdict visible:', pg.is_visible('#verdict'))
    print('standing:', pg.inner_text('#standingText')[:80])

    # registry tab
    pg.click('[data-tab="registry"]')
    pg.wait_for_timeout(300)
    pg.screenshot(path=f'{OUT}/04-registry.png')

    # export png (smoke: no throw)
    pg.evaluate('window.TRIANGULUM.clearVerts()')
    pg.click('[data-tab="instrument"]')
    print('errors:', len(errors))
    for e in errors[:10]:
        print(' ', e[:200])
    browser.close()

print('DONE')
