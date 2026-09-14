# -*- coding: utf-8 -*-
# out/data.json 구조 점검 — 빌드 전에 빠진 계열이 없는지 본다
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, 'out', 'data.json'), encoding='utf-8'))
b = d['bok']; e = d['exports']
print('bok keys', len(b), 'asOf', b['asOf'])
for k in ['global', 'domesticDaily', 'ktb', 'kospi', 'fx', 'credit', 'cpiMonthly', 'houseLoan', 'fcstGrowth',
          'policyRates', 'fedExp', 'capex', 'levEtf', 'inflPath', 'gdpQ', 'itExport', 'investorNet']:
    v = b[k]
    print(' ', k, len(v['dates']), v['dates'][:1] + v['dates'][-1:], v['cols'], v['units'])
print('dots', b['dots'])
print('baseRateSteps', b['baseRateSteps'][-4:])
print('months', e['months'][:2], e['months'][-2:], 'latestActual', e['latestActual'], 'asOf', e['asOf'])
for c in e['categories']:
    print(' ', c['name'], len(c['items']), c['total'][-2:], c['yoy'][-2:], [i['name'] for i in c['items']][:4])
print('momentum', len(e['momentum']), e['momentum'][2])
print('estimate', len(e['estimate']['rows']), e['estimate']['rows'][0])
print('estimate meta', list(e['estimate']['meta'].items())[:4])
print('official', e['official'][:2])
print('country items', len(e['country']['items']), list(e['country']['items'])[:6], e['country']['months'])
print('meta', e['meta'])
