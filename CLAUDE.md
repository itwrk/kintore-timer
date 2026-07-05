# 筋トレタイマー(Tempo Training PWA)

テンポ管理(引く◯秒/キープ/伸ばす◯秒)付きの個人用筋トレタイマー。
GitHub Pagesで公開し、iPhone(ホーム画面追加)とMacで使用。記録はNotionに自動送信される。

- 公開URL: https://itwrk.github.io/kintore-timer/
- リポジトリ: https://github.com/itwrk/kintore-timer

## ファイル構成

| ファイル | 役割 |
|---|---|
| `tempo-training.jsx` | アプリ本体(React)。**修正は基本ここ** |
| `entry.jsx` | エントリーポイント + localStorage版 window.storage シム |
| `app.js` | ビルド成果物。**直接編集しない** |
| `index.html` / `manifest.json` / `sw.js` / `icon-*.png` | PWAの配信ファイル |
| `gas-notion-proxy.gs` | Notion送信用GASコード(参照用。GAS側に別途デプロイ済み) |

## ビルドとデプロイ

```bash
npm install        # 初回のみ
npm run build      # entry.jsx → app.js (esbuild)
```

デプロイ = main ブランチへの push(GitHub Pagesが1〜2分で自動反映)。

## 修正時の必須ルール

1. コード修正は `tempo-training.jsx` / `entry.jsx` に対して行い、`npm run build` で `app.js` を再生成する
2. 配信ファイル(app.js / index.html / sw.js / manifest.json / icon)を変更したら、**`sw.js` の `CACHE` バージョン(`kt-vN`)を必ず+1する**(利用端末のキャッシュを更新させるため。忘れると変更が反映されない)
3. コミットメッセージは日本語で簡潔に(例: `切り返し発光を強化`)
4. push前に `npm run build` が通ることを確認する

## 設計メモ

- 保存: `window.storage` シム(localStorage)。キーは `kt-exercises`({version:2, list:[...]}形式)、`kt-logs`、`kt-webhook`
- Notion連携: 保存時にGAS WebhookへPOST。URLはアプリの⚙画面で端末ごとに設定(コードに埋め込まない)。送信失敗時は `synced:false` で保持し⚙から再送可能
- Notion DB「筋トレログ」: プロパティ名は GAS 側と完全一致が必要(名前/日付/種目/テンポ/セット詳細/合計レップ/総挙上量kg/平均RPE/メモ)
- 演出(コンボ・粒子バースト・振動・発光)はオーナーの好みで調整頻度が高い領域。ADHDフレンドリーな「報酬感」重視の設計方針
- RPEは5段階(楽勝〜限界)。セット数のデフォルトは3
- 効果音はWeb Audio、振動は navigator.vibrate(iOS Safari非対応)
- ローカル確認は `python3 -m http.server` などで index.html を配信すればOK(file://だとService Workerが動かない)

## オーナーについて

- 非エンジニアだがGAS/Make/API連携の経験豊富。説明は簡潔でOK
- 破壊的変更(データ形式の変更など)をする場合は、既存localStorageデータのマイグレーション処理を必ず入れる
