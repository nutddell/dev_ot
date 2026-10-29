/**
 * 3D Print Queue - Google Apps Script backend
 * Data store: the Google Sheet SPREADSHEET_ID (sheets are created automatically).
 */

// "3DPrint JOB" spreadsheet
var SPREADSHEET_ID = '13fuUSHjSdJ7jBUp0AjRi3HIU7Ze7ZNkMsA5sGZir1dg';

// Times are shown in Thai time regardless of the project's time zone setting.
var TIME_ZONE = 'Asia/Bangkok';

var PRINTER_SHEET = 'Printers';
var PRINTER_HEADERS = ['Printer ID', 'Name', 'Color 1', 'Color 2', 'Color 3', 'Color 4', 'Created At'];

var QUEUE_SHEET = 'Queue';
// A queued job is "pending" while Started At is empty and "printing" once it is set.
var QUEUE_HEADERS = ['Job ID', 'Job', 'Printer ID', 'Printer Name', 'Added At', 'Started At', 'Order ID'];

var DONE_SHEET = 'Done';
var DONE_HEADERS = ['Job ID', 'Job', 'Printer Name', 'Added At', 'Done At', 'Started At', 'Order ID'];

var ORDER_SHEET = 'Orders';
var ORDER_HEADERS = ['Order ID', 'Date', 'Type', 'Detail', 'Color 1', 'Color 2', 'Color 3', 'Color 4',
  'Status', 'Created At', 'Job ID', 'Printer Name', 'Ready At'];

var ORDER_TYPES = ['พวงกุญแจ', 'Key cap', 'อื่นๆ'];
// design = รอการออกแบบ (yellow), ready = ส่งเข้าคิวพิมพ์งาน (green) — shows up in the
// print queue's pending list right away, queued = sent to a printer from that list.
var ORDER_STATUSES = ['design', 'ready', 'queued'];

var COLOR_SLOTS = 4;

// NATO phonetic alphabet, used to auto-name printers.
var PRINTER_NAMES = [
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel',
  'India', 'Juliett', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa',
  'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey',
  'X-ray', 'Yankee', 'Zulu'
];

/** ?page=order opens the order page; anything else opens the print queue. */
function doGet(e) {
  var page = e && e.parameter && e.parameter.page === 'order' ? 'order' : 'index';
  var template = HtmlService.createTemplateFromFile(page);
  template.appUrl = ScriptApp.getService().getUrl();
  return template.evaluate()
    .setTitle(page === 'order' ? 'คำสั่งงาน - 3D Print Queue' : '3D Print Queue')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ---- Sheet helpers ----

var lockHeld_ = false;

/** Opens the spreadsheet, first moving it to TIME_ZONE if it is still on another zone. */
function openSpreadsheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  if (ss.getSpreadsheetTimeZone() !== TIME_ZONE) {
    if (lockHeld_) moveToTimeZone_(ss);
    else withLock_(function () { moveToTimeZone_(ss); });
  }
  return ss;
}

/**
 * Sheets stores date-times as wall-clock values in the spreadsheet's time zone, so just
 * switching the zone would shift every existing row by the zone difference. Read the
 * timestamps first (as real instants), switch the zone, then write them back.
 */
