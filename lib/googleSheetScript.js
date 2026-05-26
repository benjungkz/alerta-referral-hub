const SHEET_SYNC_COLUMNS = {
  TIMESTAMP: 1,
  STATUS: 2,
  FIRST_NAME: 3,
  LAST_NAME: 4,
  EMAIL: 5,
  PHONE: 6,
  CONSENT: 7,
  NOTES: 8,
  ORGANIZATION_NAME: 9,
  REFERRAL_ID: 10,
  SEGMENT: 11,
  REPORTING_GROUP: 12,
  QR_CODE_URL: 13,
  RACK_CARD_URL: 14,
};

const SHEET_SYNC_FIELD_BY_COLUMN = {
  [SHEET_SYNC_COLUMNS.STATUS]: "status",
  [SHEET_SYNC_COLUMNS.FIRST_NAME]: "first_name",
  [SHEET_SYNC_COLUMNS.LAST_NAME]: "last_name",
  [SHEET_SYNC_COLUMNS.EMAIL]: "email",
  [SHEET_SYNC_COLUMNS.PHONE]: "phone",
  [SHEET_SYNC_COLUMNS.CONSENT]: "consent",
  [SHEET_SYNC_COLUMNS.NOTES]: "notes",
  [SHEET_SYNC_COLUMNS.ORGANIZATION_NAME]: "organization_name",
  [SHEET_SYNC_COLUMNS.SEGMENT]: "segment",
  [SHEET_SYNC_COLUMNS.REPORTING_GROUP]: "reporting_group",
};

const SHEET_SYNC_FIELD_LABEL_BY_COLUMN = {
  [SHEET_SYNC_COLUMNS.STATUS]: "Status",
  [SHEET_SYNC_COLUMNS.FIRST_NAME]: "First Name",
  [SHEET_SYNC_COLUMNS.LAST_NAME]: "Last Name",
  [SHEET_SYNC_COLUMNS.EMAIL]: "Email",
  [SHEET_SYNC_COLUMNS.PHONE]: "Phone",
  [SHEET_SYNC_COLUMNS.CONSENT]: "Consent",
  [SHEET_SYNC_COLUMNS.NOTES]: "Notes",
  [SHEET_SYNC_COLUMNS.ORGANIZATION_NAME]: "Organization Name",
  [SHEET_SYNC_COLUMNS.SEGMENT]: "Segment",
  [SHEET_SYNC_COLUMNS.REPORTING_GROUP]: "Reporting Group",
};

const SHEET_SYNC_PROTECTED_COLUMNS = new Set([
  SHEET_SYNC_COLUMNS.TIMESTAMP,
  SHEET_SYNC_COLUMNS.REFERRAL_ID,
  SHEET_SYNC_COLUMNS.QR_CODE_URL,
  SHEET_SYNC_COLUMNS.RACK_CARD_URL,
]);

const sheetSyncConfig = getSheetSyncConfig();

const SHEET_SYNC_SERVER_URL = `${sheetSyncConfig.baseUrl}/api/google-sheets/referrals`;

