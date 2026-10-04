const SAMPLE_VENDORS = window.VENDOR_DATA || [];
const storageKey = "return-rule-vendors-demo-v13";

const elements = {
  form: document.querySelector("#lookupForm"),
  vendorCode: document.querySelector("#vendorCode"),
  expiryDate: document.querySelector("#expiryDate"),
  productTypeField: document.querySelector("#productTypeField"),
  productType: document.querySelector("#productType"),
  productTypeStatus: document.querySelector("#productTypeStatus"),
  currentDate: document.querySelector("#currentDate"),
  currentDateStatus: document.querySelector("#currentDateStatus"),
  resultPanel: document.querySelector("#resultPanel"),
  vendorList: document.querySelector("#vendorList"),
  vendorJson: document.querySelector("#vendorJson"),
  dataEditor: document.querySelector("#dataEditor"),
  dataStatus: document.querySelector("#dataStatus"),
  editorMessage: document.querySelector("#editorMessage"),
  updateGuide: document.querySelector("#updateGuide"),
  toggleGuideButton: document.querySelector("#toggleGuideButton"),
  toggleDataButton: document.querySelector("#toggleDataButton"),
  saveDataButton: document.querySelector("#saveDataButton"),
  sampleDataButton: document.querySelector("#sampleDataButton"),
  downloadCsvButton: document.querySelector("#downloadCsvButton"),
  vendorFile: document.querySelector("#vendorFile"),
  resetButton: document.querySelector("#resetButton")
};

let vendors = SAMPLE_VENDORS;

function getCurrentMonthValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatMonthLabel(value) {
  return value.replace("-", "/");
}

function updateCurrentMonth() {
  const currentMonth = getCurrentMonthValue();
  elements.currentDate.value = currentMonth;
  elements.currentDate.defaultValue = currentMonth;
  elements.currentDateStatus.textContent = `已自動偵測本月：${formatMonthLabel(currentMonth)}`;
}

