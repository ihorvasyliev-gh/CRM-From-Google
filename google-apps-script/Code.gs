// ==========================================
// CONFIGURATION
// ==========================================
var SUPABASE_URL = 'https://fdtzntjvigtrwipqkzht.supabase.co'; // e.g., https://xyz.supabase.co
var SUPABASE_KEY = ''; // Service role key might be needed if RLS is strict, but Anon is fine if policies allow
var BATCH_SIZE = 50; 
var FIXED_COL_COUNT = 8; // Индекс, с которого начинаются колонки курсов (индекс 8 = 9-я колонка)

var SOURCE_SHEET_NAME = 'Form responses 1'; // Откуда берем данные для Supabase
var MIRROR_SHEET_NAME = 'CRM Mirror';       // Куда выгружаем данные из Supabase

// Limits for execution
var MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes in milliseconds
var START_TIME = Date.now();

// Global cache for Course Name -> ID mapping
var COURSE_CACHE = {}; 

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🔄 CRM Sync')
    .addItem('⬆️ Export ALL answers to Supabase', 'startFullSync')
    .addItem('⬆️ Upload the last 20 to Supabase', 'syncAllRecent')
    .addSeparator()
    .addItem('⬇️ Upload from Supabase to CRM Mirror', 'syncFromSupabase')
    .addSeparator()
    .addItem('🛠 Migrate Registration Dates (One-time)', 'startMigrateRegistrationDates')
    .addSeparator()
    .addItem('🛠 Settings: Triggers (Automation)', 'setupTriggers')
    .addItem('🛠 Configuration: Formatting CRM Mirror', 'setupMirrorSheetFormatting')
    .addToUi();
}

/**
 * Triggered on Form Submit. Syncs just the new row.
 */
function onFormSubmit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  
  // Строго проверяем, что форма отправилась на правильный лист
  if (sheet.getName() !== SOURCE_SHEET_NAME) return;
  
  var row = e.range.getRow();
  syncRowsRange(sheet, row, row);
  
  // Опционально: можно раскомментировать строку ниже, чтобы CRM Mirror обновлялся сразу после новой заявки
  // syncFromSupabase();
}

/**
 * Triggers periodically. Syncs recent entries.
 */
function syncAllRecent() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SOURCE_SHEET_NAME);
  if (!sheet) {
    SpreadsheetApp.getActiveSpreadsheet().toast('Лист ' + SOURCE_SHEET_NAME + ' не найден.', 'Ошибка');
    return;
  }
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var startRow = Math.max(2, lastRow - 20); 
  syncRowsRange(sheet, startRow, lastRow);
  SpreadsheetApp.getActiveSpreadsheet().toast('The last lines have been uploaded!', 'CRM Sync');
}

/**
 * Entry point for full sync to reset properties.
 */
function startFullSync() {
  PropertiesService.getScriptProperties().deleteProperty('SYNC_START_ROW');
  syncAllRowsBatched();
}

/**
 * Resume function for the time-based trigger.
 */
function resumeSyncAllRowsBatched(e) {
  if (e && e.triggerUid) {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getUniqueId() === e.triggerUid) {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
  }
  syncAllRowsBatched();
}

/**
 * Manual/Resumable Trigger. Syncs ALL rows in batches safely.
 */
function syncAllRowsBatched() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SOURCE_SHEET_NAME);
  
  if (!sheet) {
    ss.toast('Лист ' + SOURCE_SHEET_NAME + ' не найден.', 'Ошибка');
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    ss.toast('No data to download.', 'CRM Sync');
    return;
  }
  
  var scriptProps = PropertiesService.getScriptProperties();
  var savedRow = scriptProps.getProperty('SYNC_START_ROW');
  var startRow = savedRow ? parseInt(savedRow, 10) : 2;

  if (startRow === 2) {
    ss.toast('Starting full sync.', 'CRM Sync');
  } else {
    ss.toast('Resume sync from line ' + startRow + '...', 'CRM Sync');
  }
  
  warmUpCourseCache();

  for (var r = startRow; r <= lastRow; r += BATCH_SIZE) {
    // 1. CHECK TIME LIMIT
    if (Date.now() - START_TIME > MAX_EXECUTION_TIME) {
      scriptProps.setProperty('SYNC_START_ROW', r.toString());
      
      ScriptApp.newTrigger('resumeSyncAllRowsBatched')
        .timeBased()
        .after(60 * 1000) // Resume in 1 minute
        .create();
        
      ss.toast('Pause on line ' + r + ' will continue in 1 min', 'CRM Sync Pause');
      return; 
    }

    var endRow = Math.min(r + BATCH_SIZE - 1, lastRow);
    try {
      syncRowsRange(sheet, r, endRow);
      ss.toast('Lines ' + r + ' - ' + endRow, 'CRM Sync');
      Utilities.sleep(500); 
    } catch (e) {
      Logger.log("Error syncing batch " + r + "-" + endRow + ": " + e);
      ss.toast('error on line ' + r + ': ' + e.toString().substring(0, 50), 'CRM Sync Error');
    }
  }
  
  scriptProps.deleteProperty('SYNC_START_ROW');
  ss.toast('Finished', 'CRM Sync');
}

