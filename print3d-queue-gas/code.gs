/**
 * 3D Print Queue - Google Apps Script backend
 * Data store: the Google Sheet SPREADSHEET_ID (sheets are created automatically).
 */

// "3DPrint JOB" spreadsheet
var SPREADSHEET_ID = '13fuUSHjSdJ7jBUp0AjRi3HIU7Ze7ZNkMsA5sGZir1dg';

var PRINTER_SHEET = 'Printers';
var PRINTER_HEADERS = ['Printer ID', 'Name', 'Color 1', 'Color 2', 'Color 3', 'Color 4', 'Created At'];

var QUEUE_SHEET = 'Queue';
var QUEUE_HEADERS = ['Job ID', 'Job', 'Printer ID', 'Printer Name', 'Added At'];

var DONE_SHEET = 'Done';
var DONE_HEADERS = ['Job ID', 'Job', 'Printer Name', 'Added At', 'Done At'];

var COLOR_SLOTS = 4;

// NATO phonetic alphabet, used to auto-name printers.
var PRINTER_NAMES = [
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel',
  'India', 'Juliett', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa',
  'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey',
  'X-ray', 'Yankee', 'Zulu'
];

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('3D Print Queue')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ---- Sheet helpers ----

function getSheet_(name, headers) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  var firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var hasHeaders = headers.every(function (h, i) {
    return firstRow[i] === h;
  });
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getRows_(sheet, width) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  return sheet.getRange(2, 1, lastRow - 1, width).getValues();
}

/** Returns the 1-based sheet row whose first column equals id, or -1. */
function findRow_(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2;
  }
  return -1;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function formatTime_(value) {
  if (!(value instanceof Date)) return value ? value.toString() : '';
  return Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
}

function toMillis_(value) {
  return value instanceof Date ? value.getTime() : 0;
}

function normalizeColor_(value) {
  var color = (value || '').toString().trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : '';
}

/**
 * First name in the NATO sequence that no existing printer uses.
 * After Zulu the sequence continues as "Alpha 2", "Bravo 2", ...
 */
function printerNameAt_(i) {
  var round = Math.floor(i / PRINTER_NAMES.length);
  return PRINTER_NAMES[i % PRINTER_NAMES.length] + (round > 0 ? ' ' + (round + 1) : '');
}

function nextPrinterName_(existingNames) {
  for (var i = 0; ; i++) {
    var name = printerNameAt_(i);
    if (existingNames.indexOf(name) === -1) return name;
  }
}

/** Position of a name in the Alpha, Bravo, ..., Zulu, Alpha 2, ... sequence. */
function printerNameOrder_(name) {
  var parts = name.toString().split(' ');
  var round = parts.length > 1 ? parseInt(parts[1], 10) - 1 : 0;
  var index = PRINTER_NAMES.indexOf(parts[0]);
  if (index === -1 || isNaN(round)) return Number.MAX_SAFE_INTEGER; // renamed by hand: keep last
  return round * PRINTER_NAMES.length + index;
}

// ---- Read ----

/**
 * Everything the page needs in one call:
 * { printers: [...], queue: [...], done: [...] }
 * Dates are pre-formatted because google.script.run cannot return Date objects.
 */
function getData() {
  var printers = getRows_(getSheet_(PRINTER_SHEET, PRINTER_HEADERS), PRINTER_HEADERS.length)
    .map(function (row) {
      return {
        id: row[0],
        name: row[1],
        colors: row.slice(2, 2 + COLOR_SLOTS).map(normalizeColor_)
      };
    })
    .sort(function (a, b) { return printerNameOrder_(a.name) - printerNameOrder_(b.name); });

  var queue = getRows_(getSheet_(QUEUE_SHEET, QUEUE_HEADERS), QUEUE_HEADERS.length)
    .map(function (row) {
      return {
        id: row[0],
        title: row[1],
        printerId: row[2],
        printerName: row[3],
        addedAt: formatTime_(row[4]),
        addedAtMs: toMillis_(row[4])
      };
    })
    .sort(function (a, b) { return a.addedAtMs - b.addedAtMs; });

  var done = getRows_(getSheet_(DONE_SHEET, DONE_HEADERS), DONE_HEADERS.length)
    .map(function (row) {
      return {
        id: row[0],
        title: row[1],
        printerName: row[2],
        addedAt: formatTime_(row[3]),
        doneAt: formatTime_(row[4]),
        doneAtMs: toMillis_(row[4])
      };
    })
    .sort(function (a, b) { return b.doneAtMs - a.doneAtMs; });

  return { printers: printers, queue: queue, done: done };
}

