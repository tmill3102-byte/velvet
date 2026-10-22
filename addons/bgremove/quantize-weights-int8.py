# weight-only int8 (per-output-channel, symmetric) for Conv weights: W_int8 -> DequantizeLinear -> Conv (activations stay fp32).
import onnx, numpy as np, sys
from onnx import numpy_helper as nh, helper as h
src, dst = sys.argv[1], sys.argv[2]
m = onnx.load(src); g = m.graph; inits = {i.name: i for i in g.initializer}
conv_w = {n.input[1] for n in g.node if n.op_type in ('Conv', 'ConvTranspose') and n.input[1] in inits}
new_nodes = []; n_q = 0
for name in conv_w:
    w = nh.to_array(inits[name]).astype(np.float32)
    if w.size < 4096: continue
    ax = 0; red = tuple(range(1, w.ndim))
    sc = np.abs(w).max(axis=red) / 127.0; sc[sc == 0] = 1e-8
    q = np.clip(np.round(w / sc.reshape(-1, *[1] * (w.ndim - 1))), -127, 127).astype(np.int8)
    g.initializer.remove(inits[name])
    g.initializer.extend([nh.from_array(q, name + '_q'), nh.from_array(sc.astype(np.float32), name + '_s'), nh.from_array(np.zeros_like(sc, dtype=np.int8), name + '_z')])
    new_nodes.append(h.make_node('DequantizeLinear', [name + '_q', name + '_s', name + '_z'], [name], axis=ax, name=name + '_dq')); n_q += 1
nodes = list(g.node); del g.node[:]; g.node.extend(new_nodes + nodes)
if m.opset_import[0].version < 13: m.opset_import[0].version = 13
onnx.save(m, dst); print('quantized', n_q)
