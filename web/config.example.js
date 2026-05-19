/**
 * sk3 関係図 設定
 *
 * このファイルを config.js としてコピーし、自分のスプレッドシートの値で書き換えてください。
 * (config.js は .gitignore で除外されます)
 *
 * スプレッドシート ID:
 *   https://docs.google.com/spreadsheets/d/【ココ】/edit のココ部分。
 *
 * 各シートの gid:
 *   スプレッドシートでシートタブを開くと URL に "#gid=123456789" が出る。その数字。
 *
 * 公開設定:
 *   ファイル > 共有 > ウェブに公開 で「ドキュメント全体」を CSV で公開する。
 *   (各シートを個別に「CSV」形式で公開する必要はない。ドキュメント全体を公開すれば
 *    export エンドポイント経由で gid 指定の CSV が取れる。)
 */

window.SK3_CONFIG = {
  spreadsheetId: 'YOUR_SPREADSHEET_ID',
  gids: {
    people: 0,            // 「人」シートの gid
    projects: 0,          // 「プロジェクト」シート
    themes: 0,            // 「テーマ」シート
    relations: 0,         // 「関わり」シート
  },
  // 内部ビューのみ(現状)。公開ビューは将来対応。
  view: 'internal',
};
