# Ứng Dụng Tra Cứu Câu Hỏi Trắc Nghiệm Agribank

Trang web tĩnh tra cứu nhanh ngân hàng câu hỏi Agribank (Đợt 1 & Đợt 2 năm 2026), hỗ trợ tìm kiếm tiếng Việt không dấu, lọc theo chuyên đề/đợt thi và tối ưu hiển thị mượt mà trên điện thoại di động.

---

## 📊 Thống Kê Ngân Hàng Câu Hỏi Hiện Tại

- **Tổng số câu hỏi độc nhất:** **1.094 câu** (được hợp nhất từ toàn bộ các file câu hỏi của cả 2 đợt thi)
- **Theo Đợt thi:**
  - **Đợt 1:** 725 câu
  - **Đợt 2:** 776 câu
  - **Xuất hiện ở cả 2 đợt:** 407 câu (được gắn nhãn `Đợt 1 & Đợt 2`)
- **Theo Chuyên đề:**
  - **Xử lý nợ:** 366 câu
  - **Văn thư:** 331 câu
  - **Kiến thức chung:** 295 câu
  - **Kỹ năng quản lý cấp phòng:** 91 câu
  - **Tiêu chuẩn GDV:** 11 câu

---

## 📁 Cấu Trúc Dự Án (Modular)

```text
Agribank_questions/
│
├── index.html                  # Giao diện web chính chuẩn Google Material 3
├── css/
│   └── style.css               # Giao diện thẻ card, badges Đợt thi & Chuyên đề (Peachy Theme)
├── js/
│   └── app.js                  # Engine tìm kiếm tiếng Việt, xếp hạng độ liên quan & bôi sáng từ khóa
├── data/
│   ├── questions.json          # Toàn bộ dữ liệu 1.094 câu hỏi dạng JSON chuẩn Unicode NFC
│   ├── questions.js            # Wrapper hỗ trợ chạy offline trực tiếp qua file://
│   └── incoming/               # Nơi chứa các file Excel câu hỏi gốc
│       ├── 17. Kiến thức chung+ Tiêu chuẩn GDV+ Kỹ năng quản lý cấp phòng.xlsx
│       ├── 4. Xử lý nợ.xlsx
│       ├── Copy of 15. Văn thư lễ tân.xlsx
│       ├── Kiến thức chung_1.xlsx
│       ├── THI NGHIEP VU DOT 2.2026.xlsx
│       └── Xử lý nợ_1.xlsx
│
├── tools_and_scripts/
│   └── build_data.py           # Pipeline tự động đọc Excel, chuẩn hóa NFC và đồng bộ dữ liệu
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
3. Chuẩn hóa 100% dữ liệu sang định dạng Unicode NFC dựng sẵn.
4. Hợp nhất, loại bỏ trùng lặp và cập nhật đồng thời cả `data/questions.json` và `data/questions.js`.
5. In bảng báo cáo số lượng chi tiết.

---

## 🎯 Tính Năng Tìm Kiếm & Trải Nghiệm Người Dùng

- **Chuyên biệt cho câu hỏi:** Thuật toán tìm kiếm chỉ lọc từ khóa xuất hiện trực tiếp trong nội dung câu hỏi, loại bỏ hoàn toàn các kết quả gây nhiễu từ các đáp án multiple-choice hoặc số hiệu văn bản trích dẫn nguồn.
- **Xếp hạng độ liên quan (Relevance Scoring):** Tự động tính điểm thông minh để đưa câu hỏi khớp chính xác cụm từ tìm kiếm lên đầu trang (ví dụ: tìm `"hạn mức chuyển tiền"` sẽ ưu tiên tuyệt đối các câu có đúng cụm từ này thay vì các câu chỉ khớp từ ngẫu nhiên rải rác).
- **Bôi sáng từng từ chuẩn xác (Word-by-Word Highlighting):** Đánh dấu chính xác từng từ khóa, loại bỏ triệt để lỗi cắt cụt ký tự hay lệch dấu do Unicode tổ hợp.
- **Tìm kiếm tiếng Việt không dấu & đa từ khóa:** Gõ `tong giam doc phan cong` sẽ tìm ra đúng câu hỏi quy định về quyền hạn phân công của Tổng Giám đốc.
- **Giao diện Google Material Design 3:** Thanh tìm kiếm dạng Pill tròn bo mềm mại, hỗ trợ Dark Mode và chuyển đổi giao diện mượt mà trên cả máy tính lẫn điện thoại.