function moveToTimeZone_(ss) {
  var oldZone = ss.getSpreadsheetTimeZone();
  if (oldZone === TIME_ZONE) return; // another request already did it
  // 1-based columns holding timestamps in each sheet.
  var timestampColumns = {};
  timestampColumns[PRINTER_SHEET] = [7];
  timestampColumns[QUEUE_SHEET] = [5, 6];
  timestampColumns[DONE_SHEET] = [4, 5, 6];
  timestampColumns[ORDER_SHEET] = [10, 13];

  var pending = [];
  Object.keys(timestampColumns).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() <= 1) return;
    var rows = sheet.getLastRow() - 1;
    timestampColumns[name].forEach(function (col) {
      pending.push({ range: sheet.getRange(2, col, rows, 1), values: sheet.getRange(2, col, rows, 1).getValues() });
    });
    if (name === ORDER_SHEET) {
      // Order dates are calendar days, not instants: keep the same day as text.
      var dateRange = sheet.getRange(2, 2, rows, 1);
      pending.push({
        range: dateRange,
        values: dateRange.getValues().map(function (row) {
          return [row[0] instanceof Date ? Utilities.formatDate(row[0], oldZone, 'yyyy-MM-dd') : row[0]];
        })
      });
    }
  });

  ss.setSpreadsheetTimeZone(TIME_ZONE);
  SpreadsheetApp.flush();
  pending.forEach(function (item) { item.range.setValues(item.values); });
}

function getSheet_(name, headers) {
  var ss = openSpreadsheet_();
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
  lockHeld_ = true;
  try {
    return fn();
  } finally {
    lockHeld_ = false;
    lock.releaseLock();
  }
}

function formatTime_(value) {
  if (!(value instanceof Date)) return value ? value.toString() : '';
  return Utilities.formatDate(value, TIME_ZONE, 'dd/MM/yyyy HH:mm');
}

/**
 * Order dates are typed as yyyy-MM-dd; Sheets turns them into a Date at midnight in the
 * spreadsheet's own time zone, so read them back in that same zone to keep the day exact.
 */
function formatOrderDate_(value, ss) {
  if (value instanceof Date) return Utilities.formatDate(value, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  return value ? value.toString() : '';
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
 * { printers, pending, printing, done, orders }
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
        addedAtMs: toMillis_(row[4]),
        startedAt: formatTime_(row[5]),
        startedAtMs: toMillis_(row[5]),
        orderId: row[6]
      };
    });
  var pending = queue
    .filter(function (job) { return !job.startedAt; })
    .sort(function (a, b) { return a.addedAtMs - b.addedAtMs; });
  var printing = queue
    .filter(function (job) { return job.startedAt; })
    .sort(function (a, b) { return a.startedAtMs - b.startedAtMs; });

  var done = getRows_(getSheet_(DONE_SHEET, DONE_HEADERS), DONE_HEADERS.length)
    .map(function (row) {
      return {
        id: row[0],
        title: row[1],
        printerName: row[2],
        addedAt: formatTime_(row[3]),
        doneAt: formatTime_(row[4]),
        doneAtMs: toMillis_(row[4]),
        startedAt: formatTime_(row[5]),
        orderId: row[6]
      };
    })
    .sort(function (a, b) { return b.doneAtMs - a.doneAtMs; });

  var ss = openSpreadsheet_();
  var orders = getRows_(getSheet_(ORDER_SHEET, ORDER_HEADERS), ORDER_HEADERS.length)
    .map(function (row) {
      return {
        id: row[0],
        date: formatOrderDate_(row[1], ss),
        type: row[2],
        detail: row[3],
        colors: row.slice(4, 4 + COLOR_SLOTS).map(normalizeColor_),
        status: row[8],
        createdAtMs: toMillis_(row[9]),
        jobId: row[10],
        printerName: row[11],
        // Orders marked ready before the Ready At column existed fall back to Created At.
        readyAt: formatTime_(row[12] || row[9]),
        readyAtMs: toMillis_(row[12] || row[9])
      };
    })
    .sort(function (a, b) {
      return a.date === b.date ? b.createdAtMs - a.createdAtMs : (a.date < b.date ? 1 : -1);
    });

  return { printers: printers, pending: pending, printing: printing, done: done, orders: orders };
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
    if (hasJobs) throw new Error('เครื่องนี้ยังมีงานค้างพิมพ์หรือกำลังพิมพ์อยู่ กรุณาจัดการงานให้หมดก่อนลบ');
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
      .appendRow([Utilities.getUuid(), title, printerId, printerName, new Date(), '', '']);
  });
  return getData();
}