async function loadVendors() {
  if (location.protocol === "file:") {
    return SAMPLE_VENDORS;
  }

  try {
    const response = await fetch(`./vendors.json?updated=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("資料檔讀取失敗。");
    }
    return validateVendors(await response.json());
  } catch {
    return SAMPLE_VENDORS;
  }
}

function validateVendors(value) {
  if (!Array.isArray(value)) {
    throw new Error("資料必須是陣列。");
  }

  return value.flatMap((item, index) => {
    const rawCode = String(item.vendor_code || item["廠編"] || item.code || "").trim().toUpperCase();
    const rawName = String(item.vendor_name || item["廠商名稱"] || item.name || "").trim();
    const deliveryVendor = String(item.delivery_vendor || item["代送商"] || "").trim();
    const conditionText = String(item.condition_text || item["退貨效期"] || item.condition || "").trim();
    const returnMethod = String(item.return_method || item["退貨方式"] || "").trim();
    const minMonths = normalizeMinMonths(item.min_months, conditionText || returnMethod);
    const hasUsefulData = [rawCode, rawName, deliveryVendor, conditionText, returnMethod].some(Boolean);

    if (!hasUsefulData) {
      return [];
    }

    const code = rawCode || `未編${String(index + 1).padStart(3, "0")}`;
    const name = rawName || "(未填廠商名稱)";

    return {
      vendor_code: code,
      delivery_vendor: deliveryVendor,
      vendor_name: name,
      min_months: minMonths === null ? null : Math.floor(minMonths),
      policy_type: String(item.policy_type || (minMonths === null ? "conditional" : "months")).trim(),
      condition_text: conditionText || (minMonths === null ? "未填退貨條件" : `效期需至少 ${Math.floor(minMonths)} 個月以上`),
      return_method: returnMethod,
      phone: String(item.phone || item["公司電話"] || "").trim(),
      fax: String(item.fax || item["傳真"] || "").trim(),
      contact: String(item.contact || item["聯絡人(手機)"] || item["聯絡人"] || "").trim(),
      note: String(item.note || item["備註"] || "").trim(),
      source_sheet: String(item.source_sheet || "").trim()
    };
  });
}

function normalizeMinMonths(rawValue, fallbackText) {
  if (rawValue === null || rawValue === "" || rawValue === undefined) {
    return extractMonthNumber(fallbackText);
  }

  const directNumber = Number(rawValue);
  if (Number.isFinite(directNumber) && directNumber >= 0) {
    return directNumber;
  }

  return extractMonthNumber(`${rawValue} ${fallbackText}`);
}

function extractMonthNumber(text) {
  const normalized = String(text || "")
    .replaceAll("個月以上", "個月")
    .replaceAll(" 個月", "個月");

  if (!normalized.trim()) {
    return null;
  }

  if (normalized.includes("半年")) {
    return 6;
  }

  if (/1\s*年|一年/.test(normalized)) {
    return 12;
  }

  const monthMatches = [...normalized.matchAll(/(\d+)\s*個?月/g)].map((match) => Number(match[1]));
  if (monthMatches.length > 0) {
    return Math.max(...monthMatches);
  }

  const compactMatches = [...normalized.matchAll(/[水粉液體膠囊粉錠肉鬆]\s*(\d+)/g)].map((match) => Number(match[1]));
  if (compactMatches.length > 0) {
    return Math.max(...compactMatches);
  }

  return null;
}

function parseYearMonth(value) {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(\d{4})[/-]?(\d{1,2})$/);

  if (!match) {
    throw new Error("效期年月格式需為 YYYY/MM、YYYY-MM 或 YYYYMM。");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (month < 1 || month > 12) {
    throw new Error("月份需介於 01 到 12。");
  }

  return { year, month, label: `${year}/${String(month).padStart(2, "0")}` };
}

function calculateRemainingMonths(current, expiry) {
  return (expiry.year - current.year) * 12 + (expiry.month - current.month);
}

function parseProductRules(vendor) {
  const text = vendor?.condition_text || "";
  const patterns = [
    { label: "膠囊粉錠", pattern: /膠囊粉錠(?:效期)?\s*(\d+)\s*個?月?/ },
    { label: "粉和肉鬆", pattern: /粉和肉鬆\s*(\d+)\s*個?月?/ },
    { label: "液體", pattern: /液體\s*(\d+)\s*個?月?/ },
    { label: "水", pattern: /水\s*(\d+)\s*個?月?/ },
    { label: "粉", pattern: /粉\s*(\d+)\s*個?月?/ }
  ];

  return patterns.reduce((rules, item) => {
    const match = text.match(item.pattern);
    if (!match) {
      return rules;
    }

    const months = Number(match[1]);
    if (!Number.isFinite(months)) {
      return rules;
    }

    if (!rules.some((rule) => rule.label === item.label)) {
      rules.push({ label: item.label, months });
    }
    return rules;
  }, []);
}

function updateProductTypeOptions() {
  const vendor = findVendor(elements.vendorCode.value);
  const rules = parseProductRules(vendor);

  if (!vendor || rules.length < 2) {
    elements.productTypeField.hidden = true;
    elements.productType.required = false;
    elements.productType.innerHTML = "";
    elements.productTypeStatus.textContent = "";
    return rules;
  }

  const previousValue = elements.productType.value;
  elements.productTypeField.hidden = false;
  elements.productType.required = true;
  elements.productType.innerHTML = [
    `<option value="">請選擇品項類型</option>`,
    ...rules.map((rule, index) => {
      return `<option value="${index}">${escapeHtml(rule.label)}：${rule.months} 個月</option>`;
    })
  ].join("");
  elements.productType.value = rules[previousValue] ? previousValue : "";
  elements.productTypeStatus.textContent = "此廠商有不同品項門檻，請先選水、粉或對應類型。";
  return rules;
}

function findVendor(query) {
  const normalized = String(query || "").trim().toUpperCase();
  const padded = /^\d+$/.test(normalized) ? normalized.padStart(3, "0") : normalized;
  return vendors.find((vendor) => vendor.vendor_code === padded)
    || vendors.find((vendor) => vendor.vendor_name.toUpperCase().includes(normalized));
}

function renderVendors() {
  elements.dataStatus.textContent = `${vendors.length} 筆資料`;
  elements.vendorJson.value = JSON.stringify(vendors, null, 2);
  elements.vendorList.innerHTML = vendors
    .slice(0, 80)
    .map((vendor) => {
      const rule = vendor.min_months === null ? "需人工確認" : `門檻 ${vendor.min_months} 個月`;
      return `
        <article class="vendor-item">
          <h3>${escapeHtml(vendor.vendor_code)}｜${escapeHtml(vendor.vendor_name)}</h3>
          <p>${escapeHtml(vendor.condition_text)} · ${escapeHtml(rule)}</p>
        </article>
      `;
    })
    .join("");
}

function renderResult(result) {
  if (result.error) {
    elements.resultPanel.innerHTML = `
      <div class="result-banner is-warn">
        <h2>無法完成查詢</h2>
        <p>${escapeHtml(result.error)}</p>
      </div>
    `;
    return;
  }

  const { vendor, current, expiry, remainingMonths, selectedRule, requiredMonths } = result;
  if (vendor.vendor_name === "(未填廠商名稱)" || vendor.condition_text === "未填退貨條件") {
    elements.resultPanel.innerHTML = `
      <article class="result-card">
        <div class="result-banner is-warn">
          <h2>這筆廠商資料不完整</h2>
          <p>目前資料檔缺少廠商名稱或退貨規則。請先確認 Excel 已存檔，再重新執行「更新廠商資料.bat」。</p>
        </div>
        <dl class="detail-list">
          <div><dt>廠商代碼</dt><dd>${escapeHtml(vendor.vendor_code)}</dd></div>
          <div><dt>廠商名稱</dt><dd>${escapeHtml(vendor.vendor_name)}</dd></div>
          <div><dt>退貨規則</dt><dd>${escapeHtml(vendor.condition_text)}</dd></div>
          <div><dt>基準年月</dt><dd>${escapeHtml(current.label)}</dd></div>
          <div><dt>效期年月</dt><dd>${escapeHtml(expiry.label)}</dd></div>
        </dl>
      </article>
    `;
    return;
  }

  const decision = decideReturnStatus(vendor, remainingMonths, requiredMonths);
  const gap = requiredMonths === null ? "未設定" : remainingMonths - requiredMonths;
  const productDetail = selectedRule
    ? `<div><dt>品項類型</dt><dd>${escapeHtml(selectedRule.label)}（門檻 ${selectedRule.months} 個月）</dd></div>`
    : "";

  elements.resultPanel.innerHTML = `
    <article class="result-card">
      <div class="result-banner ${decision.bannerClass}">
        <h2>${escapeHtml(decision.title)}</h2>
        <p>${escapeHtml(decision.message)}</p>
      </div>

      <div class="metric-grid">
        <div class="metric">
          <span>剩餘效期</span>
          <strong>${remainingMonths}</strong>
        </div>
        <div class="metric">
          <span>最低門檻</span>
          <strong>${requiredMonths === null ? "-" : requiredMonths}</strong>
        </div>
        <div class="metric">
          <span>差額</span>
          <strong>${gap}</strong>
        </div>
      </div>

      <dl class="detail-list">
        <div><dt>廠商</dt><dd>${escapeHtml(vendor.vendor_name)}（${escapeHtml(vendor.vendor_code)}）</dd></div>
        <div><dt>代送商</dt><dd>${escapeHtml(vendor.delivery_vendor || "無")}</dd></div>
        ${productDetail}
        <div><dt>基準年月</dt><dd>${escapeHtml(current.label)}</dd></div>
        <div><dt>效期年月</dt><dd>${escapeHtml(expiry.label)}</dd></div>
        <div><dt>退貨規則</dt><dd>${escapeHtml(vendor.condition_text)}</dd></div>
        <div><dt>退貨方式</dt><dd>${escapeHtml(vendor.return_method || "未填")}</dd></div>
        <div><dt>聯絡資訊</dt><dd>${escapeHtml([vendor.phone, vendor.fax, vendor.contact].filter(Boolean).join(" / ") || "未填")}</dd></div>
        <div><dt>備註</dt><dd>${escapeHtml(vendor.note || "無")}</dd></div>
      </dl>
    </article>
  `;
}

function handleLookup(event) {
  event.preventDefault();

  try {
    const vendor = findVendor(elements.vendorCode.value);
    if (!vendor) {
      throw new Error("找不到此廠商代碼或名稱，請確認資料是否已建立。");
    }

    const current = parseYearMonth(elements.currentDate.value);
    const expiry = parseYearMonth(elements.expiryDate.value);
    const remainingMonths = calculateRemainingMonths(current, expiry);
    const productRules = updateProductTypeOptions();
    const selectedRule = productRules.length >= 2 && elements.productType.value !== ""
      ? productRules[Number(elements.productType.value)]
      : null;

    if (productRules.length >= 2 && !selectedRule) {
      throw new Error("此廠商有水、粉等不同計算方式，請先選擇品項類型。");
    }

    renderResult({
      vendor,
      current,
      expiry,
      remainingMonths,
      selectedRule,
      requiredMonths: selectedRule ? selectedRule.months : vendor.min_months
    });
  } catch (error) {
    renderResult({ error: error.message });
  }
}

function decideReturnStatus(vendor, remainingMonths, requiredMonths) {
  if (vendor.policy_type === "no_return") {
    return {
      bannerClass: "is-bad",
      title: "此廠商標示為禁退",
      message: "原始條件含禁退或不可退，請勿只用效期月份判斷。"
    };
  }

  if (requiredMonths === null) {
    return {
      bannerClass: "is-warn",
      title: "需要人工確認",
      message: "此廠商條件不是單純月份門檻，請依退貨規則、退貨方式或業務窗口確認。"
    };
  }

  const gap = remainingMonths - requiredMonths;
  return {
    bannerClass: gap >= 0 ? "is-ok" : "is-bad",
    title: gap >= 0 ? "符合退貨條件" : "不符合退貨條件",
    message: gap >= 0
      ? `剩餘效期已達門檻，超過最低需求 ${gap} 個月。`
      : `剩餘效期不足，尚差 ${Math.abs(gap)} 個月。`
  };
}

function saveVendorsFromEditor() {
  try {
    vendors = validateVendors(JSON.parse(elements.vendorJson.value));
    localStorage.setItem(storageKey, JSON.stringify(vendors));
    elements.editorMessage.textContent = "資料已套用。";
    updateProductTypeOptions();
    renderVendors();
  } catch (error) {
    elements.editorMessage.textContent = error.message;
  }
}

function resetSampleData() {
  vendors = SAMPLE_VENDORS;
  localStorage.setItem(storageKey, JSON.stringify(vendors));
  elements.editorMessage.textContent = "已載入虛構示範資料。";
  updateProductTypeOptions();
  renderVendors();
}

function importVendorFile(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      vendors = validateVendors(JSON.parse(String(reader.result || "")));
      localStorage.setItem(storageKey, JSON.stringify(vendors));
      elements.editorMessage.textContent = `已匯入 ${vendors.length} 筆新版資料。`;
      updateProductTypeOptions();
      renderVendors();
    } catch (error) {
      elements.editorMessage.textContent = `匯入失敗：${error.message}`;
    } finally {
      elements.vendorFile.value = "";
    }
  });
  reader.readAsText(file, "utf-8");
}

function downloadCsv() {
  const header = ["vendor_code", "delivery_vendor", "vendor_name", "min_months", "policy_type", "condition_text", "return_method", "phone", "fax", "contact", "note", "source_sheet"];
  const rows = vendors.map((vendor) => header.map((key) => csvCell(vendor[key])).join(","));
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "return-rule-vendors.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

updateCurrentMonth();
window.addEventListener("pageshow", updateCurrentMonth);
elements.form.addEventListener("submit", handleLookup);
elements.vendorCode.addEventListener("input", updateProductTypeOptions);
elements.toggleGuideButton.addEventListener("click", () => {
  const isHidden = elements.updateGuide.hidden;
  elements.updateGuide.hidden = !isHidden;
  elements.toggleGuideButton.textContent = isHidden ? "收合教學" : "更新 Excel 教學";
});
elements.resetButton.addEventListener("click", () => {
  elements.form.reset();
  updateCurrentMonth();
  updateProductTypeOptions();
  elements.resultPanel.innerHTML = `
    <div class="empty-state">
      <h2>輸入廠商與效期後，結果會顯示在這裡。</h2>
      <p>系統會用「效期年月 - 基準年月」計算剩餘月數，再比對廠商最低退貨門檻。</p>
    </div>
  `;
});
elements.toggleDataButton.addEventListener("click", () => {
  const isHidden = elements.dataEditor.hidden;
  elements.dataEditor.hidden = !isHidden;
  elements.toggleDataButton.textContent = isHidden ? "收合" : "編輯";
});
elements.saveDataButton.addEventListener("click", saveVendorsFromEditor);
elements.sampleDataButton.addEventListener("click", resetSampleData);
elements.downloadCsvButton.addEventListener("click", downloadCsv);
elements.vendorFile.addEventListener("change", importVendorFile);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("service-worker.js");
}

loadVendors().then((loadedVendors) => {
  vendors = loadedVendors;
  updateProductTypeOptions();
  renderVendors();
});
