# Original pixel-art assets

Generated with built-in image_gen. Reference screenshots inspected visually and used only as stylistic guidance; original environment, characters and icons requested. Exactly one generation request per asset; no variants or retries.

## arena

```text
Use case: stylized-concept
Asset type: landscape pixel-art battle-arena background for a browser match-3 roguelike.
Primary request: exactly ONE original environment image, 1536x1024 landscape (3:2). A side-view cyan-blue stone crypt arena with warm honey-colored wood and bronze trim, green vines, and deep purple shadows. Reference screenshots previously inspected are stylistic guidance only: use their lively saturated cyan, bronze, green, and purple palette, chunky outlined pixel clusters, charming compact retro atmosphere. Do not reproduce the screenshot composition or any copyrighted character.
Composition: side elevation, stage-like room, clear horizontal uninterrupted flat stone floor across the bottom 25% of the scene. Wall behind the fighters with broad readable blue stone blocks, simple shallow recessed arch, warm wooden/bronze horizontal trim along upper edge and side pillars. Decorative vines primarily along far left, far right and upper wall. The center and floor must remain spacious and uncluttered so two sprites can fight there. No furniture or foreground objects obscuring the floor.
Style: genuine crisp low-resolution retro pixel art, as though drawn at 384x256 then enlarged exactly 4x with nearest-neighbor. Every contour and color region consists of square, hard-edged pixels; visible blocky clusters, bold near-black/dark-purple outlines, limited saturated palette, stepped highlights. Flat game-background perspective, not isometric.
Constraints: no characters, no enemies, no items, no user interface, no text, no symbols, no logo, no watermark. No soft painterly rendering, no gradients, no smooth vector curves, no blur, no antialiasing, no photorealism. Return one complete rectangular background.
```

## actors

```text
Use case: stylized-concept
Asset type: pixel-art actor sprite atlas for a six-pose battle animation system.
Primary request: exactly ONE atlas, EXACTLY 3 columns by 4 rows = TWELVE separate full-body sprite poses, in this exact reading order. Canvas 1536x2048, each cell 512x512. Keep invisible equal cell boundaries and generous empty gutters: all sprite pixels stay at least 48 pixels from every cell edge. Pure solid white #FFFFFF background. No grid lines, no cell labels, no text. Each pose alone in its cell, no extra sprite or effect object in gutters.
ROW 1, LEFT TO RIGHT: heroic original azure-armored short knight facing RIGHT, (1) idle, (2) windup with sword raised back, (3) rightward sword strike.
ROW 2: the SAME azure knight facing RIGHT, (4) guard with shield forward, (5) hurt recoiling, (6) defeated collapsed low on the ground.
ROW 3: original skeleton rival in BRONZE armor facing LEFT, (1) idle, (2) windup with sword raised back, (3) leftward sword strike.
ROW 4: the SAME bronze skeleton facing LEFT, (4) guard, (5) hurt recoiling, (6) defeated collapsed low on the ground.
Character identity: hero is chibi, compact, expressive, own rounded angular steel-blue helmet with dark horizontal visor, small cyan highlights and a red scarf; NO HORNS on helmet, no shovel. Azure armor, modest bronze fastenings, cyan short sword and blue shield. Rival is a chibi skeleton with readable ivory skull and black eye sockets, bronze shoulder armor, purple cloth accent, simple short sword and small bronze shield. Original designs, do not copy Shovel Knight or any existing copyrighted character.
Alignment: consistent scale and identity across six poses for each actor. Standing poses about 300 pixels tall. All twelve poses fully within cells. Feet/ground-contact baseline at the same local y=432 in every cell, including collapsed poses. Center each figure around local x=256, reserving adequate lateral space for attack weapons.
Style: genuine retro pixel art as though each square cell is a 64x64 pixel sprite canvas enlarged 8x with nearest-neighbor. Square hard-edged block clusters and bold very dark outlines, limited saturated palette, readable at small scale. Cyan/blue, bronze/gold, ivory, green and purple-shadow palette inspired only by the inspected game screenshots, not their actual assets.
Avoid: antialiasing, soft shading, blurry edges, glow, smooth vector curves, painterly rendering, checkerboard background, shadows cast outside the sprite, any text, duplicate poses, mixed facing direction, extra cells. Exactly twelve sprites in a clean 3x4 atlas.
```

## icons

```text
Use case: stylized-concept
Asset type: inventory and match-3 tile pixel-art icon atlas.
Primary request: exactly ONE atlas, EXACTLY 4 columns by 3 rows = TWELVE individual icons, equal SQUARE cells in this exact reading order. Canvas 2048x1536, each invisible cell 512x512. Pure solid white #FFFFFF background. Every icon centered in its square cell and about 288x288 pixels, with at least 80 pixels of blank margin between silhouette and every cell edge. No visible grid or tile panels. No text, labels or numbers.
ROW 1, LEFT TO RIGHT: cyan sword; blue shield; purple lightning crystal; GOLD FOUR-POINT FOCUS STAR (exactly four long sharp points, like a compass sparkle).
ROW 2: green venom dagger; red spherical bomb with short fuse; red heart; gold coin.
ROW 3: red potion bottle with cork; brown-and-gold treasure chest; golden royal crown; YELLOW FIVE-POINT STAR (exactly five points, unmistakably distinct from the four-point focus star).
Style: crisp genuine retro game pixel art, each icon designed as a readable 32x32 sprite and enlarged with nearest-neighbor. Hard near-black/dark-purple outlines, square stepped pixel edges and chunky clusters, tiny blocky highlight patches, limited saturated palette. Cyan, blue, purple, warm bronze/gold, ruby red and green. Use the inspected screenshots only for lively pixel-art mood and palette, not copied assets.
Each icon recognizable at 32px. The dagger is short, tilted and GREEN; sword is longer and CYAN. Shield has a strong blue silhouette. Potion has visible red contents and bottle neck. Crystal is faceted purple with lightning-shaped core. No soft glow or effects extending into margins.
Constraints: exactly twelve isolated icons in a 4x3 grid with generous whitespace. No antialiasing, no gradients, no smooth vector art, no blurry painterly rendering, no checkerboard, no cast shadows, no tile background, no logos, no watermark, no extra objects.
```
