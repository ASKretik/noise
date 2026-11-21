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