/** Pending -> printing: stamps the start time. */
function startJob(jobId) {
  withLock_(function () {
    var sheet = getSheet_(QUEUE_SHEET, QUEUE_HEADERS);
    var rowNum = findRow_(sheet, jobId);
    if (rowNum === -1) throw new Error('ไม่พบงานนี้ในรายการค้างพิมพ์ (อาจถูกลบไปแล้ว)');
    var startedCell = sheet.getRange(rowNum, 6);
    if (startedCell.getValue()) throw new Error('งานนี้เริ่มพิมพ์ไปแล้ว');
    startedCell.setValue(new Date());
    // The column was added after the sheet existed and may carry a date-only format.
    startedCell.setNumberFormat('dd/MM/yyyy HH:mm:ss');
  });
  return getData();
}

/** Printing -> pending again (e.g. "พิมพ์งาน" pressed by mistake or the print failed). */
function unstartJob(jobId) {
  withLock_(function () {
    var sheet = getSheet_(QUEUE_SHEET, QUEUE_HEADERS);
    var rowNum = findRow_(sheet, jobId);
    if (rowNum === -1) throw new Error('ไม่พบงานนี้ในรายการกำลังพิมพ์');
    sheet.getRange(rowNum, 6).setValue('');
  });
  return getData();
}

/** Moves a printing job from Queue to Done, stamping the finish time. */
function completeJob(jobId) {
  withLock_(function () {
    var queueSheet = getSheet_(QUEUE_SHEET, QUEUE_HEADERS);
    var rowNum = findRow_(queueSheet, jobId);
    if (rowNum === -1) throw new Error('ไม่พบงานนี้ในรายการกำลังพิมพ์ (อาจถูกกดเสร็จไปแล้ว)');
    var row = queueSheet.getRange(rowNum, 1, 1, QUEUE_HEADERS.length).getValues()[0];
    getSheet_(DONE_SHEET, DONE_HEADERS)
      .appendRow([row[0], row[1], row[3], row[4], new Date(), row[5], row[6]]);
    queueSheet.deleteRow(rowNum);
  });
  return getData();
}

/** Removes a queued job without recording it as done (e.g. added by mistake). */
/** Removes a queued job without recording it as done (e.g. added by mistake).
 *  A job that came from an order goes back to ready, i.e. back into the pending list. */
function deleteJob(jobId) {
  withLock_(function () {
    var sheet = getSheet_(QUEUE_SHEET, QUEUE_HEADERS);
    var rowNum = findRow_(sheet, jobId);
    if (rowNum === -1) return;
    var orderId = sheet.getRange(rowNum, 7).getValue();
    sheet.deleteRow(rowNum);
    if (orderId) {
      var orderSheet = getSheet_(ORDER_SHEET, ORDER_HEADERS);
      var orderRow = findRow_(orderSheet, orderId);
      if (orderRow !== -1) {
        orderSheet.getRange(orderRow, 9).setValue('ready');
        orderSheet.getRange(orderRow, 11, 1, 2).setValues([['', '']]);
      }
    }
  });
  return getData();
}

// ---- Orders ----

function readOrderColors_(colors) {
  colors = colors || [];
  var values = [];
  for (var i = 0; i < COLOR_SLOTS; i++) values.push(normalizeColor_(colors[i]));
  return values;
}

/** order: { date: 'yyyy-MM-dd', type, detail, colors: [4], status: 'design' | 'ready' } */
function addOrder(order) {
  order = order || {};
  var date = (order.date || '').toString().trim();
  var type = (order.type || '').toString().trim();
  var detail = (order.detail || '').toString().trim();
  var status = order.status;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('กรุณาเลือกวันที่');
  if (ORDER_TYPES.indexOf(type) === -1) throw new Error('กรุณาเลือกชนิดของงาน');
  if (!detail) throw new Error('กรุณากรอกรายละเอียดงาน');
  if (status !== 'design' && status !== 'ready') throw new Error('กรุณาเลือกสถานะ');
  withLock_(function () {
    getSheet_(ORDER_SHEET, ORDER_HEADERS).appendRow(
      [Utilities.getUuid(), date, type, detail].concat(readOrderColors_(order.colors),
        [status, new Date(), '', '', status === 'ready' ? new Date() : '']));
  });
  return getData();
}

