"""Field wardrobe patterns, in roster order. Colours are sRGB swatches."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Design:
    cut: str
    outfit: str
    shell: str
    panel: str
    accent: str
    trouser: str
    # Lower-jaw width gain, chin lift, cheek gain, shoulder, rib, hip and seat allowance (mm).
    sculpt: tuple
    # Upper edge, lower edge and tilt of the outer torso panel, metres on a 1.70 m form.
    jacket: tuple
    pocket_side: int
    boot: str


DESIGNS = {
    "reina_cross": Design(
        "wrap",
        "ボルドーの斜め合わせジャケット、墨黒のパンツとショートブーツ",
        "#733245",
        "#342b38",
        "#e2bba0",
        "#343340",
        (6, 3.0, 1.5, 5, 3, 5, 6),
        (1.322, 1.026, 0.075),
        -1,
        "boot",
    ),
    "misaki_veil": Design(
        "pleat",
        "スレートの短いプリーツベスト、チャコールのロールネックとスリムパンツ",
        "#3f5560",
        "#283544",
        "#a6c9ba",
        "#343e4b",
        (4.5, 4.0, 3, -2, 3, 3, 3),
        (1.257, 1.008, 0.016),
        1,
        "boot",
    ),
    "selina_voltage": Design(
        "track",
        "コバルトのクロップジャージー、切り替えショーツとインナータイツ",
        "#2552a2",
        "#172e52",
        "#89dcd4",
        "#334159",
        (5.2, 2.4, 2, 7, 6, 2, 4),
        (1.314, 1.138, -0.043),
        -1,
        "trainer",
    ),
    "ayame_blaze": Design(
        "work",
        "錆赤のワークジャケット、補強膝とマチ付きポケットのパンツ",
        "#a05138",
        "#4c3c38",
        "#e9b878",
        "#414440",
        (7.2, 2.0, 1.2, 8, 6, 1, 5),
        (1.342, 1.032, 0),
        1,
        "boot",
    ),
    "noel_sky": Design(
        "court",
        "アイボリーとネイビーのコートベスト、独立した腿パネルのランショーツ",
        "#dedbd1",
        "#344961",
        "#c37758",
        "#354557",
        (4.4, 3.6, 2.4, 4, 3, 2, 3),
        (1.302, 1.058, 0.004),
        1,
        "trainer",
    ),
    "karen_lux": Design(
        "double",
        "象牙色のスクエアネック・ダブルベスト、オリーブグレーのパンツ",
        "#e4d6ba",
        "#817460",
        "#654e40",
        "#4a514c",
        (5.8, 3.5, 2.6, -1, 4, 7, 7),
        (1.325, 1.012, -0.012),
        -1,
        "boot",
    ),
    "yurina_mirage": Design(
        "bias",
        "プラムのワンショルダーと斜めのショートベスト、黒紫のライディングパンツ",
        "#68425e",
        "#373244",
        "#cda2ae",
        "#3c3545",
        (5.8, 2.7, 1.6, 2, 3, 6, 5),
        (1.306, 1.043, -0.064),
        1,
        "boot",
    ),
}
