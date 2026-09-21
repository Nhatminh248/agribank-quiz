import zipfile
import xml.etree.ElementTree as ET
import csv
import os

def extract_xlsx_data(file_path):
    """Extracts all text from all sheets of an xlsx file without external libs."""
    results = []
    try:
        with zipfile.ZipFile(file_path, 'r') as zip_ref:
            # 1. Get shared strings (the actual text)
            shared_strings = []
            if 'xl/sharedStrings.xml' in zip_ref.namelist():
                with zip_ref.open('xl/sharedStrings.xml') as f:
                    tree = ET.parse(f)
                    for si in tree.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
                        t = si.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                        if t is not None:
                            shared_strings.append(t.text)
                        else:
                            # Handle rich text
                            text_parts = []
                            for r in si.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}r'):
                                t_part = r.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                                if t_part is not None:
                                    text_parts.append(t_part.text)
                            shared_strings.append("".join(text_parts))

            # 2. Get sheet names and IDs
            sheets = []
            with zip_ref.open('xl/workbook.xml') as f:
                tree = ET.parse(f)
                for sheet in tree.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet'):
                    sheets.append({
                        'name': sheet.attrib['name'],
                        'id': sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
                    })

            # 3. Read each sheet
            for i, sheet in enumerate(sheets):
                sheet_file = f'xl/worksheets/sheet{i+1}.xml'
                if sheet_file in zip_ref.namelist():
                    with zip_ref.open(sheet_file) as f:
                        tree = ET.parse(f)
                        rows = []
                        for row_xml in tree.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row'):
                            row_data = []
                            # We need to handle missing cells to keep columns aligned
                            # OpenXML rows don't always have all cells
                            last_col = 0
                            for c in row_xml.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                                # Get column index from 'r' attribute (e.g., "A1", "B1")
                                r_attr = c.attrib.get('r', '')
                                col_str = "".join(filter(str.isalpha, r_attr))
                                col_idx = 0
                                for char in col_str:
                                    col_idx = col_idx * 26 + (ord(char.upper()) - ord('A') + 1)
                                
                                # Pad empty cells
                                while last_col < col_idx - 1:
                                    row_data.append("")
                                    last_col += 1
                                
                                v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                                if v is not None:
                                    val = v.text
                                    t = c.attrib.get('t')
                                    if t == 's': # Shared string
                                        row_data.append(shared_strings[int(val)] if int(val) < len(shared_strings) else "")
                                    else:
                                        row_data.append(val)
                                else:
                                    row_data.append("")
                                last_col += 1
                            rows.append(row_data)
                        results.append({'sheet_name': sheet['name'], 'data': rows})
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
    return results

def process_all():
    all_q = []
    
    # 1. Process File 17 (3 sheets expected)
    file17 = "17. Kiến thức chung+ Tiêu chuẩn GDV+ Kỹ năng quản lý cấp phòng.xlsx"
    sheets17 = extract_xlsx_data(file17)
    print(f"File 17: Found {len(sheets17)} sheets")
    
    for s in sheets17:
        data = s['data']
        count = 0
        # Column Map: STT(0), empty(1), Q(2), A1(3), A2(4), A3(5), A4(6), Correct(7), Source(8)
        # Note: Different sheets might have slightly different start rows
        for row in data:
            if len(row) >= 8:
                stt = str(row[0]).strip()
                if stt.isdigit() and len(row[2].strip()) > 10:
                    all_q.append({
                        "category": f"17 - {s['sheet_name']}",
                        "question": row[2].strip(),
                        "a1": row[3].strip(),
                        "a2": row[4].strip(),
                        "a3": row[5].strip(),
                        "a4": row[6].strip() if len(row) > 6 else "",
                        "correct": row[7].strip(),
                        "source": row[8].strip() if len(row) > 8 else ""
                    })
                    count += 1
        print(f"  - Sheet '{s['sheet_name']}': Extracted {count} questions")

    # 2. Process File 4 (1 sheet expected)
    file4 = "4. Xử lý nợ.xlsx"
    sheets4 = extract_xlsx_data(file4)
    for s in sheets4:
        data = s['data']
        count = 0
        # Column Map: STT(0), Q(1), A1(2), A2(3), A3(4), A4(5), Correct(6), Source(7)
        for row in data:
            if len(row) >= 7:
                stt = str(row[0]).strip()
                if stt.isdigit() and len(row[1].strip()) > 10:
                    all_q.append({
                        "category": f"4 - {s['sheet_name']}",
                        "question": row[1].strip(),
                        "a1": row[2].strip(),
                        "a2": row[3].strip(),
                        "a3": row[4].strip(),
                        "a4": row[5].strip() if len(row) > 5 else "",
                        "correct": row[6].strip(),
                        "source": row[7].strip() if len(row) > 7 else ""
                    })
                    count += 1
        print(f"File 4 - Sheet '{s['sheet_name']}': Extracted {count} questions")

    return all_q

