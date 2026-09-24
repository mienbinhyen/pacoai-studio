# HƯỚNG DẪN ĐẨY LÊN GITHUB PAGES & GẮN TÊN MIỀN RIÊNG - PACOAI TTS

Tài liệu này hướng dẫn bạn đưa ứng dụng **Trình chuyển đổi giọng nói PACOAI** lên **GitHub Pages** (hoàn toàn miễn phí) và liên kết với tên miền riêng của bạn.

---

## 1. Chuẩn bị file để tải lên GitHub

Có 2 cách đơn giản:

### Cách 1: Dùng thư mục `dist` đã build sẵn (Khuyên dùng - Nhanh nhất)
1. Bạn chạy lệnh đóng gói (nếu có Node.js):
   ```bash
   npm run build
   ```
2. Thư mục `dist/` sẽ được tạo ra gồm:
   - `index.html` (file trang chủ web tĩnh)
   - `logo-pacoai.webp` (ảnh logo với kích thước 1200x675)
   - Thư mục `assets/` (chứa toàn bộ mã nguồn JS & CSS)
3. Bạn chỉ cần tải toàn bộ nội dung bên trong thư mục `dist/` này lên GitHub repository!

### Cách 2: Đẩy toàn bộ mã nguồn lên GitHub
Nếu bạn đẩy toàn bộ repository lên GitHub, bạn có thể bật GitHub Actions để tự động build khi push code.

---

## 2. Về ảnh Logo `logo-pacoai.webp`
* Bạn chuẩn bị file ảnh logo của bạn, đặt tên chính xác là:
  ```
  logo-pacoai.webp
  ```
* Kích thước khuyến nghị: **1200 x 675 pixel** (tỉ lệ 16:9 chuẩn theo yêu cầu để trình duyệt không bị giật khung hình CLS = 0).
* Đặt file ảnh này ngang hàng với file `index.html`.

---

## 3. Cách kích hoạt GitHub Pages và gắn Tên Miền Riêng

1. **Đăng nhập vào GitHub**, tạo một Repository mới (ví dụ đặt tên: `pacoai-tts`).
2. Tải các file trong thư mục `dist` lên nhánh `main`.
3. Vào mục **Settings** (Cài đặt của Repo trên GitHub) &rarr; chọn mục **Pages** ở menu bên trái.
4. Ở phần **Build and deployment**:
   - **Source**: Chọn `Deploy from a branch`.
   - **Branch**: Chọn `main` và thư mục `/ (root)`, sau đó bấm **Save**.
5. Đợi khoảng 1 - 2 phút, GitHub sẽ cấp cho bạn một đường link miễn phí dạng:
   `https://<ten-tai-khoan>.github.io/pacoai-tts/`
6. **Gắn Tên Miền Riêng của bạn**:
   - Ở ngay trang **Pages** đó, kéo xuống mục **Custom domain**.
   - Nhập tên miền riêng của bạn (ví dụ: `tts.pacoai.com` hoặc `pacoai.com`).
   - Vào trang quản lý DNS tên miền của bạn (Cloudflare, Namecheap, Vultr, Mắt Bão...):
     - Tạo 1 bản ghi `CNAME`: Host là `tts`, Giá trị trỏ về `<ten-tai-khoan>.github.io`.
   - Quay lại GitHub Pages, tích vào ô **Enforce HTTPS** để có chứng chỉ bảo mật xanh (SSL miễn phí).

---

## 4. Cách sử dụng API Key an toàn trên trang tĩnh

Vì GitHub Pages là trang tĩnh, nên:
1. Bạn truy cập vào web của bạn trên trình duyệt (máy tính hoặc điện thoại).
2. Bấm vào nút **"Cài đặt API"** ở góc trên bên phải menu.
3. Dán mã **Gemini API Key** của bạn vào và bấm **"Lưu API Key"**.
4. **Trình duyệt của bạn sẽ tự ghi nhớ vĩnh viễn** mã này vào `localStorage` trên máy bạn. Lần sau mở web lên dùng ngay, không cần nhập lại.
5. Mã này hoàn toàn bảo mật vì chỉ nằm trên thiết bị cá nhân của bạn, không bị ai nhìn thấy.

---

## 5. Danh sách các giọng nói & Tính năng mới

- **Giọng Algieba**: Giọng đọc đặc trưng nổi tiếng của Google Studio, thanh tao, ấm áp, truyền cảm, phát âm tiếng Việt rất mượt mà.
- **Giọng Aoede, Kore, Puck, Charon, Fenrir, Zephyr**: Đầy đủ các giọng đọc từ trẻ trung, trầm ấm đến mạnh mẽ.
- **Bộ điều chỉnh Vùng miền**:
  - Giọng Bắc chuẩn (Hà Nội)
  - Giọng Nam Bộ (Sài Gòn)
  - Giọng Miền Trung (Huế / Đà Nẵng)
  - Chuẩn phát thanh viên VTV / VOV
- **Tốc độ đọc**: Từ 0.75x (chậm rãi) đến 1.5x (nhanh).
- **Nút "Nghe thử 30 ký tự"**: Nghe thử nhanh 30 ký tự đầu tiên để kiểm tra chất giọng trước khi tạo toàn bộ đoạn dài.
- **Nút "Tạo giọng nói PACOAI-TTS"**: Tạo bản thu âm đầy đủ với chuẩn phòng thu WAV 24,000Hz và tải về máy.
