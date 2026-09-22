#!/usr/bin/env python3
"""
Agribank Questions Builder Script
---------------------------------
Builds and maintains `data/questions.json` and `data/questions.js` for the web app.

Features:
- Scans `data/incoming/` for XLSX, CSV, and JSON files
- Parses multi-sheet Excel files with automated table header & column detection
- Categorizes by Topic (Chuyên đề) and Exam Batch (Đợt thi: Đợt 1, Đợt 2)
- Merges common questions across batches without duplication, tracking batch tags
- Generates synchronized `data/questions.json` and `data/questions.js`
"""

import sys
import os
import re
import json
import csv
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
INCOMING_DIR = DATA_DIR / "incoming"
QUESTIONS_JSON_PATH = DATA_DIR / "questions.json"
QUESTIONS_JS_PATH = DATA_DIR / "questions.js"


def extract_xlsx_rows(file_path):
    """Extracts all text from all sheets of an xlsx file without external dependencies."""
    sheets_data = []
    try:
        with zipfile.ZipFile(file_path, 'r') as zip_ref:
            shared_strings = []
            if 'xl/sharedStrings.xml' in zip_ref.namelist():
                with zip_ref.open('xl/sharedStrings.xml') as f:
                    tree = ET.parse(f)
                    for si in tree.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
                        t = si.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                        if t is not None:
                            shared_strings.append(t.text or "")
                        else:
                            parts = []
                            for r in si.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}r'):
                                t_part = r.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                                if t_part is not None and t_part.text:
                                    parts.append(t_part.text)
                            shared_strings.append("".join(parts))

            sheets = []
            with zip_ref.open('xl/workbook.xml') as f:
                tree = ET.parse(f)
                for sheet in tree.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet'):
                    sheets.append({
                        'name': sheet.attrib.get('name', 'Sheet'),
                        'id': sheet.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id', '')
                    })

            for i, sheet in enumerate(sheets):
                sheet_file = f'xl/worksheets/sheet{i+1}.xml'
                if sheet_file in zip_ref.namelist():
                    with zip_ref.open(sheet_file) as f:
                        tree = ET.parse(f)
                        rows = []
                        for row_xml in tree.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row'):
                            row_data = []
                            last_col = 0
                            for c in row_xml.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                                r_attr = c.attrib.get('r', '')
                                col_str = "".join(filter(str.isalpha, r_attr))
                                col_idx = 0
                                for char in col_str:
                                    col_idx = col_idx * 26 + (ord(char.upper()) - ord('A') + 1)

                                while last_col < col_idx - 1:
                                    row_data.append("")
                                    last_col += 1

                                v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                                if v is not None and v.text is not None:
                                    val = v.text
                                    t = c.attrib.get('t')
                                    if t == 's':
                                        idx = int(val)
                                        row_data.append(shared_strings[idx] if idx < len(shared_strings) else "")
                                    else:
                                        row_data.append(val)
                                else:
                                    row_data.append("")
                                last_col += 1
                            rows.append(row_data)
                        sheets_data.append({'sheet_name': sheet['name'], 'rows': rows})
    except Exception as e:
        print(f"Error parsing XLSX {file_path}: {e}")
    return sheets_data


def detect_batch_and_category(file_name, sheet_name, first_few_rows):
    """Infers the exam batch (Đợt 1 / Đợt 2) and topic category from filename, sheet name, and banner rows."""
    text_corpus = (file_name + " " + sheet_name + " " + " ".join(
        [" ".join(str(c) for c in r) for r in first_few_rows[:8]]
    )).lower()

    # Determine Batch
    batch = "Chung"
    if "đợt 1" in text_corpus or "dot 1" in text_corpus or "_1" in file_name:
        batch = "Đợt 1"
    elif "đợt 2" in text_corpus or "dot 2" in text_corpus or "17." in file_name or "4." in file_name:
        batch = "Đợt 2"

    # Determine Category
    sheet_clean = sheet_name.lower()
    if "gdv" in sheet_clean or "giao dịch viên" in sheet_clean or "tiêu chuẩn gdv" in sheet_clean:
        category = "Tiêu chuẩn GDV"
    elif "quản lý" in sheet_clean or "quan ly" in sheet_clean:
        category = "Kỹ năng quản lý cấp phòng"
    elif "nợ" in sheet_clean or "no" in sheet_clean or "xử lý nợ" in text_corpus or "xu ly no" in text_corpus:
        category = "Xử lý nợ"
    elif "kiến thức chung" in sheet_clean or "kien thuc chung" in sheet_clean or "kiến thức chung" in text_corpus:
        category = "Kiến thức chung"
    else:
        category = sheet_name

    return batch, category


