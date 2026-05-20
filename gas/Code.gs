/**
 * sk3 人脈マップ - スプレッドシート初期化スクリプト
 *
 * 使い方:
 *   1. Google スプレッドシートを新規作成
 *   2. 拡張機能 > Apps Script を開き、このファイル全文を貼り付け
 *   3. 保存 → 関数 setup を選んで実行(初回は権限承認)
 *   4. 完了後、シートに戻ると「使い方/人/プロジェクト/テーマ/関わり」が出来ている
 *   5. メニュー「sk3」から「サンプルデータ投入」「データ点検」を実行できる
 *
 * 仕様書: docs/spec.md
 */

// ============================================================
// 設定
// ============================================================

const SHEETS = {
  HOWTO: '使い方',
  PEOPLE: '人',
  PROJECTS: 'プロジェクト',
  THEMES: 'テーマ',
  RELATIONS: '関わり',
};

const PEOPLE_HEADERS = [
  'ID', '表示名', '公開名', '立場', 'sk3所属', 'スキル',
  '所属企業', '知り合った日', 'ひとこと',
];
const PROJECTS_HEADERS = [
  'ID', 'プロジェクト名', '公式区分', '発信元', 'オープン',
  '関わりしろ', '概要', 'ステータス',
];
const THEMES_HEADERS = [
  'ID', 'テーマ名', '言い出した人', '説明', '状態', '有効期限',
];
const RELATIONS_HEADERS = [
  '人ID', '対象種別', '対象ID', '関わり方',
];

const ENUMS = {
  立場: ['事務局', 'コアメン', 'フォロワー'],
  sk3所属: ['あり', 'なし(外部)'],
  スキル: ['デザイン', '編集', '撮影', 'ライティング', 'エンジニア', '企画', '広報', '場づくり'],
  公式区分: ['公式', '非公式'],
  発信元: ['sk3発', '外部発'],
  オープン: ['オープン', 'クローズ'],
  ステータス: ['構想中', '進行中', '完了', '保留'],
  状態: ['募集中', '実現した', '終了'],
  対象種別: ['プロジェクト', 'テーマ'],
  関わり方: ['コア', 'メンバー', '関心あり'],
};

const ID_PREFIX = { PEOPLE: 'P', PROJECTS: 'PJ', THEMES: 'T' };

// ============================================================
// エントリポイント
// ============================================================

/** メイン: シート構造を作成。既存シートがあっても安全に再実行可。 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEETS.HOWTO, buildHowtoRows_());
  ensureSheet_(ss, SHEETS.PEOPLE, [PEOPLE_HEADERS]);
  ensureSheet_(ss, SHEETS.PROJECTS, [PROJECTS_HEADERS]);
  ensureSheet_(ss, SHEETS.THEMES, [THEMES_HEADERS]);
  ensureSheet_(ss, SHEETS.RELATIONS, [RELATIONS_HEADERS]);

  applyValidations_(ss);
  formatHeaders_(ss);
  freezeHeaders_(ss);
  removeDefaultSheet_(ss);

  SpreadsheetApp.getUi().alert(
    '初期化が完了しました。\n\n' +
    'メニュー「sk3」から「サンプルデータ投入」を実行できます。\n' +
    '行を追加すると ID 列が自動採番されます。'
  );
}

/** 開いた時に sk3 メニューを生やす */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('sk3')
    .addItem('初期化(シート構造を作る)', 'setup')
    .addItem('サンプルデータ投入', 'insertSampleData')
    .addSeparator()
    .addItem('データ点検(エラーレポート)', 'validateData')
    .addToUi();
}

// ============================================================
// シート生成・整形
// ============================================================

function ensureSheet_(ss, name, rows) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0 && rows && rows.length) {
    sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  }
  return sh;
}

function formatHeaders_(ss) {
  [SHEETS.PEOPLE, SHEETS.PROJECTS, SHEETS.THEMES, SHEETS.RELATIONS].forEach(name => {
    const sh = ss.getSheetByName(name);
    const lastCol = sh.getLastColumn();
    if (lastCol === 0) return;
    const header = sh.getRange(1, 1, 1, lastCol);
    header.setFontWeight('bold')
      .setBackground('#1f2937')
      .setFontColor('#ffffff');
    sh.autoResizeColumns(1, lastCol);
  });
}

function freezeHeaders_(ss) {
  [SHEETS.PEOPLE, SHEETS.PROJECTS, SHEETS.THEMES, SHEETS.RELATIONS].forEach(name => {
    ss.getSheetByName(name).setFrozenRows(1);
  });
}