/**
 * Core Logic: Syncs a range of rows using Batch Upserts
 */
function syncRowsRange(sheet, startRow, endRow) {
  if (startRow > endRow) return;
  
  var numRows = endRow - startRow + 1;
  var numCols = sheet.getLastColumn();
  if (numCols < FIXED_COL_COUNT) return;

  var rangeValues = sheet.getRange(startRow, 1, numRows, numCols).getValues();
  var headers = sheet.getRange(1, 1, 1, numCols).getValues()[0];
  
  var studentsToUpsert = [];
  var rowMap = []; 

  for (var i = 0; i < rangeValues.length; i++) {
    var rowData = rangeValues[i];
    var email = rowData[4];
    
    if (!email || String(email).trim() === "") continue;

    var fName = String(rowData[1] || "").trim();
    var lName = String(rowData[2] || "").trim();
    var eMail = String(email).trim().toLowerCase();

    studentsToUpsert.push({
      first_name: fName,
      last_name: lName,
      phone: normalizePhone(rowData[3]),
      email: eMail, 
      address: rowData[5] || "",
      eircode: rowData[6] || "",
      dob: formatDate(rowData[7]),
      last_synced_at: new Date().toISOString(),
      created_at: formatIsoDateTime(rowData[0])
    });
    
    // Use a composite key for the map instead of just email
    rowMap.push({ key: fName.toLowerCase() + "|" + lName.toLowerCase() + "|" + eMail, rowData: rowData });
  }

  if (studentsToUpsert.length === 0) return;

  // Deduplicate emails within the batch before sending to Supabase
  var uniqueStudents = [];
  var seenKeys = {};
  for (var k = 0; k < studentsToUpsert.length; k++) {
      var s = studentsToUpsert[k];
      var key = s.first_name.toLowerCase() + "|" + s.last_name.toLowerCase() + "|" + s.email;
      if (!seenKeys[key]) {
          uniqueStudents.push(s);
          seenKeys[key] = true;
      }
  }

  // Upsert Students
  var upsertedStudents = _fetch('students?on_conflict=first_name,last_name,email', 'post', uniqueStudents, { 
    'Prefer': 'resolution=merge-duplicates, return=representation' 
  });
  
  if (!upsertedStudents) throw new Error("Failed to upsert students batch.");
  
  var keyToIdMap = {};
  for (var k = 0; k < upsertedStudents.length; k++) {
      var s = upsertedStudents[k];
      var key = String(s.first_name || "").toLowerCase() + "|" + String(s.last_name || "").toLowerCase() + "|" + String(s.email || "").toLowerCase();
      keyToIdMap[key] = s.id;
  }

  // Build Enrollments
  var enrollmentsToUpsert = [];
  var enrollmentKeys = {};
  
  for (var m = 0; m < rowMap.length; m++) {
      var mapItem = rowMap[m];
      var sId = keyToIdMap[mapItem.key];
      if (!sId) continue; 

      var rData = mapItem.rowData;

      for (var col = FIXED_COL_COUNT; col < headers.length; col++) {
          var courseName = headers[col];
          var cellValue = rData[col];
          
          if (courseName && cellValue && String(cellValue).trim() !== "") {
              var cId = getCourseId(courseName); 
              if (cId) {
                  var variants = String(cellValue).split(',').map(function(s) { return s.trim(); });
                  for (var v = 0; v < variants.length; v++) {
                       var uniqueKey = sId + "_" + cId + "_" + variants[v]; 
                       if (!enrollmentKeys[uniqueKey]) {
                           enrollmentsToUpsert.push({
                               student_id: sId,
                               course_id: cId,
                               course_variant: variants[v],
                               status: 'requested',
                               created_at: formatIsoDateTime(rData[0])
                           });
                           enrollmentKeys[uniqueKey] = true;
                       }
                  }
              }
          }
      }
  }

  // Upsert Enrollments (ignores duplicates to keep existing statuses intact)
  if (enrollmentsToUpsert.length > 0) {
      _fetch('enrollments?on_conflict=student_id,course_id,course_variant', 'post', enrollmentsToUpsert, { 
        'Prefer': 'resolution=ignore-duplicates' 
      });
  }
}

