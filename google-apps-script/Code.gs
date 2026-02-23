// CONFIGURATION
var SUPABASE_URL = 'YOUR_SUPABASE_URL'; // e.g., https://xyz.supabase.co
var SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY'; // Service role key might be needed if RLS is strict, but Anon is fine if policies allow
var BATCH_SIZE = 50; // Process this many rows at a time to stay within limits

// Known system headers to ignore when scanning for course columns (lowercase)
var IGNORED_HEADERS = [
  'id', 'timestamp', 'first name', 'last name', 'mobile', 'phone', 'email', 'email address',
  'address', 'eircode', 'dob', 'date of birth', 'created at', 'updated at', 
  'course', 'variant / language', 'notes', 'confirmed date', 'invited date', 'is_priority'
];

// Global cache for Course Name -> ID mapping
var COURSE_CACHE = {}; 

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CRM Sync')
    .addItem('Sync All Rows (Batched)', 'syncAllRowsBatched')
    .addItem('Sync Recent (20)', 'syncAllRecent')
    .addToUi();
}

/**
 * Triggered on Form Submit. Syncs just the new row.
 */
function onFormSubmit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  var row = e.range.getRow();
  syncRowsRange(sheet, row, row); // Sync single row range
}

/**
 * Triggers periodically. Syncs recent entries.
 */
function syncAllRecent() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var startRow = Math.max(2, lastRow - 20); 
  syncRowsRange(sheet, startRow, lastRow);
}

/**
 * Manual Trigger. Syncs ALL rows in batches.
 */
function syncAllRowsBatched() {
  var startTime = Date.now(); // Защита от тайм-аута (Вариант 1)
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  if (sheet.getName() === "CRM Mirror") {
    SpreadsheetApp.getActiveSpreadsheet().toast('Cannot sync FROM the Mirror sheet. Please go to your Form responses tab.', 'CRM Sync Error');
    return;
  }
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getActiveSpreadsheet().toast('No data found.', 'CRM Sync');
    return;
  }
  
  SpreadsheetApp.getActiveSpreadsheet().toast('Starting full batch sync...', 'CRM Sync');
  
  // Warm up course cache once
  warmUpCourseCache();

  // Process in chunks of BATCH_SIZE
  for (var r = 2; r <= lastRow; r += BATCH_SIZE) {
    // Если скрипт работает больше 5 минут (300 000 мс), останавливаемся, чтобы не получить сбой тайм-аута
    if (Date.now() - startTime > 300000) {
      SpreadsheetApp.getActiveSpreadsheet().toast('Скрипт остановлен (лимит 6 минут). Обработано строк: ' + (r - 1) + ' из ' + lastRow + '. Запустите еще раз.', 'CRM Sync Warning', -1);
      break;
    }

    var endRow = Math.min(r + BATCH_SIZE - 1, lastRow);
    try {
      syncRowsRange(sheet, r, endRow);
      // Feedback
      SpreadsheetApp.getActiveSpreadsheet().toast('Synced rows ' + r + ' to ' + endRow, 'CRM Sync');
      // Gentle throttle
      Utilities.sleep(500); 
    } catch (e) {
      Logger.log("Error syncing batch " + r + "-" + endRow + ": " + e);
      SpreadsheetApp.getActiveSpreadsheet().toast('Error on batch ' + r + ': ' + e.toString().substring(0, 50), 'CRM Sync Error');
    }
  }
  
  if (r > lastRow) {
    SpreadsheetApp.getActiveSpreadsheet().toast('Full sync completed!', 'CRM Sync');
  }
}

/**
 * Core Logic: Syncs a range of rows using Batch Upserts
 */
