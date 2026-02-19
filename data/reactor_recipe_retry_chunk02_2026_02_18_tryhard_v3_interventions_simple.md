# Reactor Recipe Search

Generated: 2026-02-18T22:11:18.118Z
Scope: 100 molecules
Found: 9
Coverage: 9%

Settings constraints:
- allowMultipleBonds: true
- sigma/epsilon: defaults (unchanged)
- controls varied: temperature, damping, bondScale, boxHalfSize
- max atoms spawned: 200
- max recipe steps target: 6
- prefer simple recipes: true

Per-molecule recommendation:

`id | name | formula | temperature | damping | bond | box | spawn counts | hitRate | avgHitS`

- mol-0200 | C2H5P isomer 2 | C2H5P | T=650K | damp=0.9899 | bond=3.39 | box=5.42 | spawn={"S":0,"P":1,"O":0,"N":0,"C":2,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 650, D: 0.9899, B: 3.39, V: 5.42
  2. Add C x2, H x5, P (random spawn positions).
- mol-0203 | C3H4O isomer 2 | C3H4O | T=648K | damp=0.9899 | bond=3.39 | box=5.42 | spawn={"S":0,"P":0,"O":1,"N":0,"C":3,"H":4} | events=1 | steps=3 | hitRate=0.143 | avgHitS=1.067
  1. T: 648, D: 0.9899, B: 3.39, V: 5.42
  2. Add C x3, H x4, O (random spawn positions).
  3. At ~60%: add H x11.
- mol-0204 | C3H4S isomer 1 | C3H4S | T=648K | damp=0.9899 | bond=3.39 | box=5.42 | spawn={"S":1,"P":0,"O":0,"N":0,"C":3,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 648, D: 0.9899, B: 3.39, V: 5.42
  2. Add C x3, H x4, S (random spawn positions).
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
- mol-0211 | CH4NPS isomer 1 | CH4NPS | T=648K | damp=0.9899 | bond=3.39 | box=5.42 | spawn={"S":1,"P":1,"O":0,"N":1,"C":1,"H":4} | events=3 | steps=5 | hitRate=0.143 | avgHitS=0.133
  1. T: 648, D: 0.9899, B: 3.39, V: 5.42
  2. Add C, H x4, N, P, S (random spawn positions).
  3. At ~10%: add C, N, P, S.
  4. At ~30%: add C x2, N x2, P x2, S x2.
  5. At ~64%: add H x11.
- mol-0212 | CH4NPS isomer 2 | CH4NPS | T=648K | damp=0.9899 | bond=3.39 | box=5.42 | spawn={"S":1,"P":1,"O":0,"N":1,"C":1,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 648, D: 0.9899, B: 3.39, V: 5.42
  2. Add C, H x4, N, P, S (random spawn positions).
- mol-0214 | CH4OS2 isomer 1 | CH4OS2 | T=528K | damp=0.9896 | bond=3.04 | box=5.42 | spawn={"S":2,"P":0,"O":1,"N":0,"C":1,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 528, D: 0.9896, B: 3.04, V: 5.42
  2. Add C, H x4, O, S x2 (random spawn positions).
- mol-0215 | CH4OS2 isomer 2 | CH4OS2 | T=528K | damp=0.9896 | bond=3.04 | box=5.42 | spawn={"S":2,"P":0,"O":1,"N":0,"C":1,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 528, D: 0.9896, B: 3.04, V: 5.42
  2. Add C, H x4, O, S x2 (random spawn positions).
- mol-0218 | CH5NO isomer 2 | CH5NO | T=530K | damp=0.9896 | bond=3.04 | box=5.42 | spawn={"S":0,"P":0,"O":1,"N":1,"C":1,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 530, D: 0.9896, B: 3.04, V: 5.42
  2. Add C, H x5, N, O (random spawn positions).
- mol-0219 | CH5NS | CH5NS | T=530K | damp=0.9896 | bond=3.04 | box=5.42 | spawn={"S":1,"P":0,"O":0,"N":1,"C":1,"H":5} | events=0 | steps=2 | hitRate=0.143 | avgHitS=22.333
  1. T: 530, D: 0.9896, B: 3.04, V: 5.42
  2. Add C, H x5, N, S (random spawn positions).
- mol-0220 | CH5OP isomer 1 | CH5OP | T=530K | damp=0.9896 | bond=3.04 | box=5.42 | spawn={"S":0,"P":1,"O":1,"N":0,"C":1,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 530, D: 0.9896, B: 3.04, V: 5.42
  2. Add C, H x5, O, P (random spawn positions).
- mol-0221 | CH5OP isomer 2 | CH5OP | T=530K | damp=0.9896 | bond=3.04 | box=5.42 | spawn={"S":0,"P":1,"O":1,"N":0,"C":1,"H":5} | events=1 | steps=3 | hitRate=0.2 | avgHitS=4.4
  1. T: 530, D: 0.9896, B: 3.04, V: 5.42
  2. Add C, H x5, O, P (random spawn positions).
  3. At ~60%: add H x8.
- mol-0222 | CH5PS | CH5PS | T=530K | damp=0.9896 | bond=3.04 | box=5.42 | spawn={"S":1,"P":1,"O":0,"N":0,"C":1,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 530, D: 0.9896, B: 3.04, V: 5.42
  2. Add C, H x5, P, S (random spawn positions).
- mol-0223 | H4N2O2 | H4N2O2 | T=528K | damp=0.9896 | bond=3.04 | box=5.42 | spawn={"S":0,"P":0,"O":2,"N":2,"C":0,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 528, D: 0.9896, B: 3.04, V: 5.42
  2. Add H x4, N x2, O x2 (random spawn positions).
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
- mol-0230 | C3H4O isomer 3 | C3H4O | T=768K | damp=0.992 | bond=3.94 | box=5.67 | spawn={"S":0,"P":0,"O":1,"N":0,"C":3,"H":4} | events=1 | steps=3 | hitRate=0.143 | avgHitS=27.067
  1. T: 768, D: 0.9920, B: 3.94, V: 5.67
  2. Add C x3, H x4, O (random spawn positions).
  3. At ~24%: add C x2, H x4.
- mol-0232 | C3H4O isomer 5 | C3H4O | T=768K | damp=0.992 | bond=3.94 | box=5.67 | spawn={"S":0,"P":0,"O":1,"N":0,"C":3,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 768, D: 0.9920, B: 3.94, V: 5.67
  2. Add C x3, H x4, O (random spawn positions).
- mol-0233 | C3H4O isomer 6 | C3H4O | T=768K | damp=0.992 | bond=3.94 | box=5.67 | spawn={"S":0,"P":0,"O":1,"N":0,"C":3,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 768, D: 0.9920, B: 3.94, V: 5.67
  2. Add C x3, H x4, O (random spawn positions).
- mol-0234 | C4H3N isomer 3 | C4H3N | T=766K | damp=0.992 | bond=3.94 | box=5.67 | spawn={"S":0,"P":0,"O":0,"N":1,"C":4,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 766, D: 0.9920, B: 3.94, V: 5.67
  2. Add C x4, H x3, N (random spawn positions).
- mol-0235 | C4H4 isomer 3 | C4H4 | T=768K | damp=0.992 | bond=3.94 | box=5.67 | spawn={"S":0,"P":0,"O":0,"N":0,"C":4,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 768, D: 0.9920, B: 3.94, V: 5.67
  2. Add C x4, H x4 (random spawn positions).
- mol-0237 | CH2N3PS | CH2N3PS | T=764K | damp=0.992 | bond=3.94 | box=5.67 | spawn={"S":1,"P":1,"O":0,"N":3,"C":1,"H":2} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 764, D: 0.9920, B: 3.94, V: 5.67
  2. Add C, H x2, N x3, P, S (random spawn positions).
- mol-0238 | CH3N3S isomer 2 | CH3N3S | T=766K | damp=0.992 | bond=3.94 | box=5.67 | spawn={"S":1,"P":0,"O":0,"N":3,"C":1,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 766, D: 0.9920, B: 3.94, V: 5.67
  2. Add C, H x3, N x3, S (random spawn positions).
- mol-0240 | C2H4O2 isomer 2 | C2H4O2 | T=648K | damp=0.9917 | bond=3.59 | box=5.67 | spawn={"S":0,"P":0,"O":2,"N":0,"C":2,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 648, D: 0.9917, B: 3.59, V: 5.67
  2. Add C x2, H x4, O x2 (random spawn positions).
- mol-0241 | C2H5N isomer 4 | C2H5N | T=650K | damp=0.9917 | bond=3.59 | box=5.67 | spawn={"S":0,"P":0,"O":0,"N":1,"C":2,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 650, D: 0.9917, B: 3.59, V: 5.67
  2. Add C x2, H x5, N (random spawn positions).
- mol-0242 | C2H5P isomer 4 | C2H5P | T=650K | damp=0.9917 | bond=3.59 | box=5.67 | spawn={"S":0,"P":1,"O":0,"N":0,"C":2,"H":5} | events=1 | steps=3 | hitRate=0.143 | avgHitS=4.733
  1. T: 650, D: 0.9917, B: 3.59, V: 5.67
  2. Add C x2, H x5, P (random spawn positions).
  3. At ~60%: add H x8.
- mol-0243 | CH4N2O | CH4N2O | T=648K | damp=0.9917 | bond=3.59 | box=5.67 | spawn={"S":0,"P":0,"O":1,"N":2,"C":1,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 648, D: 0.9917, B: 3.59, V: 5.67
  2. Add C, H x4, N x2, O (random spawn positions).
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
- mol-0256 | C2H5NO isomer 2 | C2H5NO | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":0,"O":1,"N":1,"C":2,"H":5} | events=3 | steps=5 | hitRate=0.143 | avgHitS=0.067
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x2, H x5, N, O (random spawn positions).
  3. At ~10%: add C x2, N, O.
  4. At ~30%: add C x4, N x2, O x2.
  5. At ~64%: add H x11.
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
- mol-0271 | C3H5N isomer 2 | C3H5N | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":0,"O":0,"N":1,"C":3,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x3, H x5, N (random spawn positions).
- mol-0272 | C3H5N isomer 3 | C3H5N | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":0,"O":0,"N":1,"C":3,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x3, H x5, N (random spawn positions).
- mol-0273 | C3H5N isomer 4 | C3H5N | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":0,"O":0,"N":1,"C":3,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x3, H x5, N (random spawn positions).
- mol-0274 | C3H5N isomer 5 | C3H5N | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":0,"O":0,"N":1,"C":3,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x3, H x5, N (random spawn positions).
- mol-0275 | C3H5P isomer 1 | C3H5P | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":1,"O":0,"N":0,"C":3,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x3, H x5, P (random spawn positions).
- mol-0276 | C3H5P isomer 2 | C3H5P | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":1,"O":0,"N":0,"C":3,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x3, H x5, P (random spawn positions).
- mol-0277 | C3H6 | C3H6 | T=632K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":0,"O":0,"N":0,"C":3,"H":6} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 632, D: 0.9903, B: 3.47, V: 5.56
  2. Add C x3, H x6 (random spawn positions).
- mol-0278 | CH3O3PS | CH3O3PS | T=626K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":1,"P":1,"O":3,"N":0,"C":1,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 626, D: 0.9903, B: 3.47, V: 5.56
  2. Add C, H x3, O x3, P, S (random spawn positions).
- mol-0279 | CH4N2O2 | CH4N2O2 | T=628K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":0,"O":2,"N":2,"C":1,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 628, D: 0.9903, B: 3.47, V: 5.56
  2. Add C, H x4, N x2, O x2 (random spawn positions).
- mol-0280 | CH4N4 | CH4N4 | T=628K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":0,"O":0,"N":4,"C":1,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 628, D: 0.9903, B: 3.47, V: 5.56
  2. Add C, H x4, N x4 (random spawn positions).
- mol-0281 | CH4NOPS | CH4NOPS | T=628K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":1,"P":1,"O":1,"N":1,"C":1,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 628, D: 0.9903, B: 3.47, V: 5.56
  2. Add C, H x4, N, O, P, S (random spawn positions).
- mol-0282 | CH5NP2 isomer 1 | CH5NP2 | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":2,"O":0,"N":1,"C":1,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C, H x5, N, P x2 (random spawn positions).
- mol-0283 | CH5NP2 isomer 2 | CH5NP2 | T=630K | damp=0.9903 | bond=3.47 | box=5.56 | spawn={"S":0,"P":2,"O":0,"N":1,"C":1,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 630, D: 0.9903, B: 3.47, V: 5.56
  2. Add C, H x5, N, P x2 (random spawn positions).
- mol-0284 | C2H6O isomer 1 | C2H6O | T=512K | damp=0.99 | bond=3.12 | box=5.56 | spawn={"S":0,"P":0,"O":1,"N":0,"C":2,"H":6} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 512, D: 0.9900, B: 3.12, V: 5.56
  2. Add C x2, H x6, O (random spawn positions).
- mol-0285 | C2H6O isomer 2 | C2H6O | T=512K | damp=0.99 | bond=3.12 | box=5.56 | spawn={"S":0,"P":0,"O":1,"N":0,"C":2,"H":6} | events=1 | steps=3 | hitRate=0.143 | avgHitS=4.2
  1. T: 512, D: 0.9900, B: 3.12, V: 5.56
  2. Add C x2, H x6, O (random spawn positions).
  3. At ~60%: add H x8.
- mol-0286 | C2H6S isomer 1 | C2H6S | T=512K | damp=0.99 | bond=3.12 | box=5.56 | spawn={"S":1,"P":0,"O":0,"N":0,"C":2,"H":6} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 512, D: 0.9900, B: 3.12, V: 5.56
  2. Add C x2, H x6, S (random spawn positions).
- mol-0288 | CH5NO2 | CH5NO2 | T=510K | damp=0.99 | bond=3.12 | box=5.56 | spawn={"S":0,"P":0,"O":2,"N":1,"C":1,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 510, D: 0.9900, B: 3.12, V: 5.56
  2. Add C, H x5, N, O x2 (random spawn positions).
- mol-0289 | CH5NOS | CH5NOS | T=510K | damp=0.99 | bond=3.12 | box=5.56 | spawn={"S":1,"P":0,"O":1,"N":1,"C":1,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 510, D: 0.9900, B: 3.12, V: 5.56
  2. Add C, H x5, N, O, S (random spawn positions).
- mol-0290 | CH5O2P isomer 1 | CH5O2P | T=510K | damp=0.99 | bond=3.12 | box=5.56 | spawn={"S":0,"P":1,"O":2,"N":0,"C":1,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 510, D: 0.9900, B: 3.12, V: 5.56
  2. Add C, H x5, O x2, P (random spawn positions).
- mol-0291 | CH5O2P isomer 2 | CH5O2P | T=510K | damp=0.99 | bond=3.12 | box=5.56 | spawn={"S":0,"P":1,"O":2,"N":0,"C":1,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 510, D: 0.9900, B: 3.12, V: 5.56
  2. Add C, H x5, O x2, P (random spawn positions).
- mol-0292 | CH6N2 | CH6N2 | T=512K | damp=0.99 | bond=3.12 | box=5.56 | spawn={"S":0,"P":0,"O":0,"N":2,"C":1,"H":6} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 512, D: 0.9900, B: 3.12, V: 5.56
  2. Add C, H x6, N x2 (random spawn positions).
- mol-0293 | CH6NP isomer 1 | CH6NP | T=512K | damp=0.99 | bond=3.12 | box=5.56 | spawn={"S":0,"P":1,"O":0,"N":1,"C":1,"H":6} | events=1 | steps=3 | hitRate=0.143 | avgHitS=18
  1. T: 512, D: 0.9900, B: 3.12, V: 5.56
  2. Add C, H x6, N, P (random spawn positions).
  3. At ~60%: add H x8.
- mol-0295 | H5N2OP | H5N2OP | T=510K | damp=0.99 | bond=3.12 | box=5.56 | spawn={"S":0,"P":1,"O":1,"N":2,"C":0,"H":5} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 510, D: 0.9900, B: 3.12, V: 5.56
  2. Add H x5, N x2, O, P (random spawn positions).
- mol-0296 | C3H4N2 isomer 1 | C3H4N2 | T=868K | damp=0.9928 | bond=4.37 | box=5.81 | spawn={"S":0,"P":0,"O":0,"N":2,"C":3,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 868, D: 0.9928, B: 4.37, V: 5.81
  2. Add C x3, H x4, N x2 (random spawn positions).
- mol-0297 | C4H4O | C4H4O | T=868K | damp=0.9928 | bond=4.37 | box=5.81 | spawn={"S":0,"P":0,"O":1,"N":0,"C":4,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 868, D: 0.9928, B: 4.37, V: 5.81
  2. Add C x4, H x4, O (random spawn positions).
- mol-0298 | C4H4S | C4H4S | T=868K | damp=0.9928 | bond=4.37 | box=5.81 | spawn={"S":1,"P":0,"O":0,"N":0,"C":4,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 868, D: 0.9928, B: 4.37, V: 5.81
  2. Add C x4, H x4, S (random spawn positions).
- mol-0299 | C6H2O | C6H2O | T=864K | damp=0.9928 | bond=4.37 | box=5.81 | spawn={"S":0,"P":0,"O":1,"N":0,"C":6,"H":2} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 864, D: 0.9928, B: 4.37, V: 5.81
  2. Add C x6, H x2, O (random spawn positions).
- mol-0300 | C2H4N2O isomer 3 | C2H4N2O | T=748K | damp=0.9925 | bond=4.02 | box=5.81 | spawn={"S":0,"P":0,"O":1,"N":2,"C":2,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 748, D: 0.9925, B: 4.02, V: 5.81
  2. Add C x2, H x4, N x2, O (random spawn positions).
- mol-0301 | C2H4N2O isomer 4 | C2H4N2O | T=748K | damp=0.9925 | bond=4.02 | box=5.81 | spawn={"S":0,"P":0,"O":1,"N":2,"C":2,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 748, D: 0.9925, B: 4.02, V: 5.81
  2. Add C x2, H x4, N x2, O (random spawn positions).
- mol-0302 | C2H4N2S | C2H4N2S | T=748K | damp=0.9925 | bond=4.02 | box=5.81 | spawn={"S":1,"P":0,"O":0,"N":2,"C":2,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 748, D: 0.9925, B: 4.02, V: 5.81
  2. Add C x2, H x4, N x2, S (random spawn positions).
- mol-0303 | C2H4NOP isomer 2 | C2H4NOP | T=748K | damp=0.9925 | bond=4.02 | box=5.81 | spawn={"S":0,"P":1,"O":1,"N":1,"C":2,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 748, D: 0.9925, B: 4.02, V: 5.81
  2. Add C x2, H x4, N, O, P (random spawn positions).
- mol-0304 | C2H4NOP isomer 3 | C2H4NOP | T=748K | damp=0.9925 | bond=4.02 | box=5.81 | spawn={"S":0,"P":1,"O":1,"N":1,"C":2,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 748, D: 0.9925, B: 4.02, V: 5.81
  2. Add C x2, H x4, N, O, P (random spawn positions).
- mol-0305 | C2H4NPS | C2H4NPS | T=748K | damp=0.9925 | bond=4.02 | box=5.81 | spawn={"S":1,"P":1,"O":0,"N":1,"C":2,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 748, D: 0.9925, B: 4.02, V: 5.81
  2. Add C x2, H x4, N, P, S (random spawn positions).
- mol-0306 | C3H3NOS | C3H3NOS | T=746K | damp=0.9925 | bond=4.02 | box=5.81 | spawn={"S":1,"P":0,"O":1,"N":1,"C":3,"H":3} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 746, D: 0.9925, B: 4.02, V: 5.81
  2. Add C x3, H x3, N, O, S (random spawn positions).
- mol-0307 | C3H4N2 isomer 2 | C3H4N2 | T=748K | damp=0.9925 | bond=4.02 | box=5.81 | spawn={"S":0,"P":0,"O":0,"N":2,"C":3,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 748, D: 0.9925, B: 4.02, V: 5.81
  2. Add C x3, H x4, N x2 (random spawn positions).
- mol-0308 | C3H4N2 isomer 3 | C3H4N2 | T=748K | damp=0.9925 | bond=4.02 | box=5.81 | spawn={"S":0,"P":0,"O":0,"N":2,"C":3,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 748, D: 0.9925, B: 4.02, V: 5.81
  2. Add C x3, H x4, N x2 (random spawn positions).
- mol-0309 | C3H4NP | C3H4NP | T=748K | damp=0.9925 | bond=4.02 | box=5.81 | spawn={"S":0,"P":1,"O":0,"N":1,"C":3,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 748, D: 0.9925, B: 4.02, V: 5.81
  2. Add C x3, H x4, N, P (random spawn positions).
- mol-0310 | C3H4O2 isomer 2 | C3H4O2 | T=748K | damp=0.9925 | bond=4.02 | box=5.81 | spawn={"S":0,"P":0,"O":2,"N":0,"C":3,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 748, D: 0.9925, B: 4.02, V: 5.81
  2. Add C x3, H x4, O x2 (random spawn positions).
- mol-0311 | C3H4P2 | C3H4P2 | T=748K | damp=0.9925 | bond=4.02 | box=5.81 | spawn={"S":0,"P":2,"O":0,"N":0,"C":3,"H":4} | events=0 | steps=2 | hitRate=0 | avgHitS=-
  1. T: 748, D: 0.9925, B: 4.02, V: 5.81
  2. Add C x3, H x4, P x2 (random spawn positions).

