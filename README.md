# Ứng Dụng Tra Cứu Câu Hỏi Trắc Nghiệm Agribank

Trang web tĩnh tra cứu nhanh ngân hàng câu hỏi Agribank (Đợt 1 & Đợt 2 năm 2026), hỗ trợ tìm kiếm tiếng Việt không dấu, lọc theo chuyên đề/đợt thi và tối ưu hiển thị mượt mà trên điện thoại di động.

---

## 📊 Thống Kê Ngân Hàng Câu Hỏi Hiện Tại

- **Tổng số câu hỏi độc nhất:** **766 câu** (được hợp nhất từ 1.030 câu hỏi của cả 2 đợt thi)
- **Theo Đợt thi:**
  - **Đợt 1:** 489 câu
  - **Đợt 2:** 540 câu
  - **Xuất hiện ở cả 2 đợt:** 263 câu (được gắn nhãn `Đợt 1 & Đợt 2`)
- **Theo Chuyên đề:**
  - **Xử lý nợ:** 368 câu
  - **Kiến thức chung:** 296 câu
  - **Kỹ năng quản lý cấp phòng:** 91 câu
  - **Tiêu chuẩn GDV:** 11 câu

---

## 📁 Cấu Trúc Dự Án (Modular)

```text
Agribank_questions/
│
├── index.html                  # Giao diện web chính (~2.4KB)
├── css/
│   └── style.css               # Giao diện thẻ card, badges Đợt thi & Chuyên đề
├── js/
│   └── app.js                  # Engine tìm kiếm tiếng Việt không dấu, lọc theo Đợt & Chuyên đề
├── data/
│   ├── questions.json          # Toàn bộ dữ liệu 766 câu hỏi dạng JSON chuẩn
│   ├── questions.js            # Wrapper hỗ trợ chạy offline trực tiếp qua file://
│   └── incoming/               # Nơi chứa các file Excel câu hỏi gốc
│       ├── Kiến thức chung_1.xlsx
│       ├── Xử lý nợ_1.xlsx
│       ├── 17. Kiến thức chung+ Tiêu chuẩn GDV+ Kỹ năng quản lý cấp phòng.xlsx
│       └── 4. Xử lý nợ.xlsx
│
├── tools_and_scripts/
│   └── build_data.py           # Pipeline tự động đọc Excel và đồng bộ dữ liệu
│
└── README.md                   # Hướng dẫn sử dụng
```

---

## 🚀 Cách Cập Nhật Dữ Liệu Khi Thêm File Mới

Mỗi khi bạn thả thêm file Excel mới vào `data/incoming/`, bạn chỉ cần chạy 1 lệnh:

```bash
python3 tools_and_scripts/build_data.py
```

Script sẽ tự động:
1. Đọc và phân tích cấu trúc các sheet trong file Excel.
2. Tự động nhận diện Đợt thi (`Đợt 1`, `Đợt 2`) và Chuyên đề.
3. Hợp nhất, loại bỏ trùng lặp và cập nhật đồng thời cả `data/questions.json` và `data/questions.js`.
4. In bảng báo cáo số lượng chi tiết.

---

## 🎯 Tìm Kiếm Trọng Tâm Trong Câu Hỏi

- **Chuyên biệt cho câu hỏi:** Thuật toán tìm kiếm chỉ lọc từ khóa xuất hiện trực tiếp trong nội dung câu hỏi, loại bỏ hoàn toàn các kết quả gây nhiễu từ các đáp án multiple-choice hoặc số hiệu văn bản trích dẫn nguồn.
- **Tìm kiếm tiếng Việt không dấu & đa từ khóa:** Gõ `tong giam doc phan cong` sẽ tìm ra đúng câu hỏi quy định về quyền hạn phân công của Tổng Giám đốc.
- **Giao diện Google Material Design 3:** Thanh tìm kiếm dạng Pill tròn bo mềm mại, tối giản, hiển thị thẻ Card thanh thoát chuẩn trải nghiệm Google trên Android & iOS.

