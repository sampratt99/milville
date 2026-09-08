# Credits and licences

No external art was brought in. Every texture (grass, dirt, stone, brick, wood,
slate, foliage, plaster, metal, glass, cloth, skin, water ripples, clouds, leaf
clusters, conifer fronds, grass blades) is synthesised at load time by
`hd/hd-pre.js` and `hd/hd-foliage.js` from value/Worley noise. The clone runs
with no network at all once served.

| Component | Source | Licence |
|---|---|---|
| Three.js r128 (`vendor/three/three.min.js`) | https://github.com/mrdoob/three.js | MIT |
| r128 example modules (`vendor/three/**`: EffectComposer, RenderPass, ShaderPass, MaskPass, Pass, UnrealBloomPass, SSAOPass, Sky, Water, Reflector, RGBELoader, GLTFLoader, SimplexNoise, and the Copy/LuminosityHighPass/SSAO/FXAA/SMAA/GammaCorrection shaders) | same repository, `examples/js` | MIT |
| Milville itself | Sam Pratt | as the original repository |

The SSAO pass and Sky shader are used with small in-place source patches
(applied at runtime, the vendored files are untouched): a far-plane guard in
`SSAOShader`, a gain uniform in `Sky`.
