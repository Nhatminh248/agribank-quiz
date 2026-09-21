import csv
import json
import os

def parse_csv(file_path, start_row, col_map):
    questions = []
    if not os.path.exists(file_path):
        return []
    
    with open(file_path, mode='r', encoding='utf-8') as f:
        reader = list(csv.reader(f))
        for row in reader[start_row:]:
            if not row or len(row) < max(col_map.values()):
                continue
            
            # Basic validation: Check if it looks like a question row (STT should be a number or not empty)
            if not row[col_map['stt']].strip():
                continue
                
            q_data = {
                "category": os.path.basename(file_path).replace(".csv", ""),
                "question": row[col_map['q']].strip(),
                "a1": row[col_map['a1']].strip(),
                "a2": row[col_map['a2']].strip(),
                "a3": row[col_map['a3']].strip(),
                "a4": row[col_map['a4']].strip() if 'a4' in col_map else "",
                "correct": row[col_map['correct']].strip(),
                "source": row[col_map['source']].strip() if 'source' in col_map else ""
            }
            # Only add if there is an actual question
            if q_data["question"]:
                questions.append(q_data)
    return questions

# Column mappings based on manual inspection
# File 17: STT(0), empty(1), Q(2), A1(3), A2(4), A3(5), A4(6), Correct(7), Source(8)
questions_17 = parse_csv("17. Kiến thức chung+ Tiêu chuẩn GDV+ Kỹ năng quản lý cấp phòng.csv", 10, 
                        {'stt': 0, 'q': 2, 'a1': 3, 'a2': 4, 'a3': 5, 'a4': 6, 'correct': 7, 'source': 8})

# File 4: STT(0), Q(1), A1(2), A2(3), A3(4), A4(5), Correct(6), Source(7)
questions_4 = parse_csv("4. Xử lý nợ.csv", 12, 
                       {'stt': 0, 'q': 1, 'a1': 2, 'a2': 3, 'a3': 4, 'a4': 5, 'correct': 6, 'source': 7})

all_questions = questions_17 + questions_4

html_template = """
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Agribank Question Search</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 1000px; margin: 0 auto; padding: 20px; background-color: #f4f7f6; }
        .search-container { position: sticky; top: 0; background: #f4f7f6; padding: 20px 0; z-index: 100; border-bottom: 2px solid #ddd; }
        #searchInput { width: 100%; padding: 15px; font-size: 18px; border: 2px solid #007bff; border-radius: 8px; box-sizing: border-box; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .stats { margin-top: 10px; font-weight: bold; color: #555; }
        .question-card { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border-left: 5px solid #007bff; }
        .question-text { font-size: 1.1em; font-weight: bold; margin-bottom: 15px; color: #2c3e50; }
        .category { font-size: 0.8em; color: #7f8c8d; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
        .answer { padding: 8px 12px; margin: 5px 0; border-radius: 4px; border: 1px solid #eee; }
        .correct { background-color: #d4edda; border-color: #c3e6cb; color: #155724; font-weight: bold; }
        .correct::before { content: "✓ "; }
        .source { font-size: 0.85em; color: #95a5a6; margin-top: 15px; font-style: italic; border-top: 1px solid #eee; padding-top: 10px; }
        mark { background: yellow; color: black; }
        .no-results { text-align: center; padding: 50px; color: #999; font-size: 1.2em; }
    </style>
</head>
<body>
    <h1>Agribank Test Search</h1>
    <div class="search-container">
        <input type="text" id="searchInput" placeholder="Nhập từ khóa để tìm câu hỏi (ví dụ: 'Hạn mức', 'Tổng giám đốc')..." autofocus>
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

            if (filtered.length === 0) {
                resultsContainer.innerHTML = '<div class="no-results">Không tìm thấy câu hỏi nào phù hợp.</div>';
                return;
            }

            resultsContainer.innerHTML = filtered.slice(0, 100).map(q => {
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
            }).join('') + (filtered.length > 100 ? '<p style="text-align:center; color:#999">Và nhiều kết quả khác... hãy gõ cụ thể hơn.</p>' : '');
        }

        searchInput.addEventListener('input', (e) => render(e.target.value));
        render(); // Initial load
    </script>
</body>
</html>
"""

with open("search_questions.html", "w", encoding="utf-8") as f:
    f.write(html_template)

print(f"Successfully generated search_questions.html with {len(all_questions)} questions.")