function findOrder_(orderId) {
  var sheet = getSheet_(ORDER_SHEET, ORDER_HEADERS);
  var rowNum = findRow_(sheet, orderId);
  if (rowNum === -1) throw new Error('ไม่พบคำสั่งงานนี้ (อาจถูกลบไปแล้ว)');
  return { sheet: sheet, rowNum: rowNum, status: sheet.getRange(rowNum, 9).getValue() };
}

/** Switches an order between design (yellow) and ready (green). */
function updateOrderStatus(orderId, status) {
  if (status !== 'design' && status !== 'ready') throw new Error('สถานะไม่ถูกต้อง');
  withLock_(function () {
    var found = findOrder_(orderId);
    if (found.status === 'queued') throw new Error('คำสั่งงานนี้ถูกส่งพิมพ์แล้ว เปลี่ยนสถานะไม่ได้');
    if (found.status === status) return;
    found.sheet.getRange(found.rowNum, 9).setValue(status);
    // Ready At = when it joined the pending list, so it queues behind earlier jobs.
    found.sheet.getRange(found.rowNum, 13).setValue(status === 'ready' ? new Date() : '');
  });
  return getData();
}

function updateOrderColors(orderId, colors) {
  var values = readOrderColors_(colors);
  withLock_(function () {
    var found = findOrder_(orderId);
    found.sheet.getRange(found.rowNum, 5, 1, COLOR_SLOTS).setValues([values]);
  });
  return getData();
}

function deleteOrder(orderId) {
  withLock_(function () {
    var found = findOrder_(orderId);
    if (found.status === 'queued') throw new Error('คำสั่งงานนี้ถูกส่งพิมพ์แล้ว ลบไม่ได้');
    found.sheet.deleteRow(found.rowNum);
  });
  return getData();
}

/** Ready (green) order in the pending list -> printing on the chosen printer. */
function printOrder(orderId, printerId) {
  if (!printerId) throw new Error('กรุณาเลือกเครื่องพิมพ์ก่อนกดพิมพ์งาน');
  withLock_(function () {
    var found = findOrder_(orderId);
    if (found.status !== 'ready') throw new Error('คำสั่งงานนี้ไม่ได้อยู่ในสถานะส่งเข้าคิวพิมพ์งาน (อาจถูกส่งพิมพ์ไปแล้ว)');
    var order = found.sheet.getRange(found.rowNum, 1, 1, ORDER_HEADERS.length).getValues()[0];

    var printerSheet = getSheet_(PRINTER_SHEET, PRINTER_HEADERS);
    var printerRow = findRow_(printerSheet, printerId);
    if (printerRow === -1) throw new Error('ไม่พบเครื่องพิมพ์ที่เลือก');
    var printerName = printerSheet.getRange(printerRow, 2).getValue();

    var jobId = Utilities.getUuid();
    var queueSheet = getSheet_(QUEUE_SHEET, QUEUE_HEADERS);
    // Added At = when the order became ready (it has been waiting in the pending list since).
    queueSheet.appendRow([jobId, order[2] + ': ' + order[3], printerId, printerName,
      order[12] || order[9] || new Date(), new Date(), orderId]);
    queueSheet.getRange(queueSheet.getLastRow(), 6).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    found.sheet.getRange(found.rowNum, 9).setValue('queued');
    found.sheet.getRange(found.rowNum, 11, 1, 2).setValues([[jobId, printerName]]);
  });
  return getData();
}
