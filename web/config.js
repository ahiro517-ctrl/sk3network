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
  spreadsheetId: '1qSEBcQ5axEJcru0Wt7FcmSmPQsxYJMPWxf2lQrPs7dA',
  gids: {
    people: 617276124,            // 「人」シートの gid
    projects: 84753202,          // 「プロジェクト」シート
    themes: 1052286291,            // 「テーマ」シート
    relations: 1519228282,         // 「関わり」シート
  },
  // 内部ビューのみ(現状)。公開ビューは将来対応。
  view: 'internal',
};
