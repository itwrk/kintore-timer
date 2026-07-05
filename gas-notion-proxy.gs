/**
 * 筋トレタイマー → Notion 記録用プロキシ(Google Apps Script)
 *
 * ■ セットアップ手順
 * 1. Notionで記録用データベースを作成し、以下のプロパティを用意する
 *    (名前は完全一致で。型を間違えると失敗します)
 *      名前        … タイトル
 *      日付        … 日付
 *      種目        … セレクト
 *      テンポ      … テキスト
 *      セット詳細  … テキスト
 *      合計レップ  … 数値
 *      総挙上量kg  … 数値
 *      平均RPE     … 数値
 *      メモ        … テキスト
 *
 * 2. https://www.notion.so/my-integrations で新規インテグレーションを作成し、
 *    「内部インテグレーションシークレット」(ntn_… または secret_…)をコピー
 *
 * 3. 作成したNotion DBを開き、右上「…」→「接続」→ 作成したインテグレーションを追加
 *    (これを忘れると 404 になります)
 *
 * 4. script.google.com で新規プロジェクトを作成し、このコードを貼り付け
 *
 * 5. 左メニュー「プロジェクトの設定」→「スクリプト プロパティ」に2つ追加:
 *      NOTION_TOKEN  = 手順2のシークレット
 *      NOTION_DB_ID  = DBのID(DBをフルページで開いた時のURLにある32桁の英数字。
 *                       https://notion.so/xxxxx?v=yyy の xxxxx 部分)
 *
 * 6. 「デプロイ」→「新しいデプロイ」→ 種類:「ウェブアプリ」
 *      次のユーザーとして実行: 自分
 *      アクセスできるユーザー: 全員
 *    → デプロイ → 発行された「ウェブアプリのURL」(…/exec)をコピー
 *
 * 7. 筋トレタイマーの ⚙(Notion連携)画面にURLを貼り付け → テスト送信 → 保存
 *
 * ※ コードを修正したら「デプロイを管理」から既存デプロイを「編集→新バージョン」で
 *    更新すること(URLが変わらずに済みます)
 */

const NOTION_VERSION = "2022-06-28";

function doPost(e) {
  let result;
  try {
    const p = JSON.parse(e.postData.contents);
    result = createNotionPage_(p);
  } catch (err) {
    result = { ok: false, error: String(err) };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function createNotionPage_(p) {
  const sp = PropertiesService.getScriptProperties();
  const token = sp.getProperty("NOTION_TOKEN");
  const dbId = sp.getProperty("NOTION_DB_ID");
  if (!token || !dbId) return { ok: false, error: "NOTION_TOKEN / NOTION_DB_ID が未設定です" };

  const title = `${p.exercise} ${String(p.date || "").slice(0, 10)}`;
  const props = {
    "名前": { title: [{ text: { content: title } }] },
    "日付": { date: { start: p.date } },
    "種目": { select: { name: p.exercise } },
    "テンポ": { rich_text: [{ text: { content: p.tempo || "" } }] },
    "セット詳細": { rich_text: [{ text: { content: p.setsText || "" } }] },
  };
  if (p.totalReps != null) props["合計レップ"] = { number: p.totalReps };
  if (p.volume != null) props["総挙上量kg"] = { number: p.volume };
  if (p.avgRpe != null) props["平均RPE"] = { number: p.avgRpe };
  if (p.memo) props["メモ"] = { rich_text: [{ text: { content: p.memo } }] };

  const res = UrlFetchApp.fetch("https://api.notion.com/v1/pages", {
    method: "post",
    contentType: "application/json",
    headers: {
      "Authorization": "Bearer " + token,
      "Notion-Version": NOTION_VERSION,
    },
    payload: JSON.stringify({ parent: { database_id: dbId }, properties: props }),
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  return code < 300
    ? { ok: true }
    : { ok: false, status: code, body: res.getContentText().slice(0, 300) };
}

/** GASエディタ上での動作確認用(実行→ログでNotion側の応答を確認できます) */
function testCreate() {
  const result = createNotionPage_({
    exercise: "接続テスト",
    date: new Date().toISOString(),
    tempo: "引く2秒/伸ばす3秒",
    setsText: "S1 40kg×10 RPE3 / S2 40kg×10 RPE4",
    totalReps: 20,
    volume: 800,
    avgRpe: 3.5,
    memo: "GASエディタからのテスト",
  });
  Logger.log(result);
}
