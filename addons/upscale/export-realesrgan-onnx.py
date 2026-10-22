import torch, torch.nn as nn, torch.nn.functional as F
class SRVGG(nn.Module):
    def __init__(s, nf=64, nc=32, up=4):
        super().__init__(); s.up = up; b = [nn.Conv2d(3, nf, 3, 1, 1), nn.PReLU(nf)]
        for _ in range(nc): b += [nn.Conv2d(nf, nf, 3, 1, 1), nn.PReLU(nf)]
        b += [nn.Conv2d(nf, 3 * up * up, 3, 1, 1)]; s.body = nn.ModuleList(b); s.ups = nn.PixelShuffle(up)
    def forward(s, x):
        o = x
        for m in s.body: o = m(o)
        o = s.ups(o) + F.interpolate(x, scale_factor=s.up, mode='nearest')
        return o.clamp(0, 1)
m = SRVGG(); sd = torch.load('realesr-general-x4v3.pth', map_location='cpu'); sd = sd.get('params', sd)
m.load_state_dict(sd, strict=True); m.eval()
x = torch.rand(1, 3, 64, 64)
torch.onnx.export(m, x, 'realesr-general-x4v3.onnx', input_names=['input'], output_names=['output'], dynamic_axes={'input': {2: 'h', 3: 'w'}, 'output': {2: 'H', 3: 'W'}}, opset_version=17, dynamo=False)
import onnx; onnx.checker.check_model('realesr-general-x4v3.onnx'); print('ok')