def parse_sheet_questions(sheet, file_name):
    """Finds table header dynamically and extracts question objects."""
    rows = sheet['rows']
    sheet_name = sheet['sheet_name']

    # Skip reference document sheets
    if any(k in sheet_name.lower() for k in ('danh mục', 'danh sách', 'văn bản', 'huong dan')):
        return []

    # Detect batch and category
    batch, category = detect_batch_and_category(file_name, sheet_name, rows)

    # Locate table header
    header_idx = -1
    col_map = {}
    for r_idx, row in enumerate(rows[:25]):
        row_lower = [str(c).lower().strip() for c in row]
        has_q = any(('câu hỏi' in c or 'cau hoi' in c) and 'nguồn' not in c and 'trích dẫn' not in c for c in row_lower)
        has_a1 = any('đáp án 1' in c or 'dap an 1' in c for c in row_lower)
        if has_q and has_a1:
            header_idx = r_idx
            for c_idx, cell in enumerate(row_lower):
                if 'nguồn' in cell or 'trích dẫn' in cell:
                    col_map['source'] = c_idx
                elif 'đáp án 1' in cell or 'dap an 1' in cell:
                    col_map['a1'] = c_idx
                elif 'đáp án 2' in cell or 'dap an 2' in cell:
                    col_map['a2'] = c_idx
                elif 'đáp án 3' in cell or 'dap an 3' in cell:
                    col_map['a3'] = c_idx
                elif 'đáp án 4' in cell or 'dap an 4' in cell:
                    col_map['a4'] = c_idx
                elif 'đúng' in cell or 'dung' in cell:
                    col_map['correct'] = c_idx
                elif 'câu hỏi' in cell or 'cau hoi' in cell:
                    col_map['q'] = c_idx
            break

    if header_idx == -1:
        return []

    extracted = []
    for row in rows[header_idx + 1:]:
        q_idx = col_map.get('q', -1)
        if q_idx != -1 and q_idx < len(row):
            q_text = str(row[q_idx]).strip()
            # Ignore headers/banners or short empty lines
            if len(q_text) > 8 and not q_text.lower().startswith('bộ câu hỏi'):
                a1 = str(row[col_map.get('a1', 0)]).strip() if col_map.get('a1') and col_map.get('a1') < len(row) else ''
                a2 = str(row[col_map.get('a2', 0)]).strip() if col_map.get('a2') and col_map.get('a2') < len(row) else ''
                a3 = str(row[col_map.get('a3', 0)]).strip() if col_map.get('a3') and col_map.get('a3') < len(row) else ''
                a4 = str(row[col_map.get('a4', 0)]).strip() if col_map.get('a4') and col_map.get('a4') < len(row) else ''
                correct = str(row[col_map.get('correct', 0)]).strip() if col_map.get('correct') and col_map.get('correct') < len(row) else ''
                source = str(row[col_map.get('source', 0)]).strip() if col_map.get('source') and col_map.get('source') < len(row) else ''

                extracted.append({
                    'category': category,
                    'batch': batch,
                    'question': q_text,
                    'a1': a1,
                    'a2': a2,
                    'a3': a3,
                    'a4': a4,
                    'correct': correct,
                    'source': source
                })
    return extracted


