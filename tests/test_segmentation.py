"""Regression: ink gaps must stay repaired, real broad uncoloured enclaves remain."""
import importlib.util
from pathlib import Path
import numpy as np
spec=importlib.util.spec_from_file_location('overview',Path(__file__).resolve().parents[1]/'scripts/refine-overview.py')
overview=importlib.util.module_from_spec(spec);spec.loader.exec_module(overview)
mask=np.zeros((80,100),np.uint8);mask[5:75,5:95]=255
mask[20:22,20:60]=0 # narrow ink/river interruption
mask[40:60,40:60]=0 # real broad enclave
closed=overview.close_print_gaps(mask)
assert closed[20:22,20:60].min()==255,'printed gap was re-cut'
assert closed[45:55,45:55].max()==0,'broad uncoloured enclave must remain'
assert closed[:4,:].max()==0,'do not manufacture exterior coverage'
print('Segmentation regression passed')
