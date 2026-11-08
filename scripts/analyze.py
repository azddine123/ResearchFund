#!/usr/bin/env python3
"""Heuristiques explicables, sans apprentissage ni accusation de fraude."""
import argparse,json,statistics
from collections import defaultdict,Counter
from pathlib import Path

def analyze(events):
    alerts=[];groups=defaultdict(list)
    for e in events:groups[int(e['campaign'])].append(e)
    for campaign,rows in groups.items():
        rows=sorted(rows,key=lambda x:x['timestamp'])
        counts=Counter((r['address'].lower(),str(r['amount_wei'])) for r in rows)
        for (address,amount),n in counts.items():
            if n>=3:alerts.append(dict(campaign=campaign,rule='REPETITION',level='À examiner',message=f'{n} contributions du même montant depuis une même adresse.',evidence={'address':address,'amount_wei':amount,'count':n}))
        for i,r in enumerate(rows):
            window=[x for x in rows[:i+1] if r['timestamp']-x['timestamp']<=300]
            if len(window)>=5:
                alerts.append(dict(campaign=campaign,rule='BURST',level='À examiner',message=f'{len(window)} contributions en cinq minutes ; un lancement collectif peut expliquer ce pic.',evidence={'start':window[0]['timestamp'],'end':r['timestamp'],'count':len(window)}));break
        amounts=[int(r['amount_wei']) for r in rows]
        if len(amounts)>=5:
            median=statistics.median(amounts)
            for r in rows:
                if int(r['amount_wei'])>5*median:
                    alerts.append(dict(campaign=campaign,rule='LARGE_AMOUNT',level='À examiner',message='Contribution supérieure à cinq fois la médiane de cette campagne.',evidence={'tx':r['tx'],'median_wei':str(median)}))
    return alerts

def main():
    parser=argparse.ArgumentParser();parser.add_argument('input');parser.add_argument('--out',default='frontend/public/anomalies.json');args=parser.parse_args()
    data=json.loads(Path(args.input).read_text());events=data['events']
    report={'method':'Heuristiques déterministes v1','source':{k:v for k,v in data.items() if k!='events'},'event_count':len(events),'alerts':analyze(events),'limitations':['Aucune preuve de fraude ni inférence d’identité.','Pas de détection d’adresses liées sans données externes.','Historique jusqu’au bloc indiqué seulement ; relancer après de nouvelles transactions.','Aucune action automatique sur les fonds.']}
    Path(args.out).parent.mkdir(parents=True,exist_ok=True);Path(args.out).write_text(json.dumps(report,ensure_ascii=False,indent=2));print(f"{len(events)} événements, {len(report['alerts'])} alertes explicables.")
if __name__=='__main__':main()
