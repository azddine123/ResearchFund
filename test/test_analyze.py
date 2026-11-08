import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from analyze import analyze
class AnalyzerTests(unittest.TestCase):
 def row(self,amount=100,t=0,address='0xabc'):return dict(campaign=0,address=address,amount_wei=str(amount),timestamp=t,tx=f'tx{t}')
 def test_empty(self):self.assertEqual(analyze([]),[])
 def test_no_false_alarm_on_two(self):self.assertEqual(analyze([self.row(t=0),self.row(t=400)]),[])
 def test_repeat_and_burst(self):self.assertEqual({a['rule'] for a in analyze([self.row(t=i) for i in range(5)])},{'REPETITION','BURST'})
 def test_outlier(self):self.assertIn('LARGE_AMOUNT',{a['rule'] for a in analyze([self.row(t=i*1000,amount=a) for i,a in enumerate([100,120,90,110,10000])])})
 def test_separate_campaigns(self):
  rows=[self.row() for _ in range(4)]
  for i,r in enumerate(rows):r['campaign']=i
  self.assertEqual(analyze(rows),[])
if __name__=='__main__':unittest.main()
