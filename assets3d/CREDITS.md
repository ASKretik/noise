# Third-party assets in the 3D game

## Materials (`assets3d/materials/`)

From [ambientCG](https://ambientcg.com/), all **CC0 1.0** (public domain): free for any
use, no credit required, credited here anyway. Downloaded on 2026-11-21 at 1K resolution
(JPG). Each folder keeps three of the set's maps: `color.jpg`, `normal.jpg` (the GL
normal map) and `rough.jpg`.

| Folder | ambientCG asset | Used for (district 1, N4.4 buildings) |
|---|---|---|
| Bricks097 | [Bricks097](https://ambientcg.com/view?id=Bricks097) | old dark brick |
| Bricks051 | [Bricks051](https://ambientcg.com/view?id=Bricks051) | clean red brick |
| Bricks042 | [Bricks042](https://ambientcg.com/view?id=Bricks042) | worn mixed brick |
| Bricks005 | [Bricks005](https://ambientcg.com/view?id=Bricks005) | pale brick |
| PaintedBricks001 | [PaintedBricks001](https://ambientcg.com/view?id=PaintedBricks001) | blue painted brick |
| PaintedBricks003 | [PaintedBricks003](https://ambientcg.com/view?id=PaintedBricks003) | green painted brick |
| Plaster001 | [Plaster001](https://ambientcg.com/view?id=Plaster001) | plaster walls; the base of painted trim |
| Ground107 | [Ground107](https://ambientcg.com/view?id=Ground107) | rough render |
| WoodSiding009 | [WoodSiding009](https://ambientcg.com/view?id=WoodSiding009) | painted weatherboard |
| CorrugatedSteel007A | [CorrugatedSteel007A](https://ambientcg.com/view?id=CorrugatedSteel007A) | garage and workshop sheds |
| Concrete042C | [Concrete042C](https://ambientcg.com/view?id=Concrete042C) | concrete fronts, roofs |
| PaintedWood007B | [PaintedWood007B](https://ambientcg.com/view?id=PaintedWood007B) | peeling painted shopfronts |
| PaintedWood005 | [PaintedWood005](https://ambientcg.com/view?id=PaintedWood005) | black pub fronts, doors |
| Metal041B | [Metal041B](https://ambientcg.com/view?id=Metal041B) | rusty shutters, fire escapes |
| Tiles143 | [Tiles143](https://ambientcg.com/view?id=Tiles143) | tiled stall risers |

## Models (`assets3d/models/`)

From [Poly Haven](https://polyhaven.com/), all **CC0 1.0** (public domain). Downloaded on
2026-11-21 as glTF with 1K textures, unmodified (web3d/art/kit.js re-meshes the kits' flat
walls into rectangles when it loads them; the files themselves are as published). Used for
district 1 from build 41: art/kitbuild.js lays the facade kits out as buildings and dresses
the streets with the props.

| Folder | Poly Haven asset | Author | Used for |
|---|---|---|---|
| modular_urban_apartments_facade | [Modular Urban Apartments Facade](https://polyhaven.com/a/modular_urban_apartments_facade) | James Ray Cock | plaster buildings: wall bays, windows, doors, sill bands, cornices, crowns, plinths, pilasters |
| modular_factory_facade | [Modular Factory Facade](https://polyhaven.com/a/modular_factory_facade) | James Ray Cock | brick buildings, shopfronts, garage doors, yard walls |
| modular_metal_gutter | [Modular Metal Gutter](https://polyhaven.com/a/modular_metal_gutter) | Maxim Domnin | downpipes |
| rollershutter_window_01 | [Rollershutter Window 01](https://polyhaven.com/a/rollershutter_window_01) | MP | shuttered shop windows (and the sprayed variant) |
| exterior_aircon_unit | [Exterior Aircon Unit](https://polyhaven.com/a/exterior_aircon_unit) | Monsta3D | air conditioners under windows |
| metal_trash_can | [Metal Trash Can](https://polyhaven.com/a/metal_trash_can) | GurJas Studios | bins |
| trashbag | [Trashbag](https://polyhaven.com/a/trashbag) | Benny Weimer | rubbish bags |
| barrel_03 | [Barrel 03](https://polyhaven.com/a/barrel_03) | Serhii Khromov | barrels in yards |
| old_tyre | [Old Tyre](https://polyhaven.com/a/old_tyre) | MP | tyres in yards |
| wooden_crate_01 | [Wooden Crate 01](https://polyhaven.com/a/wooden_crate_01) | James Ray Cock | crates in yards and markets |
| utility_box_01 | [Utility Box 01](https://polyhaven.com/a/utility_box_01) | James Ray Cock | street utility boxes |
| water_manhole_cover | [Water Manhole Cover](https://polyhaven.com/a/water_manhole_cover) | Raunox | manholes in the road |
| painted_wooden_bench | [Painted Wooden Bench](https://polyhaven.com/a/painted_wooden_bench) | Kirill Sannikov | benches in squares and parks |
| industrial_wall_lamp | [Industrial Wall Lamp](https://polyhaven.com/a/industrial_wall_lamp) | Kuutti Siitonen | lamps in the dark alleys (its glass is drawn plain, not with transmission) |

## Ground textures (`assets3d/textures/`)

From [Poly Haven](https://polyhaven.com/), **CC0 1.0**, 1K JPG: `diff.jpg`, `nor_gl.jpg` and
`arm.jpg` (ambient occlusion, roughness, metalness) of each. Laid at their real size.

| Folder | Poly Haven asset | Author | Used for |
|---|---|---|---|
| asphalt_02 | [Asphalt 02](https://polyhaven.com/a/asphalt_02) | Rob Tuytel | roads (3 m repeat) |
| concrete_pavement | [Concrete Pavement](https://polyhaven.com/a/concrete_pavement) | Charlotte Baglioni | pavements and kerbs (1.8 m) |
| cobblestone_floor_04 | [Cobblestone Floor 04](https://polyhaven.com/a/cobblestone_floor_04) | Rob Tuytel | squares and markets (1.5 m) |
| grass_path_2 | [Grass Path 2](https://polyhaven.com/a/grass_path_2) | Rob Tuytel | parks (2 m) |
| damaged_concrete_floor | [Damaged Concrete Floor](https://polyhaven.com/a/damaged_concrete_floor) | Rob Tuytel | yards and depots (4.5 m) |
| dirt | [Dirt](https://polyhaven.com/a/dirt) | Charlotte Baglioni | ruins (2 m) |

## Sky (`assets3d/sky/`)

[Kloofendal 48d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky)
by Greg Zaal and Jarod Guest, Poly Haven, **CC0 1.0**.

- `kloofendal_48d_partly_cloudy_puresky_1k.hdr` -- the 1K HDR as published; it lights the
  district (image-based light, web3d/art/daylight.js)
- `kloofendal_48d_sky_4k.jpg` -- made here from the 4K HDR: its upper half, multiplied by
  0.35 and stored as sRGB JPEG (quality 82), so the dome can be sharp without shipping a
  20 MB HDR. The sun sits at the brightest pixel, 47.9 degrees up.

## Build 42: every belt's first district

More of the same, all from [Poly Haven](https://polyhaven.com/), **CC0 1.0**, downloaded on
2026-11-21. Each belt's first district has its own style (web3d/art/hdstyles.js).

Ground textures (`assets3d/textures/`, 1K: `diff.jpg`, `nor_gl.jpg`, `arm.jpg`):

| Folder | Poly Haven asset | Author | Used for |
|---|---|---|---|
| leaves_forest_ground | [Leaves Forest Ground](https://polyhaven.com/a/leaves_forest_ground) | Dario Barresi & Dimitrios Savva | MOSS streets (1.26 m repeat) |
| forest_leaves_02 | [Forest Leaves 02](https://polyhaven.com/a/forest_leaves_02) | Rob Tuytel | MOSS pavements and squares; park hedges in every belt (3 m) |
| burned_ground_01 | [Burned Ground 01](https://polyhaven.com/a/burned_ground_01) | Rob Tuytel | EMBER's ground (1 m) |
| dense_sand | [Dense Sand](https://polyhaven.com/a/dense_sand) | Dimitrios Savva | SOLAR's ground (1.8 m) |
| checkered_pavement_tiles | [Checkered Pavement Tiles](https://polyhaven.com/a/checkered_pavement_tiles) | Amal Kumar | CORAL's pavements and squares (2 m) |
| metal_plate | [Metal Plate](https://polyhaven.com/a/metal_plate) | Rob Tuytel | COBALT's pavements and yards (0.5 m, laid at 1 m) |
| mossy_cobblestone | [Mossy Cobblestone](https://polyhaven.com/a/mossy_cobblestone) | Sơn Nguyễn | JADE's streets (2 m) |
| granite_tile | [Granite Tile](https://polyhaven.com/a/granite_tile) | Charlotte Baglioni | VIOLET's pavements and squares (2.3 m) |

Skies (`assets3d/sky/`): the 1K HDR as published lights the district; the dome is a JPEG
made here from the 4K HDR's upper half (scaled, sRGB, quality 82; the 4K files are not
shipped).

| Files | Poly Haven asset | Authors | Belt |
|---|---|---|---|
| `belfast_sunset_puresky_1k.hdr`, `belfast_sunset_sky_4k.jpg` (x0.09) | [Belfast Sunset (Pure Sky)](https://polyhaven.com/a/belfast_sunset_puresky) | Greg Zaal, Dimitrios Savva & Jarod Guest | RUST |
| `overcast_soil_puresky_1k.hdr`, `overcast_soil_sky_4k.jpg` (x0.31) | [Overcast Soil (Pure Sky)](https://polyhaven.com/a/overcast_soil_puresky) | Jarod Guest & Sergej Majboroda | TIDE |
| `kloofendal_overcast_puresky_1k.hdr`, `kloofendal_overcast_sky_4k.jpg` (x0.26) | [Kloofendal Overcast (Pure Sky)](https://polyhaven.com/a/kloofendal_overcast_puresky) | Greg Zaal | ASH |
| `kloofendal_28d_misty_puresky_1k.hdr`, `kloofendal_28d_misty_sky_4k.jpg` (x0.14) | [Kloofendal 28d Misty (Pure Sky)](https://polyhaven.com/a/kloofendal_28d_misty_puresky) | Greg Zaal & Jenelle van Heerden | CORAL |

MOSS and SOLAR reuse build 41's Kloofendal 48d sky (behind a canopy; behind dust). EMBER,
VIOLET, JADE and COBALT have drawn skies (web3d/art/sky.js), whose light is made from the
drawn dome itself.

## Build 43: district 1 at 2K

The same Poly Haven assets as above (same authors, **CC0 1.0**), downloaded again on
2026-11-25 at 2K for district 1 only:

- `assets3d/models2k/`: the 14 models in "Models" above, glTF at 2K. Geometry is as
  published; every texture was converted from JPEG to KTX2, and the glTF rewritten to use
  `KHR_texture_basisu`.
- `assets3d/textures2k/`: the 7 ground textures district 1 uses (asphalt_02,
  concrete_pavement, cobblestone_floor_04, grass_path_2, damaged_concrete_floor, dirt,
  forest_leaves_02) at 2K, each with its displacement map (`disp`) for parallax, all as
  KTX2.

**The conversion** was made with the [Basis Universal](https://github.com/BinomialLLC/basis_universal)
encoder (Apache-2.0; its WebAssembly build, run once on the development machine, not
shipped):

| Map | Format | Colour space |
|---|---|---|
| Colour | ETC1S | sRGB |
| AO/rough/metal, height | ETC1S | linear |
| Normal maps | UASTC LDR 4x4 + RDO + Zstandard | linear |

Mipmaps are generated. The ground textures are flipped vertically, to match how the game
lays the 1K JPEGs.

**Shipped:** 133 MB of models and 46 MB of ground, 179 MB in all (the 2K JPEGs and PNGs
were 301 MB).

## Build 46: every belt's first district at 2K

The other seven ground textures in "Textures" above (same Poly Haven pages and authors,
**CC0 1.0**), downloaded again on 2026-11-25 at 2K with their displacement maps, for the
first districts of belts 2-10: burned_ground_01, checkered_pavement_tiles, dense_sand,
granite_tile, leaves_forest_ground, metal_plate, mossy_cobblestone. Converted to KTX2
exactly as above, into `assets3d/textures2k/`.

**Shipped:** 39 MB (the 2K JPEGs and PNGs were 112 MB). The 2K models are the build 43
set, shared by all ten districts.
