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

function searchMediaRecords(keyword) {
  keyword = (keyword || '').toString().trim().toLowerCase();
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