all_questions = process_all()
import json

# HTML template (same as before)
html_template = """
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Agribank Question Search (Full)</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 1000px; margin: 0 auto; padding: 20px; background-color: #f4f7f6; }
        .search-container { position: sticky; top: 0; background: #f4f7f6; padding: 20px 0; z-index: 100; border-bottom: 2px solid #ddd; }
        #searchInput { width: 100%; padding: 15px; font-size: 18px; border: 2px solid #007bff; border-radius: 8px; box-sizing: border-box; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .stats { margin-top: 10px; font-weight: bold; color: #555; }
        .question-card { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border-left: 5px solid #007bff; }
        .question-text { font-size: 1.1em; font-weight: bold; margin-bottom: 15px; color: #2c3e50; }
        .category { font-size: 0.8em; color: #e67e22; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
        .answer { padding: 8px 12px; margin: 5px 0; border-radius: 4px; border: 1px solid #eee; }
        .correct { background-color: #d4edda; border-color: #c3e6cb; color: #155724; font-weight: bold; }
        .correct::before { content: "✓ "; }
        .source { font-size: 0.85em; color: #95a5a6; margin-top: 15px; font-style: italic; border-top: 1px solid #eee; padding-top: 10px; }
        mark { background: yellow; color: black; }
    </style>
</head>
<body>
    <h1>Agribank Test Search (Full 490+)</h1>
    <div class="search-container">
        <input type="text" id="searchInput" placeholder="Tìm kiếm câu hỏi hoặc câu trả lời..." autofocus>
        <div class="stats" id="stats">Đang tải...</div>
    </div>
    <div id="results"></div>
    <script>
        const questions = """ + json.dumps(all_questions) + """;
        const searchInput = document.getElementById('searchInput');
        const resultsContainer = document.getElementById('results');
        const statsDisplay = document.getElementById('stats');

        function highlight(text, query) {
            if (!query) return text;
            const regex = new RegExp(`(${query})`, 'gi');
            return text.replace(regex, '<mark>$1</mark>');
        }

        function render(filter = '') {
            const query = filter.trim().toLowerCase();
            const filtered = questions.filter(q => 
                q.question.toLowerCase().includes(query) || 
                q.a1.toLowerCase().includes(query) || 
                q.a2.toLowerCase().includes(query) || 
                q.a3.toLowerCase().includes(query) || 
                q.a4.toLowerCase().includes(query)
            );

            statsDisplay.innerText = `Tìm thấy ${filtered.length} câu hỏi`;
            resultsContainer.innerHTML = filtered.slice(0, 150).map(q => {
                const correctIdx = q.correct;
                return `
                    <div class="question-card">
                        <div class="category">${q.category}</div>
                        <div class="question-text">${highlight(q.question, query)}</div>
                        <div class="answer ${correctIdx == '1' ? 'correct' : ''}">1. ${highlight(q.a1, query)}</div>
                        <div class="answer ${correctIdx == '2' ? 'correct' : ''}">2. ${highlight(q.a2, query)}</div>
                        <div class="answer ${correctIdx == '3' ? 'correct' : ''}">3. ${highlight(q.a3, query)}</div>
                        ${q.a4 ? `<div class="answer ${correctIdx == '4' ? 'correct' : ''}">4. ${highlight(q.a4, query)}</div>` : ''}
                        ${q.source ? `<div class="source">Nguồn: ${q.source}</div>` : ''}
                    </div>
                `;
            }).join('');
        }
        searchInput.addEventListener('input', (e) => render(e.target.value));
        render();
    </script>
</body>
</html>
"""

with open("search_questions.html", "w", encoding="utf-8") as f:
    f.write(html_template)
print(f"\nFinal tally: Generated search_questions.html with {len(all_questions)} questions.")
