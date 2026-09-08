# RS3 style notes (research, September 2026)

What the RuneScape 3 (NXT) renders on the wiki actually look like, and what that means for
Milville HD. References were read from runescape.wiki creature pages (wolf, giant rat,
skeleton, hill giant, green dragon) and the NXT dev blog. Wiki images are not copied into
this repo.

## How NXT draws characters
- Meshes of triangles with painted textures; animation deforms the mesh (Jagex describe it
  as choosing which triangles move with each part, not a conventional bone skeleton).
  Newer assets carry normal/emissive or metalness/roughness maps; older ones are diffuse.
- Lighting is tinting, shadows and fog on top; post-processing restores saturated colour
  (players complained of "muted colours" during NXT development).

## The look, creature by creature
- **Wolf**: a big head on a lowered neck, a heavy mane and ruff of *faceted fur wedges*
  around the neck and shoulders, a dark eye mask, thick thighs to thin shins, big paws.
  Hand-painted white/grey shading over visible low-poly facets.
- **Giant rat**: exaggerated head, open mouth with big incisors, red eyes, fur as flat
  geometric clumps (plates) down the back, bald tail, clawed toed feet.
- **Skeleton**: anatomical proportions, a real skull, ribs, pelvis, knobbed joints, clawed
  feet, a crouched stance; bones are hard-edged flat facets.
- **Hill giant**: a bald, bearded, heavily muscled human at ~2.5x scale: brow ridge,
  pectorals and abdominals, rope belt, ragged loincloth, fur shoulder pad, bare feet with
  toes, a bone club.
- **Green dragon**: chunky faceted body, thick neck, jaw with teeth, big ribbed wings with
  tears, clawed feet, spiked tail.

## Rules drawn from it
1. Exaggerate: bigger heads, heavier shoulders and thighs, thin extremities.
2. Fur and hair are geometry: wedges and clumps, flat-shaded, not surface noise alone.
3. Eyes, teeth and claws are distinct, clean shapes in their own colours.
4. Bone, rock and chitin are flat-shaded; flesh and cloth are smooth.
5. Textures are painted gradients with countershading, never photographic detail.
6. Humanoid monsters are the human body scaled and bulked, with the same face kit.