function syncRowsRange(sheet, startRow, endRow) {
  if (startRow > endRow) return;
  
  // Get Values
  var numRows = endRow - startRow + 1;
  var numCols = sheet.getLastColumn();
  // Get all data for this chunk
  // getRange(row, col, numRows, numCols)
  var rangeValues = sheet.getRange(startRow, 1, numRows, numCols).getValues();
  var headers = sheet.getRange(1, 1, 1, numCols).getValues()[0];
  
  // Dynamic column mapping
  var colMap = {};
  var courseCols = [];
  
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c]).trim();
    if (!h) continue;
    var hl = h.toLowerCase();
    
    if (hl === 'first name') colMap.firstName = c;
    else if (hl === 'last name') colMap.lastName = c;
    else if (hl === 'mobile' || hl === 'phone') colMap.phone = c;
    else if (hl === 'email' || hl === 'email address') colMap.email = c;
    else if (hl === 'address') colMap.address = c;
    else if (hl === 'eircode') colMap.eircode = c;
    else if (hl === 'dob' || hl === 'date of birth') colMap.dob = c;
    else if (IGNORED_HEADERS.indexOf(hl) === -1) {
      // Treat as a Course column if not explicitly ignored
      courseCols.push({ index: c, name: h });
    }
  }

  if (colMap.email === undefined) {
      Logger.log("Error: No Email column found in sheet. Sync aborted for range.");
      return;
  }

  var studentsToUpsert = [];
  var rowMap = []; // Maps index in studentsToUpsert back to original row data for enrollment processing

  // 0. Вариант 4: Массовое создание курсов (один запрос вместо нескольких)
  var missingCourses = [];
  var seenCourses = {};
  for (var ci = 0; ci < courseCols.length; ci++) {
    var headerCourseName = courseCols[ci].name;
    if (headerCourseName && !COURSE_CACHE[headerCourseName] && !seenCourses[headerCourseName]) {
      missingCourses.push(headerCourseName);
      seenCourses[headerCourseName] = true;
    }
  }
  if (missingCourses.length > 0) {
    bulkEnsureCourses(missingCourses);
  }

  // 1. Prepare Student Data
  for (var i = 0; i < rangeValues.length; i++) {
    var rowData = rangeValues[i];
    var email = rowData[colMap.email];
    
    // Skip if no email (key identifier)
    if (!email || String(email).trim() === "") {
        Logger.log("Skipping row " + (startRow + i) + ": No email.");
        continue;
    }

    var studentData = {
      first_name: colMap.firstName !== undefined ? String(rowData[colMap.firstName] || "") : "",
      last_name: colMap.lastName !== undefined ? String(rowData[colMap.lastName] || "") : "",
      phone: colMap.phone !== undefined ? String(rowData[colMap.phone] || "") : "",
      email: String(email).trim(), // Unique Key
      address: colMap.address !== undefined ? String(rowData[colMap.address] || "") : "",
      eircode: colMap.eircode !== undefined ? String(rowData[colMap.eircode] || "") : "",
      dob: colMap.dob !== undefined ? formatDate(rowData[colMap.dob]) : null,
      last_synced_at: new Date().toISOString()
    };
    
    studentsToUpsert.push(studentData);
    rowMap.push({
      email: String(email).trim(),
      rowData: rowData
    });
  }

  if (studentsToUpsert.length === 0) return;

  // 2. Bulk Upsert Students
  // On conflict (email), update other fields.
  // Must use 'resolution=merge-duplicates' and preferably specify on_conflict column
  
  // Deduplicate locally first (in case sheet has duplicates in same batch)
  var uniqueStudents = [];
  var seenEmails = {};
  
  for (var k = 0; k < studentsToUpsert.length; k++) {
      var s = studentsToUpsert[k];
      if (!seenEmails[s.email]) {
          uniqueStudents.push(s);
          seenEmails[s.email] = true;
      }
  }

  // Use explicit on_conflict param for clarity
  var upsertedStudents = _fetch('students?on_conflict=email', 'post', uniqueStudents, { 
    'Prefer': 'resolution=merge-duplicates, return=representation' 
  });
  
  if (!upsertedStudents) {
      // If it fails, log the error but maybe don't crash the whole script?
      // Actually throwing here is correct so the batch marks as failed.
      throw new Error("Failed to upsert students batch.");
  }
  
  // Create Map: Email -> StudentID
  var emailToIdMap = {};
  for (var k = 0; k < upsertedStudents.length; k++) {
      var s = upsertedStudents[k];
      if (s.email) emailToIdMap[s.email] = s.id;
  }

  // 3. Prepare Enrollments
  var enrollmentsToUpsert = [];
  // Use a map to prevent duplicate enrollments within the same batch (student+course)
  var enrollmentKeys = {};
  
  for (var m = 0; m < rowMap.length; m++) {
      var mapItem = rowMap[m];
      var sId = emailToIdMap[mapItem.email];
      if (!sId) continue; // Should not happen if upsert succeeded

      var rData = mapItem.rowData;

      // Check dynamic columns
      for (var ci = 0; ci < courseCols.length; ci++) {
          var courseName = courseCols[ci].name;
          var cellValue = rData[courseCols[ci].index];
          
          if (courseName && cellValue && String(cellValue).trim() !== "") {
              var cId = getCourseId(courseName); // From cache or create
              if (cId) {
                  var variants = String(cellValue).split(',').map(function(s) { return s.trim(); });
                  for (var v = 0; v < variants.length; v++) {
                       var uniqueKey = sId + "_" + cId + "_" + variants[v]; // Composite key
                       if (!enrollmentKeys[uniqueKey]) {
                           enrollmentsToUpsert.push({
                               student_id: sId,
                               course_id: cId,
                               course_variant: variants[v],
                               status: 'requested' // Default status
                           });
                           enrollmentKeys[uniqueKey] = true;
                       }
                  }
              }
          }
      }
  }

  // 4. Bulk Upsert Enrollments
  // On conflict (student_id, course_id), ignore.
  // 'resolution=ignore-duplicates' is safer if we don't want to reset status.
  if (enrollmentsToUpsert.length > 0) {
     // Also specify on_conflict for clarity if needed, but ignore-duplicates usually suffices
     // The unique constraint is on (student_id, course_id)
     _fetch('enrollments?on_conflict=student_id,course_id,course_variant', 'post', enrollmentsToUpsert, { 
        'Prefer': 'resolution=ignore-duplicates' 
     });
  }
}