function getSheetSyncConfig() {
  const props = PropertiesService.getScriptProperties();
  const env = props.getProperty("ALERTA_ENV") || "dev";

  const baseUrl =
    props.getProperty(`ALERTA_API_BASE_URL_${env.toUpperCase()}`) || "";

  return {
    env,
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey: props.getProperty(`ALERTA_API_KEY_${env.toUpperCase()}`),
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function onReferralSheetEdit(e) {
  if (!e || !e.range) {
    return;
  }

  const range = e.range;
  const sheet = range.getSheet();
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  const startRow = range.getRow();
  const startColumn = range.getColumn();
  const rowCount = range.getNumRows();
  const columnCount = range.getNumColumns();

  // Skip header row
  if (startRow === 1) {
    return;
  }

  const editedColumns = [];

  for (let offset = 0; offset < columnCount; offset++) {
    const column = startColumn + offset;

    if (
      SHEET_SYNC_PROTECTED_COLUMNS.has(column) ||
      !SHEET_SYNC_FIELD_BY_COLUMN[column]
    ) {
      continue;
    }

    editedColumns.push(column);
  }

  // Skip if only protected or unsupported columns were edited
  if (editedColumns.length === 0) {
    return;
  }

  const ui = SpreadsheetApp.getUi();

  const confirmMessage = buildReferralUpdateConfirmMessage(e, editedColumns);

  const confirmResult = ui.alert(
    "Confirm Referral Update",
    confirmMessage,
    ui.ButtonSet.YES_NO,
  );

  if (confirmResult !== ui.Button.YES) {
    revertEditIfPossible(e);

    spreadsheet.toast(
      "Update canceled. The change was not synced.",
      "Alerta Home",
      5,
    );

    return;
  }

  const includesOrganizationName = editedColumns.includes(
    SHEET_SYNC_COLUMNS.ORGANIZATION_NAME,
  );

  spreadsheet.toast(
    includesOrganizationName
      ? "Updating referral and regenerating rack card. This may take up to 2 minutes..."
      : "Updating referral...",
    "Alerta Home",
    includesOrganizationName ? 60 : 30,
  );

  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let rackCardCompletedCount = 0;
  let rackCardFailedCount = 0;
  let rackCardSkippedCount = 0;
  let emailFailedCount = 0;

  for (let rowOffset = 0; rowOffset < rowCount; rowOffset++) {
    const row = startRow + rowOffset;

    if (row === 1) {
      continue;
    }

    const result = sendReferralSheetUpdate(sheet, row, editedColumns);

    if (result.status === "success") {
      successCount++;

      if (result.rackCardStatus === "completed") {
        rackCardCompletedCount++;
      } else if (result.rackCardStatus === "failed") {
        rackCardFailedCount++;
      } else if (result.rackCardStatus === "skipped") {
        rackCardSkippedCount++;
      }

      if (result.emailStatus === "failed") {
        emailFailedCount++;
      }
    } else if (result.status === "skipped") {
      skippedCount++;
    } else {
      failedCount++;
    }
  }

  if (failedCount > 0) {
    spreadsheet.toast(
      `Sync completed with errors. Success: ${successCount}, Failed: ${failedCount}, Skipped: ${skippedCount}`,
      "Alerta Home",
      10,
    );

    return;
  }

  if (successCount === 0 && skippedCount > 0) {
    spreadsheet.toast(
      `Sync skipped. No valid Referral ID found. Skipped: ${skippedCount}`,
      "Alerta Home",
      8,
    );

    return;
  }

  if (rackCardFailedCount > 0) {
    spreadsheet.toast(
      "Referral updated, but rack card regeneration failed.",
      "Alerta Home",
      10,
    );

    return;
  }

  if (emailFailedCount > 0) {
    spreadsheet.toast(
      "Referral and rack card updated, but email resend failed.",
      "Alerta Home",
      10,
    );

    return;
  }

  if (rackCardSkippedCount > 0) {
    spreadsheet.toast(
      "Referral updated, but rack card regeneration was skipped.",
      "Alerta Home",
      10,
    );

    return;
  }

  if (rackCardCompletedCount > 0) {
    spreadsheet.toast(
      "Referral updated. New rack card URL added and email resent.",
      "Alerta Home",
      8,
    );

    return;
  }

  spreadsheet.toast(`Sync completed successfully.`, "Alerta Home", 5);
}

function buildReferralUpdateConfirmMessage(e, editedColumns) {
  const range = e.range;

  const rowCount = range.getNumRows();
  const columnCount = range.getNumColumns();

  // Single-cell edit: oldValue and value are usually available.
  if (rowCount === 1 && columnCount === 1) {
    const column = range.getColumn();

    const fieldName = getSheetSyncFieldLabel(column);

    const oldValue =
      typeof e.oldValue !== "undefined" && e.oldValue !== null
        ? String(e.oldValue)
        : "(empty)";

    const newValue =
      typeof e.value !== "undefined" && e.value !== null
        ? String(e.value)
        : "(empty)";

    return [
      `Field: ${fieldName}`,
      "",
      "Previous Data:",
      oldValue,
      "",
      "New Data:",
      newValue,
      "",
      "Do you want to update this referral record?",
    ].join("\n");
  }

  // Multi-cell edit or paste:
  // Apps Script usually does not provide old values for multi-cell edits.
  const fieldNames = editedColumns.map((column) => {
    return getSheetSyncFieldLabel(column);
  });

  return [
    "Multiple fields were changed.",
    "",
    `Fields: ${fieldNames.join(", ")}`,
    "",
    "Previous Data:",
    "Previous values cannot be safely detected for multi-cell edits.",
    "",
    "New Data:",
    "The edited values in the selected range will be synced.",
    "",
    "Do you want to update these referral records?",
  ].join("\n");
}

function getSheetSyncFieldLabel(column) {
  return SHEET_SYNC_FIELD_LABEL_BY_COLUMN[column] || `Column ${column}`;
}

function revertEditIfPossible(e) {
  const range = e.range;

  const rowCount = range.getNumRows();
  const columnCount = range.getNumColumns();

  // e.oldValue is usually only available for single-cell edits.
  if (rowCount === 1 && columnCount === 1) {
    if (typeof e.oldValue !== "undefined") {
      range.setValue(e.oldValue);
    } else {
      range.clearContent();
    }

    return;
  }

  // Multi-cell paste/edit cannot be safely reverted with e.oldValue.
  Logger.log(
    "Multi-cell edit was canceled, but the previous values could not be restored automatically.",
  );
}

function sendReferralSheetUpdate(sheet, row, editedColumns) {
  const referralId = String(
    sheet.getRange(row, SHEET_SYNC_COLUMNS.REFERRAL_ID).getValue() || "",
  ).trim();

  if (!referralId) {
    Logger.log(`Row ${row}: Referral ID is empty. Update skipped.`);
    return {
      status: "skipped",
    };
  }

  const payload = {
    referral_id: referralId,
  };

  editedColumns.forEach((column) => {
    const field = SHEET_SYNC_FIELD_BY_COLUMN[column];
    const value = sheet.getRange(row, column).getValue();

    payload[field] = value === null || value === undefined ? "" : String(value);
  });

  const options = {
    method: "patch",
    contentType: "application/json",
    headers: {
      "x-alerta-api-key": sheetSyncConfig.apiKey,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(SHEET_SYNC_SERVER_URL, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode >= 200 && responseCode < 300) {
      const responseData = JSON.parse(responseBody || "{}");
      const rackCardUrl = responseData.rack_card_url || "";

      if (rackCardUrl) {
        sheet
          .getRange(row, SHEET_SYNC_COLUMNS.RACK_CARD_URL)
          .setValue(rackCardUrl);
      }

      Logger.log(`Row ${row}: Referral update synced successfully.`);
      return {
        status: "success",
        rackCardStatus: responseData.rack_card_status || "",
        emailStatus: responseData.email_status || "",
      };
    }

    Logger.log(
      `Row ${row}: Referral update sync failed. ${responseCode} ${responseBody}`,
    );

    return {
      status: "failed",
    };
  } catch (error) {
    Logger.log(`Row ${row}: Referral update API error: ${error}`);
    return {
      status: "failed",
    };
  }
}
