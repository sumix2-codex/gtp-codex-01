const DEFAULT_SHEET_NAME = '出退勤ログ';
const SECRET_PROPERTY_KEY = 'ATTENDANCE_API_SECRET';

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || '{}');
    if (payload.action !== 'recordAttendance') {
      return jsonResponse({ ok: false, error: 'Unsupported action' });
    }

    validateSecret(payload.secret);
    appendAttendanceRecord(payload.spreadsheetId, payload.record);
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, error: error.message });
  }
}

function appendAttendanceRecord(spreadsheetId, record) {
  if (!spreadsheetId) throw new Error('spreadsheetId is required');
  if (!record) throw new Error('record is required');

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = getOrCreateSheet(spreadsheet, DEFAULT_SHEET_NAME);
  ensureHeader(sheet);

  sheet.appendRow([
    record.timestamp,
    record.date,
    record.time,
    record.typeLabel,
    record.employeeId,
    record.employeeName,
    record.groupId,
    record.groupName,
    record.timezone,
    record.userAgent,
  ]);
}

function getOrCreateSheet(spreadsheet, sheetName) {
  return spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
}

function ensureHeader(sheet) {
  if (sheet.getLastRow() > 0) return;
  sheet.appendRow([
    'タイムスタンプ',
    '日付',
    '時刻',
    '種別',
    '社員ID',
    '社員名',
    'グループID',
    'グループ名',
    'タイムゾーン',
    'ユーザーエージェント',
  ]);
}

function validateSecret(secret) {
  const expected = PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY_KEY);
  if (expected && secret !== expected) {
    throw new Error('Invalid secret');
  }
}

function jsonResponse(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