// --- HELPER FUNCTIONS ---

function bulkEnsureCourses(courseNames) {
  var toInsert = [];
  for (var i = 0; i < courseNames.length; i++) {
    toInsert.push({ name: courseNames[i] });
  }
  if (toInsert.length > 0) {
    // Вставляем все новые курсы одним запросом
    var newCourses = _fetch('courses', 'post', toInsert, { 'Prefer': 'return=representation' });
    if (newCourses) {
      for (var j = 0; j < newCourses.length; j++) {
        COURSE_CACHE[newCourses[j].name] = newCourses[j].id;
      }
    }
  }
}

function _fetchAllCached(requests, retries) {
  retries = retries || 0;
  var fetchRequests = requests.map(function(req) {
     return {
       url: SUPABASE_URL + '/rest/v1/' + req.endpoint,
       method: req.method || 'get',
       headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json'
       },
       muteHttpExceptions: true
     };
  });
  
  var responses;
  try {
      responses = UrlFetchApp.fetchAll(fetchRequests);
  } catch(e) {
      if (retries < 3) {
          Utilities.sleep(1000 * Math.pow(2, retries));
          return _fetchAllCached(requests, retries + 1);
      }
      Logger.log("Network Error fetchAll: " + e);
      return []; 
  }

  var results = [];
  var hasError = false;
  for (var i = 0; i < responses.length; i++) {
     var code = responses[i].getResponseCode();
     if (code >= 200 && code < 300) {
       var content = responses[i].getContentText();
       results.push(content ? JSON.parse(content) : null);
     } else {
       hasError = true;
       Logger.log("Supabase Error fetchAll [" + requests[i].endpoint + "] (" + code + "): " + responses[i].getContentText());
       results.push(null);
     }
  }
  
  if (hasError && retries < 3) {
      Utilities.sleep(1000 * Math.pow(2, retries));
      return _fetchAllCached(requests, retries + 1);
  }
  
  return results;
}

function warmUpCourseCache() {
  var allCourses = _fetch('courses?select=id,name', 'get');
  if (allCourses) {
    for (var i = 0; i < allCourses.length; i++) {
        COURSE_CACHE[allCourses[i].name] = allCourses[i].id;
    }
  }
}

function getCourseId(name) {
  if (COURSE_CACHE[name]) return COURSE_CACHE[name];
  
  // Create if not exists (single check/create if missing from cache)
  // Double check API
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

function _fetch(endpoint, method, payload, extraHeaders, retries) {
  retries = retries || 0; // Вариант 2: Защита от сбоев интернета
  var url = SUPABASE_URL + '/rest/v1/' + endpoint;
  var headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
  };
  
  // Merge extra headers
  if (extraHeaders) {
      for (var k in extraHeaders) headers[k] = extraHeaders[k];
  }
  
  var options = {
    'method' : method,
    'headers': headers,
    'muteHttpExceptions': true
  };
  
  if (payload) {
    options.payload = JSON.stringify(payload);
  }

  var response;
  try {
    response = UrlFetchApp.fetch(url, options);
  } catch (e) {
    if (retries < 3) {
      Utilities.sleep(1000 * Math.pow(2, retries)); // 1s, 2s, 4s delay
      return _fetch(endpoint, method, payload, extraHeaders, retries + 1);
    }
    Logger.log("Network Error [" + method + " " + endpoint + "]: " + e);
    return null;
  }

  var code = response.getResponseCode();
  var content = response.getContentText();
  
  if (code >= 200 && code < 300) {
    return content ? JSON.parse(content) : null;
  } else if ((code === 429 || code >= 500) && retries < 3) {
    // Retry on rate limit (429) or server errors (5xx)
    Utilities.sleep(1000 * Math.pow(2, retries));
    return _fetch(endpoint, method, payload, extraHeaders, retries + 1);
  } else {
    Logger.log("Supabase Error [" + method + " " + endpoint + "] (" + code + "): " + content);
    return null;
  }
}