def process_incoming_files():
    """Extracts questions from all incoming Excel, CSV, and JSON files."""
    INCOMING_DIR.mkdir(parents=True, exist_ok=True)
    all_incoming_questions = []

    files = sorted(list(INCOMING_DIR.glob('*.*')))
    xlsx_files = [f for f in files if f.suffix.lower() == '.xlsx']
    csv_files = [f for f in files if f.suffix.lower() == '.csv']
    json_files = [f for f in files if f.suffix.lower() == '.json']

    print(f"Quét thư mục data/incoming/: Tìm thấy {len(xlsx_files)} file Excel, {len(csv_files)} file CSV, {len(json_files)} file JSON.")

    # 1. Process XLSX files
    for fp in xlsx_files:
        print(f" -> Đang đọc file Excel: {fp.name}...")
        sheets = extract_xlsx_rows(fp)
        count_fp = 0
        for sheet in sheets:
            q_list = parse_sheet_questions(sheet, fp.name)
            if q_list:
                cat = q_list[0]['category']
                batch = q_list[0]['batch']
                print(f"    • Sheet [{sheet['sheet_name']}]: {len(q_list)} câu ({category_batch_label(cat, batch)})")
                all_incoming_questions.extend(q_list)
                count_fp += len(q_list)
        print(f"    Tổng cộng: {count_fp} câu hỏi từ {fp.name}")

    # 2. Process CSV files
    for fp in csv_files:
        print(f" -> Đang đọc file CSV: {fp.name}...")
        # Parse CSV
        for enc in ('utf-8', 'utf-8-sig', 'latin-1'):
            try:
                with open(fp, 'r', encoding=enc) as f:
                    rows = list(csv.reader(f))
                    q_list = parse_sheet_questions({'sheet_name': fp.stem, 'rows': rows}, fp.name)
                    all_incoming_questions.extend(q_list)
                    print(f"    • {len(q_list)} câu hỏi từ {fp.name}")
                    break
            except UnicodeDecodeError:
                continue

    # 3. Process JSON files
    for fp in json_files:
        print(f" -> Đang đọc file JSON: {fp.name}...")
        try:
            with open(fp, 'r', encoding='utf-8') as f:
                data = json.load(f)
                items = data if isinstance(data, list) else data.get('questions', [])
                for item in items:
                    all_incoming_questions.append({
                        'category': item.get('category', 'Khác'),
                        'batch': item.get('batch', 'Đợt 1'),
                        'question': item.get('question', '').strip(),
                        'a1': item.get('a1', '').strip(),
                        'a2': item.get('a2', '').strip(),
                        'a3': item.get('a3', '').strip(),
                        'a4': item.get('a4', '').strip(),
                        'correct': str(item.get('correct', '')).strip(),
                        'source': item.get('source', '').strip()
                    })
                print(f"    • {len(items)} câu hỏi từ {fp.name}")
        except Exception as e:
            print(f"    Lỗi đọc JSON {fp.name}: {e}")

    return all_incoming_questions


def category_batch_label(cat, batch):
    return f"{cat} - {batch}"


def normalize_q_key(text):
    """Normalizes question text for robust deduplication across files:
    - Lowercase
    - Collapses multiple whitespace to single space
    - Normalizes missing spaces after punctuation (e.g. '2023,Trường' -> '2023, trường')
    """
    if not text:
        return ""
    s = text.lower().strip()
    s = re.sub(r'\s+', ' ', s)
    s = re.sub(r'([,;:\.\?!])([^\s0-9])', r'\1 \2', s)
    s = re.sub(r'\s+', ' ', s)
    return s.strip()