// ==========================================
// API HELPERS
// ==========================================

function _fetchAll(endpoint, selectQuery) {
  var allData = [];
  var limit = 1000;
  var offset = 0;
  var hasMore = true;

  while (hasMore) {
    var rangeHeader = offset + "-" + (offset + limit - 1);
    var res = _fetch(endpoint + '?' + selectQuery, 'get', null, { 
      'Range-Unit': 'items', 
      'Range': rangeHeader 
    });

    if (res && res.length > 0) {
      allData = allData.concat(res);
      offset += limit;
      if (res.length < limit) hasMore = false;
    } else {
      hasMore = false;
    }
  }
  return allData;
}

function warmUpCourseCache() {
  var allCourses = _fetchAll('courses', 'select=id,name');
  if (allCourses) {
    for (var i = 0; i < allCourses.length; i++) {
        COURSE_CACHE[allCourses[i].name] = allCourses[i].id;
    }
  }
}

function getCourseId(name) {
  if (COURSE_CACHE[name]) return COURSE_CACHE[name];
  
  var res = _fetch('courses?name=eq.' + encodeURIComponent(name), 'get');
  if (res && res.length > 0) {
      COURSE_CACHE[name] = res[0].id;
      return res[0].id;
  }
  
  var newCourse = _fetch('courses', 'post', { name: name }, { 'Prefer': 'return=representation' });
  var id = newCourse && newCourse.length > 0 ? newCourse[0].id : null;
  if (id) COURSE_CACHE[name] = id;
  return id;
}

function _fetch(endpoint, method, payload, extraHeaders) {
  var url = SUPABASE_URL + '/rest/v1/' + endpoint;
  var headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
  };
  
  if (extraHeaders) {
      for (var k in extraHeaders) headers[k] = extraHeaders[k];
  }
  
  var options = {
    'method' : method,
    'headers': headers,
    'muteHttpExceptions': true
  };
  
  if (payload) options.payload = JSON.stringify(payload);

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var content = response.getContentText();
  
  if (code >= 200 && code < 300) {
    return content ? JSON.parse(content) : null;
  } else {
    Logger.log("Supabase Error [" + method + " " + endpoint + "] (" + code + "): " + content);
    return null;
  }
}

function formatDate(dateObj) {
  if (!dateObj || String(dateObj).trim() === "") return null;
  if (typeof dateObj === 'string') return dateObj;
  try {
    return Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "yyyy-MM-dd");
  } catch (e) {
    return null;
  }
}

function normalizePhone(phone) {
  if (!phone) return "";
  var cleaned = String(phone).replace(/[^\d+]/g, '');
  if (!cleaned) return "";
  if (cleaned.startsWith('00')) cleaned = '+' + cleaned.substring(2);
  else if (cleaned.startsWith('0')) cleaned = '+353' + cleaned.substring(1);
  else if (cleaned.startsWith('353')) cleaned = '+' + cleaned;
  else if (cleaned.startsWith('8')) cleaned = '+353' + cleaned;
  return cleaned;
}

// ==========================================
// MIRROR SYNC (SUPABASE -> GOOGLE SHEETS)
// ==========================================

/**
 * Syncs data from Supabase to CRM Mirror sheet.
 */
function syncFromSupabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(MIRROR_SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(MIRROR_SHEET_NAME);
  }
  
  ss.toast("Downloading from Supabase", "CRM Mirror Sync");
  
  var students = _fetchAll('students', 'select=*');
  var enrollments = _fetchAll('enrollments', 'select=*,course:courses(name)');
  
  if (!students || !enrollments) {
    ss.toast("Error, Check logs", "CRM Mirror Sync Error");
    return;
  }
  
  var studentMap = {};
  var enrolledStudentIds = {};
  for (var i = 0; i < students.length; i++) {
    studentMap[students[i].id] = students[i];
  }
  
  var headers = [
    'System ID', 'Enrollment ID', 'Student ID', 'Status', 'Priority', 
    'First Name', 'Last Name', 'Email', 'Mobile', 'Address', 'Eircode', 'DOB', 
    'Course', 'Variant / Language', 'Invited Date', 'Confirmed Date', 'Created At', 'Notes'
  ];
  
  var outputRows = [];
  
  // Sort enrollments by Course Name, then Date
  enrollments.sort(function(a, b) {
      if (a.course && b.course && a.course.name !== b.course.name) {
          return a.course.name.localeCompare(b.course.name);
      }
      return (b.created_at || "").localeCompare(a.created_at || "");
  });

  for (var i = 0; i < enrollments.length; i++) {
    var e = enrollments[i];
    var s = studentMap[e.student_id] || {};
    var cName = (e.course && e.course.name) ? e.course.name : "Unknown Course";
    
    enrolledStudentIds[e.student_id] = true;
    
    outputRows.push([
      e.id + "_" + e.student_id, e.id, e.student_id, String(e.status || 'requested').toUpperCase(),
      e.is_priority ? "⭐ High" : "Normal", s.first_name || "", s.last_name || "", s.email || "",
      s.phone || "", s.address || "", s.eircode || "", s.dob || "", cName, e.course_variant || "Standard",
      e.invited_date || "", e.confirmed_date || "", e.created_at || "", e.notes || ""
    ]);
  }
  
  // Add students who have no enrollments
  for (var i = 0; i < students.length; i++) {
     if (!enrolledStudentIds[students[i].id]) {
        var s = students[i];
        outputRows.push([
          "no_enr_" + s.id, "", s.id, 'NO ENROLLMENTS', '', s.first_name || "", s.last_name || "",
          s.email || "", s.phone || "", s.address || "", s.eircode || "", s.dob || "", "None", "", "", "", s.created_at || "", ""
        ]);
     }
  }
  
  // Clear old data while preserving formatting (row 2 and below)
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  
  // Write Headers
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#f3f3f3");
  
  // Write Data
  if (outputRows.length > 0) {
    sheet.getRange(2, 1, outputRows.length, headers.length).setValues(outputRows);
  }
  
  sheet.setFrozenRows(1);
  sheet.hideColumns(1); sheet.hideColumns(2); sheet.hideColumns(3); 
  
  ss.toast("Sync finished " + outputRows.length, "CRM Mirror Sync");
}

function formatIsoDateTime(dateObj) {
  if (!dateObj || String(dateObj).trim() === "") return new Date().toISOString();
  var d = new Date(dateObj);
  if (isNaN(d.getTime())) return new Date().toISOString(); 
  return d.toISOString();
}

// ==========================================
// DATES MIGRATION (ONE-TIME)
// ==========================================

function startMigrateRegistrationDates() {
  PropertiesService.getScriptProperties().deleteProperty('MIGRATE_DATES_START_ROW');
  migrateRegistrationDates();
}

function resumeMigrateRegistrationDates(e) {
  if (e && e.triggerUid) {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === 'resumeMigrateRegistrationDates') {
            ScriptApp.deleteTrigger(triggers[i]);
        }
    }
  }
  migrateRegistrationDates();
}