function formatDate(dateObj) {
  if (!dateObj) return null;
  
  if (typeof dateObj === 'string') {
    var trimmed = dateObj.trim();
    if (trimmed === "") return null;
    
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    
    var parsedDate = new Date(trimmed);
    if (isNaN(parsedDate.getTime())) {
      return null; 
    }
    dateObj = parsedDate;
  }
  
  try {
    return Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "yyyy-MM-dd");
  } catch (e) {
    return null;
  }
}

/**
 * Syncs ALL data from Supabase to a "CRM Mirror" tab.
 * This is a one-way sync from Supabase -> Sheet.
 * It overwrites the mirror sheet entirely.
 */
function syncFromSupabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = "CRM Mirror";
  var sheet = ss.getSheetByName(sheetName);
  
  // Create if doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  
  ss.toast("Fetching data from Supabase...", "CRM Mirror Sync");
  
  // 1. Fetch Data in Parallel (Вариант 3: Ускорение)
  var requests = [
    { endpoint: 'students?select=*&order=id.asc', method: 'get' },
    { endpoint: 'courses?select=*&order=name.asc', method: 'get' },
    { endpoint: 'enrollments?select=*,course:courses(name)', method: 'get' }
  ];
  
  var results = _fetchAllCached(requests);
  var students = results[0];
  var courses = results[1];
  var enrollments = results[2];
  
  if (!students || !courses || !enrollments) {
    ss.toast("Failed to fetch data. Check logs.", "CRM Mirror Sync");
    return;
  }
  
  // 2. Transform Data
  // Create a map of Student ID -> Enrollments
  var enrollmentMap = {};
  for (var i = 0; i < enrollments.length; i++) {
    var e = enrollments[i];
    if (!enrollmentMap[e.student_id]) {
      enrollmentMap[e.student_id] = {};
    }
    // Key by Course Name (since columns are by name)
    // format: "Variant - Status ⭐ (Confirmed: Date)"
    if (e.course && e.course.name) {
       var val = (e.course_variant || "Standard") + " - " + (e.status || "requested");
       
       // Add Priority Star
       if (e.is_priority) {
           val += " ⭐";
       }
       
       if (e.status === 'confirmed' && e.confirmed_date) {
           val += " (Confirmed: " + e.confirmed_date + ")";
       } else if (e.status === 'invited' && e.invited_date) {
           val += " (Invited: " + e.invited_date + ")";
       }
       
       enrollmentMap[e.student_id][e.course.name] = val;
    }
  }
  
  // Prepare Headers
  // Fixed: ID, Timestamp, First Name, Last Name, Mobile, Email, Address, Eircode, DOB
  var fixedHeaders = ['ID', 'Timestamp', 'First Name', 'Last Name', 'Mobile', 'Email', 'Address', 'Eircode', 'DOB'];
  var courseNames = courses.map(function(c) { return c.name; });
  var allHeaders = fixedHeaders.concat(courseNames);
  
  // Prepare Rows
  var outputRows = [];
  
  for (var i = 0; i < students.length; i++) {
    var s = students[i];
    var row = [];
    
    // Fixed Columns
    row.push(s.id); // Hidden ID column
    row.push(s.created_at || "");
    row.push(s.first_name || "");
    row.push(s.last_name || "");
    row.push(s.phone || "");
    row.push(s.email || "");
    row.push(s.address || "");
    row.push(s.eircode || "");
    row.push(s.dob || "");
    
    // Dynamic Course Columns
    var studentEnrollments = enrollmentMap[s.id] || {};
    for (var j = 0; j < courseNames.length; j++) {
      var cName = courseNames[j];
      row.push(studentEnrollments[cName] || "");
    }
    
    outputRows.push(row);
  }
  
  // 3. Write to Sheet
  sheet.clear();
  
  // Write Headers
  if (allHeaders.length > 0) {
    sheet.getRange(1, 1, 1, allHeaders.length).setValues([allHeaders])
         .setFontWeight("bold")
         .setBackground("#f3f3f3");
  }
  
  // Write Data
  if (outputRows.length > 0) {
    sheet.getRange(2, 1, outputRows.length, allHeaders.length).setValues(outputRows);
  }
  
  // Formatting
  sheet.setFrozenRows(1);
  sheet.hideColumns(1); // Hide ID column
  sheet.autoResizeColumns(2, allHeaders.length - 1); // Resize visible columns
  
  ss.toast("Sync complete! Updated " + outputRows.length + " students.", "CRM Mirror Sync");
}

/**
 * Installs the hourly trigger for the sync.
 * Run this once manually.
 */
function setupHourlyTrigger() {
  // Check if already exists to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'syncFromSupabase') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  ScriptApp.newTrigger('syncFromSupabase')
      .timeBased()
      .everyHours(1)
      .create();
      
  SpreadsheetApp.getActiveSpreadsheet().toast("Hourly sync trigger installed.", "CRM Setup");
}
