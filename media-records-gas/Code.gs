/**
 * Media Records Management - Google Apps Script backend
 * Data store: the bound Google Sheet, sheet name SHEET_NAME.
 */

var SHEET_NAME = 'Media Records';
var HEADERS = ['Media ID', 'Media Name', 'Agency/House', 'Version', 'Type of Media'];

var MEDIA_TYPES = [
  { code: 'AI', label: 'AIS Inhouse (AI)' },
  { code: 'AP', label: 'AIS Partner (AP)' },
  { code: 'AD', label: 'Advertise (AD)' }
];

var USER_SHEET_NAME = 'user_mng';
var USER_HEADERS = ['username', 'password', 'type of user'];
var USER_TYPES = ['All', 'Media', 'Operation'];

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Media Records Management')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getMediaTypes() {
  return MEDIA_TYPES;
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  var firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  var hasHeaders = HEADERS.every(function (h, i) {
    return firstRow[i] === h;
  });
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Running number resets per Type of Media code, based on the highest
 * existing number found for that code (across any date).
 */
function generateMediaId_(sheet, typeCode) {
  var lastRow = sheet.getLastRow();
  var maxNumber = 0;
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    ids.forEach(function (row) {
      var id = row[0];
      if (typeof id === 'string') {
        var parts = id.split('_');
        if (parts.length >= 2 && parts[0] === typeCode) {
          var num = parseInt(parts[1], 10);
          if (!isNaN(num) && num > maxNumber) {
            maxNumber = num;
          }
        }
      }
    });
  }
  var nextNumber = maxNumber + 1;
  var numberStr = ('0000' + nextNumber).slice(-4);
  var dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'ddMMyyyy');
  return typeCode + '_' + numberStr + '_' + dateStr;
}

function saveMediaRecord(formData) {
  formData = formData || {};
  authorize_(formData.username, ['All', 'Media']);

  var mediaName = (formData.mediaName || '').toString().trim();
  var agencyHouse = (formData.agencyHouse || '').toString().trim();
  var version = (formData.version || '').toString().trim();
  var typeOfMedia = (formData.typeOfMedia || '').toString().trim();

  var validCodes = MEDIA_TYPES.map(function (t) { return t.code; });
  if (!mediaName || !agencyHouse || !version || !typeOfMedia) {
    throw new Error('กรุณากรอกข้อมูลให้ครบทุกช่อง');
  }
  if (validCodes.indexOf(typeOfMedia) === -1) {
    throw new Error('Type of Media ไม่ถูกต้อง');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getSheet_();
    var mediaId = generateMediaId_(sheet, typeOfMedia);
    sheet.appendRow([mediaId, mediaName, agencyHouse, version, typeOfMedia]);
    return {
      mediaId: mediaId,
      mediaName: mediaName,
      agencyHouse: agencyHouse,
      version: version,
      typeOfMedia: typeOfMedia
    };
  } finally {
    lock.releaseLock();
  }
}

function searchMediaRecords(payload) {
  payload = payload || {};
  authorize_(payload.username, ['All', 'Operation']);

  var keyword = (payload.keyword || '').toString().trim().toLowerCase();
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  var results = [];
  data.forEach(function (row) {
    var mediaId = row[0];
    var mediaName = row[1];
    var agencyHouse = row[2];
    var version = row[3];
    var typeOfMedia = row[4];
    var matches = !keyword ||
      (mediaName && mediaName.toString().toLowerCase().indexOf(keyword) !== -1) ||
      (agencyHouse && agencyHouse.toString().toLowerCase().indexOf(keyword) !== -1);
    if (matches) {
      results.push({
        mediaId: mediaId,
        mediaName: mediaName,
        agencyHouse: agencyHouse,
        version: version,
        typeOfMedia: typeOfMedia
      });
    }
  });
  return results.reverse();
}

// ---- Authentication (user_mng sheet) ----

function getUserSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(USER_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(USER_SHEET_NAME);
  }
  var firstRow = sheet.getRange(1, 1, 1, USER_HEADERS.length).getValues()[0];
  var hasHeaders = USER_HEADERS.every(function (h, i) {
    return firstRow[i] === h;
  });
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, USER_HEADERS.length).setValues([USER_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findUser_(username) {
  username = (username || '').toString().trim();
  if (!username) return null;
  var sheet = getUserSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;
  var data = sheet.getRange(2, 1, lastRow - 1, USER_HEADERS.length).getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().trim() === username) {
      return {
        username: data[i][0].toString().trim(),
        password: data[i][1] === undefined || data[i][1] === null ? '' : data[i][1].toString(),
        type: data[i][2] ? data[i][2].toString().trim() : ''
      };
    }
  }
  return null;
}

/**
 * Verifies credentials against the user_mng sheet.
 * Returns { username, type } on success.
 */
function loginUser(username, password) {
  username = (username || '').toString().trim();
  password = (password || '').toString();
  if (!username || !password) {
    throw new Error('กรุณากรอก Username และ Password');
  }
  var user = findUser_(username);
  if (!user || user.password !== password) {
    throw new Error('Username หรือ Password ไม่ถูกต้อง');
  }
  if (USER_TYPES.indexOf(user.type) === -1) {
    throw new Error('บัญชีผู้ใช้นี้ไม่มีสิทธิ์การใช้งานที่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบ');
  }
  return { username: user.username, type: user.type };
}

/**
 * Re-validates a username (already logged in client-side) against the
 * user_mng sheet before allowing a protected server call, and checks its
 * type is one of allowedTypes. Throws if not authorized.
 */
function authorize_(username, allowedTypes) {
  var user = findUser_(username);
  if (!user || allowedTypes.indexOf(user.type) === -1) {
    throw new Error('ไม่มีสิทธิ์ใช้งานส่วนนี้ กรุณาเข้าสู่ระบบใหม่');
  }
  return user;
}
