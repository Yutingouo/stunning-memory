#Requires AutoHotkey v2.0
#SingleInstance Force

global floatGui := ""
global drugList := []
global listBox := ""
global isCollapsed := false
global currentResults := []
global excelPath := A_Desktop "\藥局藥品代碼.xlsx"
global sheetName := "藥品明細查詢(含櫃位、健保碼)"

Init()

^+f:: {
    if floatGui.Visible
        floatGui.Hide()
    else
        floatGui.Show("NoActivate")
}

Init() {
    LoadDrugData()
    CreateSearchBar()
}

LoadDrugData() {
    global drugList, excelPath, sheetName
    drugList := []
    if !FileExist(excelPath) {
        MsgBox("讀取失敗：找不到檔案`n" excelPath)
        return
    }
    tempTsv := A_Temp "\LibreSearch_drugs_" A_TickCount ".tsv"
    try {
        ExportXlsxSheetToTsv(excelPath, sheetName, tempTsv)
        data := FileRead(tempTsv, "UTF-8")
        for line in StrSplit(data, "`n", "`r") {
            if Trim(line) = ""
                continue
            parts := StrSplit(line, "`t")
            if parts.Length < 5
                continue
            row := Integer(parts[1])
            code := parts[2]
            healthCode := parts[3]
            name := parts[4]
            loc := parts[5]
            if loc = "" || loc = "#N/A"
                loc := "—"
            drugList.Push({ row: row, name: name, code: code, healthCode: healthCode, loc: loc })
        }
        if drugList.Length = 0
            MsgBox("讀取完成，但沒有找到藥品資料。請確認工作表名稱與欄位沒有變更。")
    } catch as e {
        MsgBox("讀取失敗：" e.Message)
    } finally {
        try FileDelete(tempTsv)
    }
}

ExportXlsxSheetToTsv(inputPath, targetSheetName, outputPath) {
    psPath := A_Temp "\LibreSearch_ReadXlsx_" A_TickCount ".ps1"
    psScript := BuildPowerShellReader()
    try {
        FileAppend(psScript, psPath, "UTF-8")
        command := "powershell.exe -NoProfile -ExecutionPolicy Bypass -File " QuoteArg(psPath)
            . " -InputPath " QuoteArg(inputPath)
            . " -SheetName " QuoteArg(targetSheetName)
            . " -OutputPath " QuoteArg(outputPath)
        exitCode := RunWait(command, , "Hide")
        if exitCode != 0
            throw Error("Excel 檔案解析失敗。")
    } finally {
        try FileDelete(psPath)
    }
}

