import argparse
import json
import re
import struct
from pathlib import Path


def parse_xls(path):
    data = Path(path).read_bytes()

    def u16(buf, offset):
        return struct.unpack_from("<H", buf, offset)[0]

    def u32(buf, offset):
        return struct.unpack_from("<I", buf, offset)[0]

    def double_from_u64(value):
        return struct.unpack("<d", struct.pack("<Q", value))[0]

    sector_size = 1 << u16(data, 30)
    mini_sector_size = 1 << u16(data, 32)
    fat_count = u32(data, 44)
    first_dir = u32(data, 48)
    mini_cutoff = u32(data, 56)
    first_mini_fat = u32(data, 60)
    first_difat = u32(data, 68)
    difat_count = u32(data, 72)

    def sector_offset(sector_id):
        return (sector_id + 1) * sector_size

    fat_sector_ids = list(struct.unpack_from("<109I", data, 76))[:fat_count]
    sector_id = first_difat
    for _ in range(difat_count):
        entries = list(struct.unpack_from("<" + "I" * (sector_size // 4), data, sector_offset(sector_id)))
        fat_sector_ids.extend([item for item in entries[:-1] if item != 0xFFFFFFFF])
        sector_id = entries[-1]

    fat = []
    for sector_id in fat_sector_ids:
        fat.extend(struct.unpack_from("<" + "I" * (sector_size // 4), data, sector_offset(sector_id)))

    def chain(start):
        output = []
        sector_id = start
        seen = set()
        while sector_id not in (0xFFFFFFFE, 0xFFFFFFFF) and sector_id < len(fat) and sector_id not in seen:
            seen.add(sector_id)
            output.append(sector_id)
            sector_id = fat[sector_id]
        return output

    def read_chain(start, size=None):
        content = b"".join(data[sector_offset(item):sector_offset(item) + sector_size] for item in chain(start))
        return content if size is None else content[:size]

    directory = read_chain(first_dir)
    entries = []
    for offset in range(0, len(directory), 128):
        entry = directory[offset:offset + 128]
        if len(entry) < 128:
            continue
        name_length = u16(entry, 64)
        if name_length < 2:
            continue
        name = entry[:name_length - 2].decode("utf-16le", "ignore")
        entries.append({
            "name": name,
            "type": entry[66],
            "start": u32(entry, 116),
            "size": struct.unpack_from("<Q", entry, 120)[0],
        })

    root = next((entry for entry in entries if entry["type"] == 5), None)
    mini_stream = read_chain(root["start"], root["size"]) if root else b""
    mini_fat = []
    if first_mini_fat not in (0xFFFFFFFE, 0xFFFFFFFF):
        for sector_id in chain(first_mini_fat):
            mini_fat.extend(struct.unpack_from("<" + "I" * (sector_size // 4), data, sector_offset(sector_id)))

    def read_mini(start, size):
        output = []
        sector_id = start
        seen = set()
        while sector_id not in (0xFFFFFFFE, 0xFFFFFFFF) and sector_id < len(mini_fat) and sector_id not in seen:
            seen.add(sector_id)
            start_offset = sector_id * mini_sector_size
            output.append(mini_stream[start_offset:start_offset + mini_sector_size])
            sector_id = mini_fat[sector_id]
        return b"".join(output)[:size]

    streams = {}
    for entry in entries:
        if entry["type"] == 2:
            if entry["size"] < mini_cutoff and mini_fat:
                streams[entry["name"]] = read_mini(entry["start"], entry["size"])
            else:
                streams[entry["name"]] = read_chain(entry["start"], entry["size"])

    workbook = streams.get("Workbook") or streams.get("Book")
    if not workbook:
        raise RuntimeError("找不到 Excel Workbook stream。")

    records = []
    sheets = []
    position = 0
    while position + 4 <= len(workbook):
        record_type, length = struct.unpack_from("<HH", workbook, position)
        payload = workbook[position + 4:position + 4 + length]
        records.append((position, record_type, payload))
        if record_type == 0x0085 and len(payload) >= 8:
            bof_position = u32(payload, 0)
            name_length = payload[6]
            flags = payload[7]
            raw = payload[8:]
            if flags & 1:
                name = raw[:name_length * 2].decode("utf-16le", "ignore")
            else:
                name = raw[:name_length].decode("latin1", "ignore")
            sheets.append((name, bof_position))
        position += 4 + length

    def read_xl_unicode(buf, offset, has_length=True, char_count=None):
        if has_length:
            if offset + 2 > len(buf):
                return "", offset
            char_count = u16(buf, offset)
            offset += 2
        if offset >= len(buf):
            return "", offset
        flags = buf[offset]
        offset += 1
        has_rich_text = flags & 8
        has_extension = flags & 4
        is_utf16 = flags & 1
        rich_text_runs = 0
        extension_length = 0
        if has_rich_text and offset + 2 <= len(buf):
            rich_text_runs = u16(buf, offset)
            offset += 2
        if has_extension and offset + 4 <= len(buf):
            extension_length = u32(buf, offset)
            offset += 4
        byte_length = char_count * (2 if is_utf16 else 1)
        raw = buf[offset:offset + byte_length]
        text = raw.decode("utf-16le" if is_utf16 else "latin1", "ignore")
        offset += byte_length + rich_text_runs * 4 + extension_length
        return text, offset

    shared_strings = []
    index = 0
    while index < len(records):
        _, record_type, payload = records[index]
        if record_type == 0x00FC:
            blob = bytearray(payload)
            next_index = index + 1
            while next_index < len(records) and records[next_index][1] == 0x003C:
                blob.extend(records[next_index][2])
                next_index += 1
            if len(blob) >= 8:
                unique_count = u32(blob, 4)
                offset = 8
                for _ in range(unique_count):
                    text, offset = read_xl_unicode(blob, offset)
                    shared_strings.append(text)
            index = next_index
        else:
            index += 1

    def read_rk(rk):
        raw = rk & 0xFFFFFFFC
        if rk & 0x02:
            value = raw >> 2
            if value & (1 << 29):
                value -= 1 << 30
        else:
            value = double_from_u64(raw << 32)
        if rk & 0x01:
            value /= 100
        return value

    output = []
    for index, (sheet_name, start) in enumerate(sheets):
        end = sheets[index + 1][1] if index + 1 < len(sheets) else len(workbook)
        cells = []
        position = start
        while position + 4 <= end and position + 4 <= len(workbook):
            record_type, length = struct.unpack_from("<HH", workbook, position)
            payload = workbook[position + 4:position + 4 + length]
            if record_type == 0x00FD and len(payload) >= 10:
                row, col, _, string_index = struct.unpack_from("<HHHI", payload, 0)
                value = shared_strings[string_index] if string_index < len(shared_strings) else ""
                cells.append((row, col, value))
            elif record_type == 0x0204 and len(payload) >= 8:
                row, col, _ = struct.unpack_from("<HHH", payload, 0)
                value, _ = read_xl_unicode(payload, 6)
                cells.append((row, col, value))
            elif record_type == 0x0203 and len(payload) >= 14:
                row, col, _ = struct.unpack_from("<HHH", payload, 0)
                cells.append((row, col, struct.unpack_from("<d", payload, 6)[0]))
            elif record_type == 0x027E and len(payload) >= 10:
                row, col, _ = struct.unpack_from("<HHH", payload, 0)
                cells.append((row, col, read_rk(u32(payload, 6))))
            elif record_type == 0x00BD and len(payload) >= 6:
                row, first_col = struct.unpack_from("<HH", payload, 0)
                last_col = u16(payload, len(payload) - 2)
                offset = 4
                for col in range(first_col, last_col + 1):
                    if offset + 6 > len(payload) - 2:
                        break
                    cells.append((row, col, read_rk(u32(payload, offset + 2))))
                    offset += 6
            elif record_type == 0x000A:
                break
            position += 4 + length
        output.append((sheet_name, cells))
    return output


def clean_cell(value):
    if value is None:
        return ""
    if isinstance(value, float):
        if abs(value - round(value)) < 1e-9:
            return str(int(round(value)))
        return str(value)
    return re.sub(r"\s+", " ", str(value)).strip()


def extract_months(text):
    normalized = text.replace("個月以上", "個月").replace(" 個月", "個月")
    if "半年" in normalized:
        return 6
    if re.search(r"1\s*年|一年", normalized):
        return 12
    matches = [int(item) for item in re.findall(r"(\d+)\s*個?月", normalized)]
    if matches:
        return max(matches)
    matches = [int(item) for item in re.findall(r"效期\s*(\d+)", normalized)]
    if matches:
        return max(matches)
    return None


def infer_policy(text):
    normalized = text.strip()
    if not normalized:
        return "unknown", None
    if any(keyword in normalized for keyword in ["禁退", "不可退"]):
        return "no_return", None
    months = extract_months(normalized)
    conditional_keywords = ["通知", "洽", "看商品", "滯銷", "瑕疵", "換貨", "可退", "無效期", "效期長", "當月"]
    if any(keyword in normalized for keyword in conditional_keywords):
        return "conditional", months
    return ("months", months) if months is not None else ("conditional", None)


def build_vendors(sheets):
    vendors = []
    for sheet_name, cells in sheets:
        grid = {(row, col): clean_cell(value) for row, col, value in cells}
        rows = sorted(set(row for row, _, _ in cells))
        for row in rows:
            if row == 0:
                continue
            code = grid.get((row, 0), "")
            name = grid.get((row, 2), "")
            condition = grid.get((row, 3), "")
            method = grid.get((row, 4), "")
            if not code and not name and not condition and not method:
                continue
            if code == "廠編" or name == "廠商名稱":
                continue
            if not code and not name:
                continue

            policy_type, min_months = infer_policy(condition or method)
            note_parts = []
            for label, col in [("退貨方式", 4), ("電話", 5), ("傳真", 6), ("聯絡人", 7), ("備註", 8)]:
                value = grid.get((row, col), "")
                if value:
                    note_parts.append(f"{label}: {value}")

            vendors.append({
                "vendor_code": code.zfill(3) if code.isdigit() else code,
                "delivery_vendor": grid.get((row, 1), ""),
                "vendor_name": name or "(未填廠商名稱)",
                "min_months": min_months,
                "policy_type": policy_type,
                "condition_text": condition or method or "未填退貨條件",
                "return_method": method,
                "phone": grid.get((row, 5), ""),
                "fax": grid.get((row, 6), ""),
                "contact": grid.get((row, 7), ""),
                "note": "；".join(note_parts),
                "source_sheet": sheet_name,
            })
    return vendors


def main():
    parser = argparse.ArgumentParser(description="將舊版 .xls 廠商退貨條件轉成 vendors.json / vendors-data.js")
    parser.add_argument("--input", required=True, help="Excel .xls 路徑")
    parser.add_argument("--json", required=True, help="輸出的 vendors.json 路徑")
    parser.add_argument("--js", required=True, help="輸出的 vendors-data.js 路徑")
    args = parser.parse_args()

    vendors = build_vendors(parse_xls(args.input))
    json_text = json.dumps(vendors, ensure_ascii=False, indent=2)
    Path(args.json).write_text(json_text, encoding="utf-8")
    Path(args.js).write_text("export const VENDOR_DATA = " + json_text + ";\n", encoding="utf-8")
    print(f"已輸出 {len(vendors)} 筆廠商資料")


if __name__ == "__main__":
    main()
