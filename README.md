# Heartbeat BPM Player

指定したBPMで心音を聴けるWebアプリ。

## 機能

- **心音再生** — 実際の心音サンプルをBPMに合わせてループ再生
- **BPMスライダー** — 40〜200BPMの範囲でリアルタイム変更
- **プリセット** — 安静時(60) / 通常(72) / 運動時(100) / 激しい運動(140)
- **音量調整**
- **ハートアニメーション** — 心音に同期してパルス
- **ECG波形表示** — PQRST波形をリアルタイム描画
- **キーボード操作** — スペースキーで再生/停止

## 起動方法

```bash
npx -y serve . -l 3000
```

ブラウザで http://localhost:3000 を開く。

## ファイル構成

```
ruby-pulsar/
├── index.html      # メインHTML
├── style.css       # ダークテーマUI・アニメーション
├── app.js          # 再生ロジック・ECG描画
├── heartbeat.mp4   # 心音サンプル（1拍分）
└── README.md
```

## 技術スタック

- HTML / CSS / JavaScript（フレームワークなし）
- Web Audio API（`AudioBufferSourceNode` で音源再生）
- Canvas API（ECG波形描画）

## 仕組み

1. `heartbeat.mp4` を `AudioBuffer` に読み込み
2. BPMから拍の間隔を計算（例: 72BPM → 833ms）
3. 先読みスケジューラが正確なタイミングで `AudioBufferSourceNode` を生成・再生
4. 各拍にハートアニメーションとECGスパイクを同期