def merge_and_build(incoming_questions):
    """Merges questions, tracks batch tags, deduplicates, and assigns IDs."""
    questions_map = {}

    # If no incoming files, try loading existing questions.json
    if not incoming_questions and QUESTIONS_JSON_PATH.exists():
        with open(QUESTIONS_JSON_PATH, 'r', encoding='utf-8') as f:
            incoming_questions = json.load(f)

    for item in incoming_questions:
        q_text = item.get('question', '').strip()
        if not q_text or len(q_text) < 8:
            continue

        q_key = normalize_q_key(q_text)
        batch = item.get('batch') or 'Đợt 1'
        batches = item.get('batches') or [batch]
        cat = item.get('category') or 'Kiến thức chung'

        if q_key not in questions_map:
            questions_map[q_key] = {
                'category': cat,
                'batches': list(batches),
                'question': q_text,
                'a1': item.get('a1', '').strip(),
                'a2': item.get('a2', '').strip(),
                'a3': item.get('a3', '').strip(),
                'a4': item.get('a4', '').strip(),
                'correct': str(item.get('correct', '')).strip(),
                'source': item.get('source', '').strip()
            }
        else:
            # Merge batches
            existing = questions_map[q_key]
            for b in batches:
                if b not in existing['batches']:
                    existing['batches'].append(b)
            # Update source if empty
            if item.get('source') and not existing['source']:
                existing['source'] = item.get('source').strip()

    # Format final list with sorting and IDs
    final_list = []
    # Sort order: Category name, then batches, then question text
    sorted_items = sorted(
        questions_map.values(),
        key=lambda x: (x['category'], ' & '.join(sorted(x['batches'])), x['question'])
    )

    for idx, item in enumerate(sorted_items, start=1):
        item['id'] = idx
        batches_sorted = sorted(item['batches'])
        item['batches'] = batches_sorted
        item['batch_label'] = ' & '.join(batches_sorted)
        final_list.append(item)

    return final_list


def save_output(final_list):
    """Saves to data/questions.json and data/questions.js."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    with open(QUESTIONS_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(final_list, f, ensure_ascii=False, indent=2)

    with open(QUESTIONS_JS_PATH, 'w', encoding='utf-8') as f:
        f.write('window.QUESTIONS_DATA = ' + json.dumps(final_list, ensure_ascii=False, indent=2) + ';\n')

    print(f"\nĐã lưu thành công {len(final_list)} câu hỏi vào:")
    print(f"  -> {QUESTIONS_JSON_PATH}")
    print(f"  -> {QUESTIONS_JS_PATH}")


def print_statistics(final_list):
    """Prints comprehensive stats per category, batch, and round."""
    cat_counts = {}
    batch_counts = {}
    detailed_counts = {}

    for q in final_list:
        cat = q['category']
        b_label = q['batch_label']
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
        batch_counts[b_label] = batch_counts.get(b_label, 0) + 1

        for b in q['batches']:
            key = f"{b}: {cat}"
            detailed_counts[key] = detailed_counts.get(key, 0) + 1

    d1_total = sum(1 for q in final_list if 'Đợt 1' in q['batches'])
    d2_total = sum(1 for q in final_list if 'Đợt 2' in q['batches'])

    print("\n" + "=" * 65)
    print(f" BÁO CÁO TỔNG QUAN DỮ LIỆU CÂU HỎI (TỔNG CỘNG: {len(final_list)} CÂU)")
    print("=" * 65)
    print("📌 THEO CHUYÊN ĐỀ:")
    for c, count in sorted(cat_counts.items(), key=lambda x: -x[1]):
        print(f"   • {c:<30}: {count:>4} câu")

    print("\n📌 THEO ĐỢT THI:")
    print(f"   • Đợt 1 (Tổng số câu có trong Đợt 1) : {d1_total:>4} câu")
    print(f"   • Đợt 2 (Tổng số câu có trong Đợt 2) : {d2_total:>4} câu")
    print(f"   • Xuất hiện ở cả 2 Đợt (trùng lặp)   : {batch_counts.get('Đợt 1 & Đợt 2', 0):>4} câu")

    print("\n📌 CHI TIẾT TỪNG ĐỢT VÀ CHUYÊN ĐỀ:")
    for k in sorted(detailed_counts.keys()):
        print(f"   • {k:<30}: {detailed_counts[k]:>4} câu")
    print("=" * 65 + "\n")


def main():
    print("=== BẮT ĐẦU PIPELINE XỬ LÝ DỮ LIỆU CÂU HỎI AGRIBANK ===")
    incoming_questions = process_incoming_files()
    final_questions = merge_and_build(incoming_questions)
    save_output(final_questions)
    print_statistics(final_questions)
    print("=== HOÀN THÀNH PIPELINE XỬ LÝ DỮ LIỆU! ===")


if __name__ == "__main__":
    main()