BuildPowerShellReader() {
    lines := [
        "param(",
        "    [string]$InputPath,",
        "    [string]$SheetName,",
        "    [string]$OutputPath",
        ")",
        "$ErrorActionPreference = 'Stop'",
        "Add-Type -AssemblyName System.IO.Compression.FileSystem",
        "function Get-ZipText($Zip, [string]$EntryName) {",
        "    $entry = $Zip.GetEntry($EntryName)",
        "    if ($null -eq $entry) { return $null }",
        "    $reader = New-Object System.IO.StreamReader($entry.Open(), [System.Text.Encoding]::UTF8)",
        "    try { return $reader.ReadToEnd() } finally { $reader.Dispose() }",
        "}",
        "function Load-XmlText([string]$Text) {",
        "    $doc = New-Object System.Xml.XmlDocument",
        "    $doc.PreserveWhitespace = $false",
        "    $doc.LoadXml($Text)",
        "    return $doc",
        "}",
        "function Clean-Field($Value) {",
        "    if ($null -eq $Value) { return '' }",
        "    return ([string]$Value -replace '[\t\r\n]', ' ').Trim()",
        "}",
        "function Column-Name([string]$CellRef) {",
        "    return ([regex]::Match($CellRef, '^[A-Z]+')).Value",
        "}",
        "$zip = [System.IO.Compression.ZipFile]::OpenRead($InputPath)",
        "try {",
        "    $workbook = Load-XmlText (Get-ZipText $zip 'xl/workbook.xml')",
        "    $sheetNode = $null",
        "    foreach ($node in $workbook.SelectNodes('//*[local-name()=''sheets'']/*[local-name()=''sheet'']')) {",
        "        if ($node.GetAttribute('name') -eq $SheetName) {",
        "            $sheetNode = $node",
        "            break",
        "        }",
        "    }",
        "    if ($null -eq $sheetNode) { throw '找不到工作表：' + $SheetName }",
        "    $relationId = $sheetNode.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')",
        "    $rels = Load-XmlText (Get-ZipText $zip 'xl/_rels/workbook.xml.rels')",
        "    $target = $null",
        "    foreach ($rel in $rels.SelectNodes('//*[local-name()=''Relationship'']')) {",
        "        if ($rel.GetAttribute('Id') -eq $relationId) {",
        "            $target = $rel.GetAttribute('Target')",
        "            break",
        "        }",
        "    }",
        "    if ([string]::IsNullOrWhiteSpace($target)) { throw '找不到工作表資料路徑。' }",
        "    $target = $target.TrimStart('/')",
        "    if (-not $target.StartsWith('xl/')) { $target = 'xl/' + $target }",
        "    $shared = New-Object System.Collections.Generic.List[string]",
        "    $sharedText = Get-ZipText $zip 'xl/sharedStrings.xml'",
        "    if ($null -ne $sharedText) {",
        "        $sharedDoc = Load-XmlText $sharedText",
        "        foreach ($item in $sharedDoc.SelectNodes('//*[local-name()=''si'']')) {",
        "            $shared.Add($item.InnerText)",
        "        }",
        "    }",
        "    $sheetDoc = Load-XmlText (Get-ZipText $zip $target)",
        "    function Cell-Text($Cell) {",
        "        $type = $Cell.GetAttribute('t')",
        "        if ($type -eq 'inlineStr') {",
        "            $inline = $Cell.SelectSingleNode('*[local-name()=''is'']')",
        "            if ($null -eq $inline) { return '' }",
        "            return $inline.InnerText",
        "        }",
        "        $valueNode = $Cell.SelectSingleNode('*[local-name()=''v'']')",
        "        if ($null -eq $valueNode) { return '' }",
        "        $raw = $valueNode.InnerText",
        "        if ($type -eq 's' -and $raw -match '^\d+$') {",
        "            $index = [int]$raw",
        "            if ($index -ge 0 -and $index -lt $shared.Count) { return $shared[$index] }",
        "        }",
        "        return $raw",
        "    }",
        "    $lines = New-Object System.Collections.Generic.List[string]",
        "    foreach ($rowNode in $sheetDoc.SelectNodes('//*[local-name()=''sheetData'']/*[local-name()=''row'']')) {",
        "        $rowNumber = [int]$rowNode.GetAttribute('r')",
        "        if ($rowNumber -lt 2) { continue }",
        "        $values = @{}",
        "        foreach ($cell in $rowNode.SelectNodes('*[local-name()=''c'']')) {",
        "            $column = Column-Name $cell.GetAttribute('r')",
        "            if ($column -in @('A', 'B', 'C', 'E')) {",
        "                $values[$column] = Clean-Field (Cell-Text $cell)",
        "            }",
        "        }",
        "        $name = $values['C']",
        "        if ([string]::IsNullOrWhiteSpace($name)) { continue }",
        "        $fields = @($rowNumber, $values['A'], $values['B'], $name, $values['E'])",
        "        $lines.Add(($fields | ForEach-Object { Clean-Field $_ }) -join ([char]9))",
        "    }",
        "    $encoding = New-Object System.Text.UTF8Encoding $false",
        "    [System.IO.File]::WriteAllLines($OutputPath, $lines, $encoding)",
        "}",
        "finally {",
        "    $zip.Dispose()",
        "}"
    ]
    script := ""
    for line in lines
        script .= line "`r`n"
    return script
}

QuoteArg(value) {
    return '"' StrReplace(value, '"', '\"') '"'
}