// ---- Printers ----

function addPrinter() {
  withLock_(function () {
    var sheet = getSheet_(PRINTER_SHEET, PRINTER_HEADERS);
    var names = getRows_(sheet, 2).map(function (row) { return row[1]; });
    var row = [Utilities.getUuid(), nextPrinterName_(names)];
    for (var i = 0; i < COLOR_SLOTS; i++) row.push('');
    row.push(new Date());
    sheet.appendRow(row);
  });
  return getData();
}

/** Overwrites all 4 color slots of a printer. Empty string = slot unused. */
function updatePrinterColors(printerId, colors) {
  colors = colors || [];
  var values = [];
  for (var i = 0; i < COLOR_SLOTS; i++) values.push(normalizeColor_(colors[i]));
  withLock_(function () {
    var sheet = getSheet_(PRINTER_SHEET, PRINTER_HEADERS);
    var rowNum = findRow_(sheet, printerId);
    if (rowNum === -1) throw new Error('ไม่พบเครื่องพิมพ์นี้ อาจถูกลบไปแล้ว');
    sheet.getRange(rowNum, 3, 1, COLOR_SLOTS).setValues([values]);
  });
  return getData();
}

function deletePrinter(printerId) {
  withLock_(function () {
    var queueRows = getRows_(getSheet_(QUEUE_SHEET, QUEUE_HEADERS), QUEUE_HEADERS.length);
    var hasJobs = queueRows.some(function (row) { return row[2] === printerId; });
    if (hasJobs) throw new Error('เครื่องนี้ยังมีงานค้างพิมพ์อยู่ กรุณาจัดการงานให้หมดก่อนลบ');
    var sheet = getSheet_(PRINTER_SHEET, PRINTER_HEADERS);
    var rowNum = findRow_(sheet, printerId);
    if (rowNum !== -1) sheet.deleteRow(rowNum);
  });
  return getData();
}

// ---- Jobs ----

function addJob(title, printerId) {
  title = (title || '').toString().trim();
  if (!title) throw new Error('กรุณากรอกชื่องาน');
  if (!printerId) throw new Error('กรุณาเลือกเครื่องพิมพ์');
  withLock_(function () {
    var printerSheet = getSheet_(PRINTER_SHEET, PRINTER_HEADERS);
    var rowNum = findRow_(printerSheet, printerId);
    if (rowNum === -1) throw new Error('ไม่พบเครื่องพิมพ์ที่เลือก');
    var printerName = printerSheet.getRange(rowNum, 2).getValue();
    getSheet_(QUEUE_SHEET, QUEUE_HEADERS)
      .appendRow([Utilities.getUuid(), title, printerId, printerName, new Date()]);
  });
  return getData();
}

/** Moves a job from Queue to Done, stamping the finish time. */
function completeJob(jobId) {
  withLock_(function () {
    var queueSheet = getSheet_(QUEUE_SHEET, QUEUE_HEADERS);
    var rowNum = findRow_(queueSheet, jobId);
    if (rowNum === -1) throw new Error('ไม่พบงานนี้ในรายการค้างพิมพ์ (อาจถูกกดเสร็จไปแล้ว)');
    var row = queueSheet.getRange(rowNum, 1, 1, QUEUE_HEADERS.length).getValues()[0];
    getSheet_(DONE_SHEET, DONE_HEADERS).appendRow([row[0], row[1], row[3], row[4], new Date()]);
    queueSheet.deleteRow(rowNum);
  });
  return getData();
}

/** Removes a queued job without recording it as done (e.g. added by mistake). */
function deleteJob(jobId) {
  withLock_(function () {
    var sheet = getSheet_(QUEUE_SHEET, QUEUE_HEADERS);
    var rowNum = findRow_(sheet, jobId);
    if (rowNum !== -1) sheet.deleteRow(rowNum);
  });
  return getData();
}
