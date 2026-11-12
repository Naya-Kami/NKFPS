# 3D Map モジュール

NKFPSが最終的にオンラインFPSゲームになるための、ワールドとマップ探索の土台です。描画・マップデータ・建築・移動物理・探索画面をこのフォルダーに集約しています。

## 入口

- `startMapExplorer()`：現在のマップ閲覧・探索画面を起動。`src/main.js` から1回呼び出します。
- `createWorld(container, onProgress)`：Three.jsのワールドを生成。`setMap`、`enter`、`setView`、`setQuality`と `dispose()` などの操作を返します。終了時は `dispose()` で描画ループとGPU資源を解放します。
- `getMap(id)` / `MAP_IDS`：3枚のマップ定義を取得します。
- `createPhysicsWorld` / `stepPlayer` / `PLAYER`：移動物理とプレイヤー寸法を共有します。

公開入口は `index.js` です。ブラウザーUIは `explorer.js`、画像から読み取った配置は `maps/data/`、描画は `world.js`、衝突と重力は `maps/physics.js` が担当します。材質・装飾の追加で通路を変える場合も、表示と当たり判定をそろえて既存の移動テストを確認してください。

## 将来のFPS機能との境界

射撃、武器、マッチ進行、オンライン同期は今後の実装です。これらのコードを地形生成や探索UIへ直接混ぜず、別のゲーム用モジュールから必要なマップ・描画・移動APIを使用する構成へ発展させます。

素材はリポジトリ共通の `public/assets/`、提供画像は `public/references/` にあります。ライセンスと原図の扱いはルートREADMEと `public/THIRD_PARTY.md` を参照してください。

`maps/propAssets.js` はローカルのGLBを読み込み、接地と縦横比を保った配置・積み付け・インスタンス描画を担当します。テクスチャはワールド単位で共有し、マップ切り替え時には複製した形状と材質だけを解放します。`maps/train.js` は列車の形状、内装、足回りと、図の線路中心を保った軌間の補正を担当します。小物の当たり判定は配置後の実寸に合わせて `model.js` から登録します。

## 確認

リポジトリのルートで `npm run check`、`npm test`、`npm run build` を実行します。マップの外形・主要区画・出現位置と、階段の往復テストを維持してください。