CreateSearchBar() {
    global floatGui, listBox, searchBox
    floatGui := Gui("+AlwaysOnTop -Caption +ToolWindow +Border")
    floatGui.BackColor := "2C3E50"
    floatGui.SetFont("s10 cWhite bold", "Microsoft JhengHei")
    searchLabel := floatGui.Add("Text", "x8 y9 w50 cWhite", "🔍 搜尋")
    searchLabel.OnEvent("DoubleClick", ToggleCollapse)
    searchBox := floatGui.Add("Edit", "x65 y6 w360 h22 vSearchText Background404040 cWhite", "")
    searchBox.SetFont("s10", "Microsoft JhengHei")
    floatGui.Add("Button", "x432 y5 h24 w60", "🔄 重載").OnEvent("Click", (*) => LoadDrugData())
    floatGui.Add("Button", "x497 y5 h24 w30", "✕").OnEvent("Click", (*) => floatGui.Hide())
    listBox := floatGui.Add("ListBox", "x65 y32 w480 h150 vResultList Hidden Background404040 cWhite")
    listBox.SetFont("s10", "Microsoft JhengHei")
    listBox.OnEvent("DoubleClick", OnSelectItem)
    floatGui.OnEvent("Escape", (*) => floatGui.Hide())
    OnMessage(0x201, WM_LBUTTONDOWN)
    SetTimer(CheckSearch, 100)
    floatGui.Show("x" (A_ScreenWidth // 2 - 270) " y3 w545 h36 NoActivate")
}

ToggleCollapse(*) {
    global floatGui, listBox, isCollapsed
    if isCollapsed {
        isCollapsed := false
        floatGui.Move(, , 545, 36)
    } else {
        isCollapsed := true
        listBox.Delete()
        listBox.Visible := false
        floatGui.Move(, , 90, 36)
    }
}

WM_LBUTTONDOWN(wParam, lParam, msg, hwnd) {
    global floatGui
    static excludeTypes := ["Edit", "Button", "ListBox"]
    ctrlClass := WinGetClass("ahk_id " hwnd)
    for t in excludeTypes
        if InStr(ctrlClass, t)
            return
    if hwnd = floatGui.Hwnd || DllCall("IsChild", "Ptr", floatGui.Hwnd, "Ptr", hwnd)
        PostMessage(0xA1, 2, 0, , "ahk_id " floatGui.Hwnd)
}

CheckSearch() {
    global floatGui, drugList, listBox, isCollapsed, currentResults
    static lastKeyword := ""
    if isCollapsed
        return
    keyword := Trim(floatGui["SearchText"].Value)
    if keyword = lastKeyword
        return
    lastKeyword := keyword
    if keyword = "" {
        currentResults := []
        listBox.Delete()
        listBox.Visible := false
        floatGui.Move(, , 545, 36)
        return
    }
    results := []
    for item in drugList {
        if (InStr(item.name, keyword) || InStr(item.code, keyword) || InStr(item.healthCode, keyword))
            results.Push(item)
    }
    currentResults := results
    listBox.Delete()
    if results.Length = 0 {
        listBox.Visible := false
        floatGui.Move(, , 545, 36)
        return
    }
    for item in results
        listBox.Add([item.code " | " item.name " | 櫃位：" item.loc])
    rowHeight := 18
    listH := Min(results.Length, 5) * rowHeight + 10
    listBox.Move(, , , listH)
    listBox.Visible := true
    floatGui.Move(, , 545, 36 + listH + 4)
}

OnSelectItem(ctrl, *) {
    global currentResults
    idx := ctrl.Value
    if idx < 1 || idx > currentResults.Length
        return
    selected := currentResults[idx]
    A_Clipboard := selected.code
    ToolTip("已複製貨號：" selected.code)
    SetTimer(() => ToolTip(), -900)
    JumpToRow(selected.row)
}

JumpToRow(row) {
    global sheetName
    try {
        oExcel := ComObjActive("Excel.Application")
        oSheet := oExcel.ActiveWorkbook.Sheets(sheetName)
        oSheet.Cells(row, 3).Select()
        oExcel.ActiveWindow.ScrollRow := row
        WinMoveTop("ahk_exe EXCEL.EXE")
    } catch {
        ; Excel 沒開時只複製貨號，不打斷 POS 操作。
    }
}