function removeDefaultSheet_(ss) {
  const sh = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (sh && ss.getSheets().length > 1) ss.deleteSheet(sh);
}

// ============================================================
// 入力規則(プルダウン)
// ============================================================

function applyValidations_(ss) {
  const people = ss.getSheetByName(SHEETS.PEOPLE);
  setListValidation_(people, '立場', ENUMS.立場);
  setListValidation_(people, 'sk3所属', ENUMS.sk3所属);
  setListValidation_(people, 'スキル', ENUMS.スキル); // 簡易版: 単一選択。複数可は実運用で multi-line 入力で

  const projects = ss.getSheetByName(SHEETS.PROJECTS);
  setListValidation_(projects, '公式区分', ENUMS.公式区分);
  setListValidation_(projects, '発信元', ENUMS.発信元);
  setListValidation_(projects, 'オープン', ENUMS.オープン);
  setListValidation_(projects, 'ステータス', ENUMS.ステータス);

  const themes = ss.getSheetByName(SHEETS.THEMES);
  setListValidation_(themes, '状態', ENUMS.状態);
  setRangeValidation_(themes, '言い出した人', people, 'ID');

  const relations = ss.getSheetByName(SHEETS.RELATIONS);
  setListValidation_(relations, '対象種別', ENUMS.対象種別);
  setListValidation_(relations, '関わり方', ENUMS.関わり方);
  setRangeValidation_(relations, '人ID', people, 'ID');
  // 対象ID は プロジェクト/テーマ どちらも参照しうるため、データ入力規則は付けず
  // ヘッダにメモを付ける。整合性は「sk3 > データ点検」で実態をチェック。
  annotateHeader_(relations, '対象ID',
    'プロジェクト ID または テーマ ID を入れる(例: PJ001, T001)。\n' +
    '存在しない ID は sk3 > データ点検 で警告される。');
}

function setListValidation_(sheet, headerName, list) {
  const col = colIndex_(sheet, headerName);
  if (!col) return;
  const range = sheet.getRange(2, col, sheet.getMaxRows() - 1, 1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(list, true)
    .setAllowInvalid(false)
    .build();
  range.setDataValidation(rule);
}

function setRangeValidation_(sheet, headerName, refSheet, refHeaderName) {
  const col = colIndex_(sheet, headerName);
  const refCol = colIndex_(refSheet, refHeaderName);
  if (!col || !refCol) return;
  const refRange = refSheet.getRange(2, refCol, refSheet.getMaxRows() - 1, 1);
  const range = sheet.getRange(2, col, sheet.getMaxRows() - 1, 1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(refRange, true)
    .setAllowInvalid(true) // 一時的な不整合は許容、validateData で点検
    .build();
  range.setDataValidation(rule);
}

/** ヘッダセルにノート(コメント)を付ける */
function annotateHeader_(sheet, headerName, note) {
  const col = colIndex_(sheet, headerName);
  if (!col) return;
  sheet.getRange(1, col).setNote(note);
}

function colIndex_(sheet, headerName) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const i = headers.indexOf(headerName);
  return i === -1 ? 0 : i + 1;
}

// ============================================================
// ID 自動採番(行を追加すると ID 列が空なら埋める)
// ============================================================

function onEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  const name = sh.getName();
  const map = {
    [SHEETS.PEOPLE]: ID_PREFIX.PEOPLE,
    [SHEETS.PROJECTS]: ID_PREFIX.PROJECTS,
    [SHEETS.THEMES]: ID_PREFIX.THEMES,
  };
  const prefix = map[name];
  if (!prefix) return;

  const row = e.range.getRow();
  if (row < 2) return;
  const idCol = colIndex_(sh, 'ID');
  if (!idCol) return;

  const idCell = sh.getRange(row, idCol);
  if (idCell.getValue()) return;

  // その他の列に何か入力されたタイミングで採番
  const rowValues = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0];
  const hasContent = rowValues.some((v, i) => i + 1 !== idCol && String(v).trim() !== '');
  if (!hasContent) return;

  idCell.setValue(nextId_(sh, idCol, prefix));
}