function migrateRegistrationDates() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SOURCE_SHEET_NAME);
  if (!sheet) return ss.toast("Sheet " + SOURCE_SHEET_NAME + " not found!");

  ss.toast("Warming up cache for dates migration...", "CRM Sync");
  warmUpCourseCache(); 
  
  var allStudents = _fetchAll('students', 'select=id,email');
  var studentCache = {};
  if (allStudents) {
    for (var i = 0; i < allStudents.length; i++) {
      if (allStudents[i].email) studentCache[allStudents[i].email] = allStudents[i].id;
    }
  }

  var scriptProps = PropertiesService.getScriptProperties();
  var savedRow = scriptProps.getProperty('MIGRATE_DATES_START_ROW');
  var startRow = savedRow ? parseInt(savedRow, 10) : 2;
  var lastRow = sheet.getLastRow();

  if (startRow === 2) {
    ss.toast("Starting Date Migration from row " + startRow, "CRM Sync");
  } else {
    ss.toast("Resuming Date Migration from row " + startRow, "CRM Sync");
  }

  var MIGRATION_BATCH = 200; 
  var CURRENT_MIG_START_TIME = Date.now();

  for (var r = startRow; r <= lastRow; r += MIGRATION_BATCH) {
    if (Date.now() - CURRENT_MIG_START_TIME > MAX_EXECUTION_TIME) {
      scriptProps.setProperty('MIGRATE_DATES_START_ROW', r.toString());
      ScriptApp.newTrigger('resumeMigrateRegistrationDates')
        .timeBased()
        .after(60 * 1000)
        .create();
      ss.toast("Time limit reached. Will resume from line " + r + " automatically...", "Migration paused");
      return;
    }

    var endRow = Math.min(r + MIGRATION_BATCH - 1, lastRow);
    var numRows = endRow - r + 1;
    var numCols = sheet.getLastColumn();
    var rangeValues = sheet.getRange(r, 1, numRows, numCols).getValues();
    var headers = sheet.getRange(1, 1, 1, numCols).getValues()[0];

    var updates = [];

    for (var i = 0; i < rangeValues.length; i++) {
       var rowData = rangeValues[i];
       if (!rowData[0]) continue;
       var formCreatedAt = formatIsoDateTime(rowData[0]);

       var email = String(rowData[4] || "").trim().toLowerCase();
       if (!email) continue;
       
       var sId = studentCache[email];
       if (!sId) continue;

       for (var col = FIXED_COL_COUNT; col < headers.length; col++) {
           var courseName = headers[col];
           var cellValue = rowData[col];
           
           if (courseName && cellValue && String(cellValue).trim() !== "") {
               var cId = COURSE_CACHE[courseName];
               if (cId) {
                   var variants = String(cellValue).split(',').map(function(s) { return s.trim(); });
                   for (var v = 0; v < variants.length; v++) {
                       updates.push({
                           student_id: sId,
                           course_id: cId,
                           course_variant: variants[v],
                           created_at: formCreatedAt
                       });
                   }
               }
           }
       }
    }

    if (updates.length > 0) {
       var resp = _fetch('rpc/bulk_update_registration_dates', 'post', { updates: updates });
       if (resp === null) {
           ss.toast("Error hitting rpc for lines " + r + " to " + endRow, "CRM Sync Error");
       } else {
           Logger.log("Successfully migrated dates for row block " + r + "-" + endRow);
       }
    }
  }

  scriptProps.deleteProperty('MIGRATE_DATES_START_ROW');
  ss.toast("Date Migration Complete! Run Mirror Sync to view changes.", "CRM Sync");
}

// ==========================================
// SETUP & TRIGGERS
// ==========================================

function setupMirrorSheetFormatting() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(MIRROR_SHEET_NAME);
  if (!sheet) return ss.toast("Сначала запустите загрузку из Supabase хотя бы один раз.", "Ошибка");

  // Apply Auto-Filter
  if (sheet.getFilter() !== null) sheet.getFilter().remove();
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getLastColumn()).createFilter();

  // Apply Conditional Formatting to Column 4 (Status)
  var statusRange = sheet.getRange("D2:D");
  sheet.clearConditionalFormatRules();
  
  var rules = [
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('CONFIRMED').setBackground('#d4edda').setFontColor('#155724').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('INVITED').setBackground('#fff3cd').setFontColor('#856404').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('COMPLETED').setBackground('#cce5ff').setFontColor('#004085').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('WITHDRAWN').setBackground('#f8d7da').setFontColor('#721c24').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('REQUESTED').setBackground('#e2e3e5').setFontColor('#383d41').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('NO ENROLLMENTS').setBackground('#ffffff').setFontColor('#6c757d').setRanges([statusRange]).build()
  ];
  sheet.setConditionalFormatRules(rules);
  ss.toast("Форматирование успешно применено!", "Setup");
}

function setupTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  
  // Скачиваем данные ИЗ Supabase В CRM Mirror каждый час
  ScriptApp.newTrigger('syncFromSupabase').timeBased().everyHours(1).create();
  
  // Отправляем данные ИЗ Формы В Supabase при каждом новом ответе
  ScriptApp.newTrigger('onFormSubmit').forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onFormSubmit().create();
      
  SpreadsheetApp.getActiveSpreadsheet().toast("Все фоновые триггеры успешно установлены.", "CRM Setup");
}