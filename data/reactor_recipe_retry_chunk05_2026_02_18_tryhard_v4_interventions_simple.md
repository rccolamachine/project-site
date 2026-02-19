# Reactor Recipe Search

Generated: 2026-02-19T18:11:55.162Z
Scope: 100 molecules
Found: 7
Coverage: 7%

Settings constraints:
- allowMultipleBonds: true
- sigma/epsilon: defaults (unchanged)
- controls varied: temperature, damping, bondScale, boxHalfSize
- max atoms spawned: 200
- max recipe steps target: 7
- prefer simple recipes: true

Per-molecule recommendation:

`id | name | formula | temperature | damping | bond | box | spawn counts | hitRate | avgHitS`

- mol-0076 | C2HNOS | C2HNOS | T=682K | damp=0.989 | bond=3.23 | box=5.14 | spawn={"S":1,"P":0,"O":1,"N":1,"C":2,"H":1} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 682, D: 0.9890, B: 3.23, V: 5.14
  2. Add C x2, H, N, O, S (random spawn positions).
- mol-0084 | CH3NS isomer 1 | CH3NS | T=686K | damp=0.989 | bond=3.23 | box=5.14 | spawn={"S":1,"P":0,"O":0,"N":1,"C":1,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 686, D: 0.9890, B: 3.23, V: 5.14
  2. Add C, H x3, N, S (random spawn positions).
- mol-0098 | C4H2 isomer 1 | C4H2 | T=924K | damp=0.9914 | bond=4.13 | box=5.39 | spawn={"S":0,"P":0,"O":0,"N":0,"C":4,"H":2} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 924, D: 0.9914, B: 4.13, V: 5.39
  2. Add C x4, H x2 (random spawn positions).
- mol-0100 | C2H2OS isomer 2 | C2H2OS | T=804K | damp=0.9911 | bond=3.78 | box=5.39 | spawn={"S":1,"P":0,"O":1,"N":0,"C":2,"H":2} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 804, D: 0.9911, B: 3.78, V: 5.39
  2. Add C x2, H x2, O, S (random spawn positions).
- mol-0105 | C2H3P isomer 5 | C2H3P | T=806K | damp=0.9911 | bond=3.78 | box=5.39 | spawn={"S":0,"P":1,"O":0,"N":0,"C":2,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 806, D: 0.9911, B: 3.78, V: 5.39
  2. Add C x2, H x3, P (random spawn positions).
- mol-0106 | C4H2 isomer 3 | C4H2 | T=804K | damp=0.9911 | bond=3.78 | box=5.39 | spawn={"S":0,"P":0,"O":0,"N":0,"C":4,"H":2} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 804, D: 0.9911, B: 3.78, V: 5.39
  2. Add C x4, H x2 (random spawn positions).
- mol-0108 | CH2N2O isomer 3 | CH2N2O | T=804K | damp=0.9911 | bond=3.78 | box=5.39 | spawn={"S":0,"P":0,"O":1,"N":2,"C":1,"H":2} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 804, D: 0.9911, B: 3.78, V: 5.39
  2. Add C, H x2, N x2, O (random spawn positions).
- mol-0115 | H2N2O2 isomer 4 | H2N2O2 | T=684K | damp=0.9908 | bond=3.43 | box=5.39 | spawn={"S":0,"P":0,"O":2,"N":2,"C":0,"H":2} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 684, D: 0.9908, B: 3.43, V: 5.39
  2. Add H x2, N x2, O x2 (random spawn positions).
- mol-0116 | C2H3NO isomer 1 | C2H3NO | T=786K | damp=0.9898 | bond=3.66 | box=5.28 | spawn={"S":0,"P":0,"O":1,"N":1,"C":2,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 786, D: 0.9898, B: 3.66, V: 5.28
  2. Add C x2, H x3, N, O (random spawn positions).
- mol-0119 | C3H3P isomer 3 | C3H3P | T=786K | damp=0.9898 | bond=3.66 | box=5.28 | spawn={"S":0,"P":1,"O":0,"N":0,"C":3,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 786, D: 0.9898, B: 3.66, V: 5.28
  2. Add C x3, H x3, P (random spawn positions).
- mol-0122 | C2H3NO isomer 2 | C2H3NO | T=666K | damp=0.9894 | bond=3.31 | box=5.28 | spawn={"S":0,"P":0,"O":1,"N":1,"C":2,"H":3} | events=1 | steps=3 | hitRate=0.143 | avgHitS=0.067
  1. T: 666, D: 0.9894, B: 3.31, V: 5.28
  2. Add C x2, H x3, N, O (random spawn positions).
  3. At ~60%: add H x11.
- mol-0123 | C2H3NO isomer 3 | C2H3NO | T=666K | damp=0.9894 | bond=3.31 | box=5.28 | spawn={"S":0,"P":0,"O":1,"N":1,"C":2,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 666, D: 0.9894, B: 3.31, V: 5.28
  2. Add C x2, H x3, N, O (random spawn positions).
- mol-0125 | C2H3OP isomer 1 | C2H3OP | T=666K | damp=0.9894 | bond=3.31 | box=5.28 | spawn={"S":0,"P":1,"O":1,"N":0,"C":2,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 666, D: 0.9894, B: 3.31, V: 5.28
  2. Add C x2, H x3, O, P (random spawn positions).
- mol-0130 | CH2NPS2 | CH2NPS2 | T=664K | damp=0.9894 | bond=3.31 | box=5.28 | spawn={"S":2,"P":1,"O":0,"N":1,"C":1,"H":2} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 664, D: 0.9894, B: 3.31, V: 5.28
  2. Add C, H x2, N, P, S x2 (random spawn positions).
- mol-0135 | CH3NOS isomer 3 | CH3NOS | T=666K | damp=0.9894 | bond=3.31 | box=5.28 | spawn={"S":1,"P":0,"O":1,"N":1,"C":1,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 666, D: 0.9894, B: 3.31, V: 5.28
  2. Add C, H x3, N, O, S (random spawn positions).
- mol-0136 | CH3NOS isomer 4 | CH3NOS | T=666K | damp=0.9894 | bond=3.31 | box=5.28 | spawn={"S":1,"P":0,"O":1,"N":1,"C":1,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 666, D: 0.9894, B: 3.31, V: 5.28
  2. Add C, H x3, N, O, S (random spawn positions).
- mol-0137 | CH3NOS isomer 5 | CH3NOS | T=666K | damp=0.9894 | bond=3.31 | box=5.28 | spawn={"S":1,"P":0,"O":1,"N":1,"C":1,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 666, D: 0.9894, B: 3.31, V: 5.28
  2. Add C, H x3, N, O, S (random spawn positions).
- mol-0138 | CH3NP2 isomer 1 | CH3NP2 | T=666K | damp=0.9894 | bond=3.31 | box=5.28 | spawn={"S":0,"P":2,"O":0,"N":1,"C":1,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 666, D: 0.9894, B: 3.31, V: 5.28
  2. Add C, H x3, N, P x2 (random spawn positions).
- mol-0140 | CH3NS2 | CH3NS2 | T=666K | damp=0.9894 | bond=3.31 | box=5.28 | spawn={"S":2,"P":0,"O":0,"N":1,"C":1,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 666, D: 0.9894, B: 3.31, V: 5.28
  2. Add C, H x3, N, S x2 (random spawn positions).
- mol-0141 | CH3O2P | CH3O2P | T=666K | damp=0.9894 | bond=3.31 | box=5.28 | spawn={"S":0,"P":1,"O":2,"N":0,"C":1,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 666, D: 0.9894, B: 3.31, V: 5.28
  2. Add C, H x3, O x2, P (random spawn positions).
- mol-0142 | CH3OPS | CH3OPS | T=666K | damp=0.9894 | bond=3.31 | box=5.28 | spawn={"S":1,"P":1,"O":1,"N":0,"C":1,"H":3} | events=3 | steps=5 | hitRate=0.143 | avgHitS=0.267
  1. T: 666, D: 0.9894, B: 3.31, V: 5.28
  2. Add C, H x3, O, P, S (random spawn positions).
  3. At ~16%: add C x2, O x2, P x2, S x2.
  4. At ~48%: delete ~35% of H atoms.
  5. At ~64%: add H x11.
- mol-0143 | CH3PS2 | CH3PS2 | T=666K | damp=0.9894 | bond=3.31 | box=5.28 | spawn={"S":2,"P":1,"O":0,"N":0,"C":1,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 666, D: 0.9894, B: 3.31, V: 5.28
  2. Add C, H x3, P, S x2 (random spawn positions).
- mol-0149 | CH4NP isomer 4 | CH4NP | T=668K | damp=0.9894 | bond=3.31 | box=5.28 | spawn={"S":0,"P":1,"O":0,"N":1,"C":1,"H":4} | events=1 | steps=3 | hitRate=0.143 | avgHitS=1.933
  1. T: 668, D: 0.9894, B: 3.31, V: 5.28
  2. Add C, H x4, N, P (random spawn positions).
  3. At ~24%: add C x2, H x4.
- mol-0159 | H4N2O | H4N2O | T=548K | damp=0.9891 | bond=2.96 | box=5.28 | spawn={"S":0,"P":0,"O":1,"N":2,"C":0,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 548, D: 0.9891, B: 2.96, V: 5.28
  2. Add H x4, N x2, O (random spawn positions).
- mol-0161 | H4N2S isomer 2 | H4N2S | T=548K | damp=0.9891 | bond=2.96 | box=5.28 | spawn={"S":1,"P":0,"O":0,"N":2,"C":0,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 548, D: 0.9891, B: 2.96, V: 5.28
  2. Add H x4, N x2, S (random spawn positions).
- mol-0163 | H4NPS | H4NPS | T=548K | damp=0.9891 | bond=2.96 | box=5.28 | spawn={"S":1,"P":1,"O":0,"N":1,"C":0,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 548, D: 0.9891, B: 2.96, V: 5.28
  2. Add H x4, N, P, S (random spawn positions).
- mol-0164 | C2H2O2S | C2H2O2S | T=784K | damp=0.9916 | bond=3.86 | box=5.53 | spawn={"S":1,"P":0,"O":2,"N":0,"C":2,"H":2} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 784, D: 0.9916, B: 3.86, V: 5.53
  2. Add C x2, H x2, O x2, S (random spawn positions).
- mol-0165 | C2H2OP2 | C2H2OP2 | T=784K | damp=0.9916 | bond=3.86 | box=5.53 | spawn={"S":0,"P":2,"O":1,"N":0,"C":2,"H":2} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 784, D: 0.9916, B: 3.86, V: 5.53
  2. Add C x2, H x2, O, P x2 (random spawn positions).
- mol-0166 | C2H3NO isomer 4 | C2H3NO | T=786K | damp=0.9916 | bond=3.86 | box=5.53 | spawn={"S":0,"P":0,"O":1,"N":1,"C":2,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 786, D: 0.9916, B: 3.86, V: 5.53
  2. Add C x2, H x3, N, O (random spawn positions).
- mol-0168 | C2H3NS isomer 2 | C2H3NS | T=786K | damp=0.9916 | bond=3.86 | box=5.53 | spawn={"S":1,"P":0,"O":0,"N":1,"C":2,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 786, D: 0.9916, B: 3.86, V: 5.53
  2. Add C x2, H x3, N, S (random spawn positions).
- mol-0169 | C2H3OP isomer 2 | C2H3OP | T=786K | damp=0.9916 | bond=3.86 | box=5.53 | spawn={"S":0,"P":1,"O":1,"N":0,"C":2,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 786, D: 0.9916, B: 3.86, V: 5.53
  2. Add C x2, H x3, O, P (random spawn positions).
- mol-0170 | C2H3PS isomer 1 | C2H3PS | T=786K | damp=0.9916 | bond=3.86 | box=5.53 | spawn={"S":1,"P":1,"O":0,"N":0,"C":2,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 786, D: 0.9916, B: 3.86, V: 5.53
  2. Add C x2, H x3, P, S (random spawn positions).
- mol-0171 | C2H3PS isomer 2 | C2H3PS | T=786K | damp=0.9916 | bond=3.86 | box=5.53 | spawn={"S":1,"P":1,"O":0,"N":0,"C":2,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 786, D: 0.9916, B: 3.86, V: 5.53
  2. Add C x2, H x3, P, S (random spawn positions).
- mol-0173 | C3H3N isomer 2 | C3H3N | T=786K | damp=0.9916 | bond=3.86 | box=5.53 | spawn={"S":0,"P":0,"O":0,"N":1,"C":3,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 786, D: 0.9916, B: 3.86, V: 5.53
  2. Add C x3, H x3, N (random spawn positions).
- mol-0174 | C3H3N isomer 3 | C3H3N | T=786K | damp=0.9916 | bond=3.86 | box=5.53 | spawn={"S":0,"P":0,"O":0,"N":1,"C":3,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 786, D: 0.9916, B: 3.86, V: 5.53
  2. Add C x3, H x3, N (random spawn positions).
- mol-0176 | C3H3P isomer 4 | C3H3P | T=786K | damp=0.9916 | bond=3.86 | box=5.53 | spawn={"S":0,"P":1,"O":0,"N":0,"C":3,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 786, D: 0.9916, B: 3.86, V: 5.53
  2. Add C x3, H x3, P (random spawn positions).
- mol-0178 | CH3N3 | CH3N3 | T=786K | damp=0.9916 | bond=3.86 | box=5.53 | spawn={"S":0,"P":0,"O":0,"N":3,"C":1,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 786, D: 0.9916, B: 3.86, V: 5.53
  2. Add C, H x3, N x3 (random spawn positions).
- mol-0182 | CH3NOS isomer 6 | CH3NOS | T=666K | damp=0.9912 | bond=3.51 | box=5.53 | spawn={"S":1,"P":0,"O":1,"N":1,"C":1,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 666, D: 0.9912, B: 3.51, V: 5.53
  2. Add C, H x3, N, O, S (random spawn positions).
- mol-0183 | CH3NOS isomer 7 | CH3NOS | T=666K | damp=0.9912 | bond=3.51 | box=5.53 | spawn={"S":1,"P":0,"O":1,"N":1,"C":1,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 666, D: 0.9912, B: 3.51, V: 5.53
  2. Add C, H x3, N, O, S (random spawn positions).
- mol-0185 | C3H2N2O | C3H2N2O | T=764K | damp=0.9902 | bond=3.74 | box=5.42 | spawn={"S":0,"P":0,"O":1,"N":2,"C":3,"H":2} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 764, D: 0.9902, B: 3.74, V: 5.42
  2. Add C x3, H x2, N x2, O (random spawn positions).
- mol-0186 | C3H4O isomer 1 | C3H4O | T=768K | damp=0.9902 | bond=3.74 | box=5.42 | spawn={"S":0,"P":0,"O":1,"N":0,"C":3,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 768, D: 0.9902, B: 3.74, V: 5.42
  2. Add C x3, H x4, O (random spawn positions).
- mol-0187 | C4H3N isomer 1 | C4H3N | T=766K | damp=0.9902 | bond=3.74 | box=5.42 | spawn={"S":0,"P":0,"O":0,"N":1,"C":4,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 766, D: 0.9902, B: 3.74, V: 5.42
  2. Add C x4, H x3, N (random spawn positions).
- mol-0189 | C2H3NO2 | C2H3NO2 | T=646K | damp=0.9899 | bond=3.39 | box=5.42 | spawn={"S":0,"P":0,"O":2,"N":1,"C":2,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 646, D: 0.9899, B: 3.39, V: 5.42
  2. Add C x2, H x3, N, O x2 (random spawn positions).
- mol-0190 | C2H4N2 isomer 1 | C2H4N2 | T=648K | damp=0.9899 | bond=3.39 | box=5.42 | spawn={"S":0,"P":0,"O":0,"N":2,"C":2,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 648, D: 0.9899, B: 3.39, V: 5.42
  2. Add C x2, H x4, N x2 (random spawn positions).
- mol-0191 | C2H4NP isomer 1 | C2H4NP | T=648K | damp=0.9899 | bond=3.39 | box=5.42 | spawn={"S":0,"P":1,"O":0,"N":1,"C":2,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 648, D: 0.9899, B: 3.39, V: 5.42
  2. Add C x2, H x4, N, P (random spawn positions).
- mol-0192 | C2H4OS isomer 1 | C2H4OS | T=648K | damp=0.9899 | bond=3.39 | box=5.42 | spawn={"S":1,"P":0,"O":1,"N":0,"C":2,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 648, D: 0.9899, B: 3.39, V: 5.42
  2. Add C x2, H x4, O, S (random spawn positions).
- mol-0193 | C2H4OS isomer 2 | C2H4OS | T=648K | damp=0.9899 | bond=3.39 | box=5.42 | spawn={"S":1,"P":0,"O":1,"N":0,"C":2,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 648, D: 0.9899, B: 3.39, V: 5.42
  2. Add C x2, H x4, O, S (random spawn positions).
- mol-0194 | C2H4OS isomer 3 | C2H4OS | T=648K | damp=0.9899 | bond=3.39 | box=5.42 | spawn={"S":1,"P":0,"O":1,"N":0,"C":2,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 648, D: 0.9899, B: 3.39, V: 5.42
  2. Add C x2, H x4, O, S (random spawn positions).
- mol-0195 | C2H4OS isomer 4 | C2H4OS | T=648K | damp=0.9899 | bond=3.39 | box=5.42 | spawn={"S":1,"P":0,"O":1,"N":0,"C":2,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 648, D: 0.9899, B: 3.39, V: 5.42
  2. Add C x2, H x4, O, S (random spawn positions).
- mol-0197 | C2H5N isomer 2 | C2H5N | T=650K | damp=0.9899 | bond=3.39 | box=5.42 | spawn={"S":0,"P":0,"O":0,"N":1,"C":2,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 650, D: 0.9899, B: 3.39, V: 5.42
  2. Add C x2, H x5, N (random spawn positions).
- mol-0200 | C2H5P isomer 2 | C2H5P | T=650K | damp=0.9899 | bond=3.39 | box=5.42 | spawn={"S":0,"P":1,"O":0,"N":0,"C":2,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 650, D: 0.9899, B: 3.39, V: 5.42
  2. Add C x2, H x5, P (random spawn positions).
- mol-0204 | C3H4S isomer 1 | C3H4S | T=648K | damp=0.9899 | bond=3.39 | box=5.42 | spawn={"S":1,"P":0,"O":0,"N":0,"C":3,"H":4} | events=1 | steps=3 | hitRate=0.143 | avgHitS=0.2
  1. T: 648, D: 0.9899, B: 3.39, V: 5.42
  2. Add C x3, H x4, S (random spawn positions).
  3. At ~60%: add H x11.
- mol-0206 | C4H4 isomer 2 | C4H4 | T=648K | damp=0.9899 | bond=3.39 | box=5.42 | spawn={"S":0,"P":0,"O":0,"N":0,"C":4,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 648, D: 0.9899, B: 3.39, V: 5.42
  2. Add C x4, H x4 (random spawn positions).
- mol-0207 | CH3N3S isomer 1 | CH3N3S | T=646K | damp=0.9899 | bond=3.39 | box=5.42 | spawn={"S":1,"P":0,"O":0,"N":3,"C":1,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 646, D: 0.9899, B: 3.39, V: 5.42
  2. Add C, H x3, N x3, S (random spawn positions).
- mol-0209 | CH4N2S isomer 1 | CH4N2S | T=648K | damp=0.9899 | bond=3.39 | box=5.42 | spawn={"S":1,"P":0,"O":0,"N":2,"C":1,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 648, D: 0.9899, B: 3.39, V: 5.42
  2. Add C, H x4, N x2, S (random spawn positions).
- mol-0210 | CH4N2S isomer 2 | CH4N2S | T=648K | damp=0.9899 | bond=3.39 | box=5.42 | spawn={"S":1,"P":0,"O":0,"N":2,"C":1,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 648, D: 0.9899, B: 3.39, V: 5.42
  2. Add C, H x4, N x2, S (random spawn positions).
- mol-0212 | CH4NPS isomer 2 | CH4NPS | T=648K | damp=0.9899 | bond=3.39 | box=5.42 | spawn={"S":1,"P":1,"O":0,"N":1,"C":1,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 648, D: 0.9899, B: 3.39, V: 5.42
  2. Add C, H x4, N, P, S (random spawn positions).
- mol-0214 | CH4OS2 isomer 1 | CH4OS2 | T=528K | damp=0.9896 | bond=3.04 | box=5.42 | spawn={"S":2,"P":0,"O":1,"N":0,"C":1,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 528, D: 0.9896, B: 3.04, V: 5.42
  2. Add C, H x4, O, S x2 (random spawn positions).
- mol-0215 | CH4OS2 isomer 2 | CH4OS2 | T=528K | damp=0.9896 | bond=3.04 | box=5.42 | spawn={"S":2,"P":0,"O":1,"N":0,"C":1,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 528, D: 0.9896, B: 3.04, V: 5.42
  2. Add C, H x4, O, S x2 (random spawn positions).
- mol-0220 | CH5OP isomer 1 | CH5OP | T=530K | damp=0.9896 | bond=3.04 | box=5.42 | spawn={"S":0,"P":1,"O":1,"N":0,"C":1,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 530, D: 0.9896, B: 3.04, V: 5.42
  2. Add C, H x5, O, P (random spawn positions).
- mol-0222 | CH5PS | CH5PS | T=530K | damp=0.9896 | bond=3.04 | box=5.42 | spawn={"S":1,"P":1,"O":0,"N":0,"C":1,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 530, D: 0.9896, B: 3.04, V: 5.42
  2. Add C, H x5, P, S (random spawn positions).
- mol-0223 | H4N2O2 | H4N2O2 | T=528K | damp=0.9896 | bond=3.04 | box=5.42 | spawn={"S":0,"P":0,"O":2,"N":2,"C":0,"H":4} | events=1 | steps=3 | hitRate=0.143 | avgHitS=5.267
  1. T: 528, D: 0.9896, B: 3.04, V: 5.42
  2. Add H x4, N x2, O x2 (random spawn positions).
  3. At ~60%: add H x11.
- mol-0224 | C4H3N isomer 2 | C4H3N | T=886K | damp=0.9923 | bond=4.29 | box=5.67 | spawn={"S":0,"P":0,"O":0,"N":1,"C":4,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 886, D: 0.9923, B: 4.29, V: 5.67
  2. Add C x4, H x3, N (random spawn positions).
- mol-0225 | C2H3OPS | C2H3OPS | T=766K | damp=0.992 | bond=3.94 | box=5.67 | spawn={"S":1,"P":1,"O":1,"N":0,"C":2,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 766, D: 0.9920, B: 3.94, V: 5.67
  2. Add C x2, H x3, O, P, S (random spawn positions).
- mol-0226 | C2H4N2 isomer 2 | C2H4N2 | T=768K | damp=0.992 | bond=3.94 | box=5.67 | spawn={"S":0,"P":0,"O":0,"N":2,"C":2,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 768, D: 0.9920, B: 3.94, V: 5.67
  2. Add C x2, H x4, N x2 (random spawn positions).
- mol-0227 | C2H4N2 isomer 3 | C2H4N2 | T=768K | damp=0.992 | bond=3.94 | box=5.67 | spawn={"S":0,"P":0,"O":0,"N":2,"C":2,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 768, D: 0.9920, B: 3.94, V: 5.67
  2. Add C x2, H x4, N x2 (random spawn positions).
- mol-0228 | C2H4NP isomer 2 | C2H4NP | T=768K | damp=0.992 | bond=3.94 | box=5.67 | spawn={"S":0,"P":1,"O":0,"N":1,"C":2,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 768, D: 0.9920, B: 3.94, V: 5.67
  2. Add C x2, H x4, N, P (random spawn positions).
- mol-0229 | C3H3NS | C3H3NS | T=766K | damp=0.992 | bond=3.94 | box=5.67 | spawn={"S":1,"P":0,"O":0,"N":1,"C":3,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 766, D: 0.9920, B: 3.94, V: 5.67
  2. Add C x3, H x3, N, S (random spawn positions).
- mol-0232 | C3H4O isomer 5 | C3H4O | T=768K | damp=0.992 | bond=3.94 | box=5.67 | spawn={"S":0,"P":0,"O":1,"N":0,"C":3,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 768, D: 0.9920, B: 3.94, V: 5.67
  2. Add C x3, H x4, O (random spawn positions).
- mol-0233 | C3H4O isomer 6 | C3H4O | T=768K | damp=0.992 | bond=3.94 | box=5.67 | spawn={"S":0,"P":0,"O":1,"N":0,"C":3,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 768, D: 0.9920, B: 3.94, V: 5.67
  2. Add C x3, H x4, O (random spawn positions).
- mol-0234 | C4H3N isomer 3 | C4H3N | T=766K | damp=0.992 | bond=3.94 | box=5.67 | spawn={"S":0,"P":0,"O":0,"N":1,"C":4,"H":3} | events=2 | steps=4 | hitRate=0.143 | avgHitS=0.6
  1. T: 766, D: 0.9920, B: 3.94, V: 5.67
  2. Add C x4, H x3, N (random spawn positions).
  3. At ~14%: add C x8, N x2.
  4. At ~52%: add H x14.
- mol-0235 | C4H4 isomer 3 | C4H4 | T=768K | damp=0.992 | bond=3.94 | box=5.67 | spawn={"S":0,"P":0,"O":0,"N":0,"C":4,"H":4} | events=2 | steps=4 | hitRate=0.143 | avgHitS=1.267
  1. T: 768, D: 0.9920, B: 3.94, V: 5.67
  2. Add C x4, H x4 (random spawn positions).
  3. At ~14%: add C x8.
  4. At ~52%: add H x11.
- mol-0237 | CH2N3PS | CH2N3PS | T=764K | damp=0.992 | bond=3.94 | box=5.67 | spawn={"S":1,"P":1,"O":0,"N":3,"C":1,"H":2} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 764, D: 0.9920, B: 3.94, V: 5.67
  2. Add C, H x2, N x3, P, S (random spawn positions).
- mol-0238 | CH3N3S isomer 2 | CH3N3S | T=766K | damp=0.992 | bond=3.94 | box=5.67 | spawn={"S":1,"P":0,"O":0,"N":3,"C":1,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 766, D: 0.9920, B: 3.94, V: 5.67
  2. Add C, H x3, N x3, S (random spawn positions).
- mol-0244 | CH4N2S isomer 3 | CH4N2S | T=648K | damp=0.9917 | bond=3.59 | box=5.67 | spawn={"S":1,"P":0,"O":0,"N":2,"C":1,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 648, D: 0.9917, B: 3.59, V: 5.67
  2. Add C, H x4, N x2, S (random spawn positions).
- mol-0245 | C3H4O2 isomer 1 | C3H4O2 | T=748K | damp=0.9907 | bond=3.82 | box=5.56 | spawn={"S":0,"P":0,"O":2,"N":0,"C":3,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 748, D: 0.9907, B: 3.82, V: 5.56
  2. Add C x3, H x4, O x2 (random spawn positions).
- mol-0246 | C3H4OS | C3H4OS | T=748K | damp=0.9907 | bond=3.82 | box=5.56 | spawn={"S":1,"P":0,"O":1,"N":0,"C":3,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 748, D: 0.9907, B: 3.82, V: 5.56
  2. Add C x3, H x4, O, S (random spawn positions).
- mol-0247 | C3H5N isomer 1 | C3H5N | T=750K | damp=0.9907 | bond=3.82 | box=5.56 | spawn={"S":0,"P":0,"O":0,"N":1,"C":3,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 750, D: 0.9907, B: 3.82, V: 5.56
  2. Add C x3, H x5, N (random spawn positions).
- mol-0248 | C2H3NO3 | C2H3NO3 | T=626K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":0,"O":3,"N":1,"C":2,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 626, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x2, H x3, N, O x3 (random spawn positions).
- mol-0249 | C2H4N2O isomer 1 | C2H4N2O | T=628K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":0,"O":1,"N":2,"C":2,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 628, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x2, H x4, N x2, O (random spawn positions).
- mol-0250 | C2H4N2O isomer 2 | C2H4N2O | T=628K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":0,"O":1,"N":2,"C":2,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 628, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x2, H x4, N x2, O (random spawn positions).
- mol-0251 | C2H4NOP isomer 1 | C2H4NOP | T=628K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":1,"O":1,"N":1,"C":2,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 628, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x2, H x4, N, O, P (random spawn positions).
- mol-0252 | C2H4O2S | C2H4O2S | T=628K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":1,"P":0,"O":2,"N":0,"C":2,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 628, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x2, H x4, O x2, S (random spawn positions).
- mol-0253 | C2H4O3 | C2H4O3 | T=628K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":0,"O":3,"N":0,"C":2,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 628, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x2, H x4, O x3 (random spawn positions).
- mol-0254 | C2H4OP2 | C2H4OP2 | T=628K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":2,"O":1,"N":0,"C":2,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 628, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x2, H x4, O, P x2 (random spawn positions).
- mol-0255 | C2H5NO isomer 1 | C2H5NO | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":0,"O":1,"N":1,"C":2,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x2, H x5, N, O (random spawn positions).
- mol-0257 | C2H5NO isomer 3 | C2H5NO | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":0,"O":1,"N":1,"C":2,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x2, H x5, N, O (random spawn positions).
- mol-0258 | C2H5NO isomer 4 | C2H5NO | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":0,"O":1,"N":1,"C":2,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x2, H x5, N, O (random spawn positions).
- mol-0259 | C2H5NO isomer 5 | C2H5NO | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":0,"O":1,"N":1,"C":2,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x2, H x5, N, O (random spawn positions).
- mol-0260 | C2H5NO isomer 6 | C2H5NO | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":0,"O":1,"N":1,"C":2,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x2, H x5, N, O (random spawn positions).
- mol-0261 | C2H5NS isomer 1 | C2H5NS | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":1,"P":0,"O":0,"N":1,"C":2,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x2, H x5, N, S (random spawn positions).
- mol-0262 | C2H5NS isomer 2 | C2H5NS | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":1,"P":0,"O":0,"N":1,"C":2,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x2, H x5, N, S (random spawn positions).
- mol-0263 | C2H5NS isomer 3 | C2H5NS | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":1,"P":0,"O":0,"N":1,"C":2,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x2, H x5, N, S (random spawn positions).
- mol-0264 | C2H5NS isomer 4 | C2H5NS | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":1,"P":0,"O":0,"N":1,"C":2,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x2, H x5, N, S (random spawn positions).
- mol-0265 | C2H5OP isomer 1 | C2H5OP | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":1,"O":1,"N":0,"C":2,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x2, H x5, O, P (random spawn positions).
- mol-0266 | C2H5OP isomer 2 | C2H5OP | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":1,"O":1,"N":0,"C":2,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x2, H x5, O, P (random spawn positions).
- mol-0267 | C2H5OP isomer 3 | C2H5OP | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":1,"O":1,"N":0,"C":2,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x2, H x5, O, P (random spawn positions).
- mol-0268 | C2H5OP isomer 4 | C2H5OP | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":1,"O":1,"N":0,"C":2,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x2, H x5, O, P (random spawn positions).
- mol-0269 | C2H5OP isomer 5 | C2H5OP | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":1,"O":1,"N":0,"C":2,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x2, H x5, O, P (random spawn positions).
- mol-0270 | C2H5PS | C2H5PS | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":1,"P":1,"O":0,"N":0,"C":2,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x2, H x5, P, S (random spawn positions).