function nextId_(sh, idCol, prefix) {
  const last = sh.getLastRow();
  if (last < 2) return `${prefix}001`;
  const ids = sh.getRange(2, idCol, last - 1, 1).getValues().flat();
  let max = 0;
  ids.forEach(v => {
    const m = String(v).match(new RegExp(`^${prefix}(\\d+)$`));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

// ============================================================
// サンプルデータ
// ============================================================

function insertSampleData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const people = ss.getSheetByName(SHEETS.PEOPLE);
  const projects = ss.getSheetByName(SHEETS.PROJECTS);
  const themes = ss.getSheetByName(SHEETS.THEMES);
  const relations = ss.getSheetByName(SHEETS.RELATIONS);

  if (people.getLastRow() > 1) {
    const ui = SpreadsheetApp.getUi();
    const res = ui.alert('サンプル投入', '既にデータがあります。続けますか?', ui.ButtonSet.YES_NO);
    if (res !== ui.Button.YES) return;
  }

  appendRows_(people, [
    ['P001', '山田 太郎', 'M01', '事務局',     'あり',       'デザイン',     'sk3', '2023-04', '事務局担当。場づくりが好き。'],
    ['P002', '佐藤 花子', 'M02', 'コアメン',   'あり',       '編集',         'sk3', '2023-06', '雑誌の編集をしています。'],
    ['P003', '鈴木 健',   'M03', 'コアメン',   'あり',       'エンジニア',   '外部', '2023-09', 'Web 開発が本業。'],
    ['P004', '田中 美咲', 'M04', 'フォロワー', 'あり',       '撮影',         'sk3', '2024-01', '写真と旅が好き。'],
    ['P005', '高橋 翔',   'M05', 'フォロワー', 'あり',       'ライティング', '外部', '2024-03', '記事を書きます。'],
    ['P006', '伊藤 結衣', 'M06', 'コアメン',   'あり',       '企画',         'sk3', '2023-11', '企画屋。'],
    ['P007', '渡辺 蓮',   'M07', 'フォロワー', 'なし(外部)', '広報',         '外部', '2024-05', '広報の知見あり。'],
    ['P008', '中村 葵',   'M08', 'フォロワー', 'あり',       '場づくり',     'sk3', '2024-02', 'イベント運営。'],
  ]);

  appendRows_(projects, [
    ['PJ001', 'sk3 マガジン', '公式',   'sk3発',  'オープン',   '編集・ライティング・撮影できる人歓迎', 'コミュニティ誌の編集と発行', '進行中'],
    ['PJ002', '能登 視察',     '非公式', '外部発', 'オープン',   '一緒に行きたい人募集',                'コミュニティで能登に視察に行く', '構想中'],
    ['PJ003', '関係図 開発',   '公式',   'sk3発',  'クローズ',   '',                                    'この人脈マップ自体の開発',     '進行中'],
  ]);

  appendRows_(themes, [
    ['T001', '能登に視察に行きたい',       'P006', '震災後の能登の今を見に行きたい',  '募集中',  '2026-12-31'],
    ['T002', '地域の編集者を集めたい',     'P002', '地域メディアを動かす人達の会',    '募集中',  ''],
    ['T003', '焚き火を囲んで話したい',     'P004', '会話だけのイベントをやりたい',    '募集中',  '2026-09-30'],
    ['T004', '夏のリトリート',             'P001', '実現済み',                        '実現した', '2025-08-31'],
  ]);

  appendRows_(relations, [
    ['P001', 'プロジェクト', 'PJ001', 'コア'],
    ['P002', 'プロジェクト', 'PJ001', 'コア'],
    ['P005', 'プロジェクト', 'PJ001', 'メンバー'],
    ['P004', 'プロジェクト', 'PJ001', '関心あり'],
    ['P006', 'プロジェクト', 'PJ002', 'コア'],
    ['P003', 'プロジェクト', 'PJ002', 'メンバー'],
    ['P008', 'プロジェクト', 'PJ002', '関心あり'],
    ['P003', 'プロジェクト', 'PJ003', 'コア'],
    ['P001', 'プロジェクト', 'PJ003', 'メンバー'],
    ['P006', 'テーマ',       'T001',  'コア'],
    ['P004', 'テーマ',       'T001',  '関心あり'],
    ['P008', 'テーマ',       'T001',  '関心あり'],
    ['P002', 'テーマ',       'T002',  'コア'],
    ['P005', 'テーマ',       'T002',  '関心あり'],
    ['P004', 'テーマ',       'T003',  'コア'],
    ['P007', 'テーマ',       'T003',  '関心あり'],
    ['P001', 'テーマ',       'T004',  'コア'],
  ]);

  SpreadsheetApp.getUi().alert('サンプルデータを投入しました。');
}

function appendRows_(sh, rows) {
  if (!rows.length) return;
  const start = sh.getLastRow() + 1;
  sh.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
}

// ============================================================
// データ点検(セクション 5)
// ============================================================

function validateData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const errors = [];

  const people = readAsObjects_(ss.getSheetByName(SHEETS.PEOPLE));
  const projects = readAsObjects_(ss.getSheetByName(SHEETS.PROJECTS));
  const themes = readAsObjects_(ss.getSheetByName(SHEETS.THEMES));
  const relations = readAsObjects_(ss.getSheetByName(SHEETS.RELATIONS));

  const requiredP = ['ID', '表示名', '立場', 'sk3所属'];
  const requiredPJ = ['ID', 'プロジェクト名', '公式区分', '発信元', 'オープン'];
  const requiredT = ['ID', 'テーマ名', '状態'];
  const requiredR = ['人ID', '対象種別', '対象ID', '関わり方'];

  checkRequired_(people, requiredP, '人', errors);
  checkRequired_(projects, requiredPJ, 'プロジェクト', errors);
  checkRequired_(themes, requiredT, 'テーマ', errors);
  checkRequired_(relations, requiredR, '関わり', errors);

  checkDuplicateIds_(people, '人', errors);
  checkDuplicateIds_(projects, 'プロジェクト', errors);
  checkDuplicateIds_(themes, 'テーマ', errors);

  const peopleIds = new Set(people.map(r => r.ID));
  const projectIds = new Set(projects.map(r => r.ID));
  const themeIds = new Set(themes.map(r => r.ID));

  relations.forEach((r, i) => {
    if (r.人ID && !peopleIds.has(r.人ID)) {
      errors.push(`[関わり 行${i + 2}] 人ID "${r.人ID}" が存在しない`);
    }
    if (r.対象種別 === 'プロジェクト' && r.対象ID && !projectIds.has(r.対象ID)) {
      errors.push(`[関わり 行${i + 2}] 対象ID "${r.対象ID}" がプロジェクトに存在しない`);
    }
    if (r.対象種別 === 'テーマ' && r.対象ID && !themeIds.has(r.対象ID)) {
      errors.push(`[関わり 行${i + 2}] 対象ID "${r.対象ID}" がテーマに存在しない`);
    }
  });

  const msg = errors.length === 0
    ? '✅ 問題は見つかりませんでした。'
    : `⚠️ ${errors.length} 件のエラー:\n\n` + errors.join('\n');
  SpreadsheetApp.getUi().alert('データ点検結果', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

function checkRequired_(rows, required, sheetLabel, errors) {
  rows.forEach((r, i) => {
    required.forEach(col => {
      if (!String(r[col] || '').trim()) {
        errors.push(`[${sheetLabel} 行${i + 2}] 必須列 "${col}" が空`);
      }
    });
  });
}

function checkDuplicateIds_(rows, sheetLabel, errors) {
  const seen = new Map();
  rows.forEach((r, i) => {
    const id = r.ID;
    if (!id) return;
    if (seen.has(id)) {
      errors.push(`[${sheetLabel}] ID "${id}" が重複(行${seen.get(id) + 2} と 行${i + 2})`);
    } else {
      seen.set(id, i);
    }
  });
}

function readAsObjects_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const values = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  return values.map(row => {
    const o = {};
    headers.forEach((h, i) => o[h] = row[i]);
    return o;
  });
}

// ============================================================
// 「使い方」シート
// ============================================================

function buildHowtoRows_() {
  return [
    ['sk3 人脈マップ 使い方'],
    [''],
    ['このシートはコミュニティの「人・プロジェクト・テーマ」の関係を可視化する Web 関係図の元データです。'],
    ['書いた内容は、Web 関係図に反映されます(リロード時に最新化)。'],
    [''],
    ['【書く場所】'],
    ['  人        … 1 行 = 1 人。自分の情報を書く。'],
    ['  プロジェクト … 既にあるものに参加表明したい場合、まずは「関わり」シートに書くだけで OK。'],
    ['  テーマ     … 「やってみたい」「視察に行きたい」を呼びかけとして置く。'],
    ['  関わり    … 自分(人ID)と、参加したいプロジェクト/テーマを結ぶ。'],
    [''],
    ['【関わり方の選び方】'],
    ['  コア      … 中心メンバー。太い線で表現される。'],
    ['  メンバー  … 通常参加。'],
    ['  関心あり  … 「気になる」「乗ってみたい」レベル。フル参加しなくても点で参加できる。'],
    [''],
    ['【書ける範囲で書く】'],
    ['  全ての列を埋める必要はない。必須は ID/表示名/立場/sk3所属(人)、ID/テーマ名/状態(テーマ)など。'],
    [''],
    ['【ID は自動】'],
    ['  「ID」列は空のままで OK。何か入力すると自動で採番される(P001, PJ001, T001 など)。'],
    [''],
    ['【点検】'],
    ['  上のメニュー「sk3 > データ点検」で、空欄や ID 不一致などをチェックできる。'],
  ];
}
