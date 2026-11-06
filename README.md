# Vẽ Avatar TikTok Live

Demo overlay livestream TikTok: viewer tương tác và avatar của họ xuất hiện trên khung vẽ trong overlay dọc 1080×1920.

## Chạy thử

Yêu cầu Node.js 18 trở lên.

```bash
npm install
npm start
```

Mở dashboard tại <http://localhost:3005> và overlay tại <http://localhost:3005/overlay.html>. Trong dashboard, bật **Chế độ thử (Demo)** để mô phỏng tương tác mà không cần kết nối TikTok LIVE.

Trên Windows, có thể chạy `CHAY_VE_AVATAR.bat`; script sẽ cài dependencies nếu chưa có và mở dashboard cùng overlay.

## Sự kiện viewer

Ứng dụng nhận sự kiện từ công cụ kết nối TikTok LIVE tương thích qua webhook. Trong demo mode, sự kiện live thật được bỏ qua; dùng các nút thử trong dashboard để xem viewer được đưa vào hàng đợi và vẽ lên overlay.

## Lưu trữ cục bộ

Cấu hình, khung tùy chỉnh, phiên livestream và bộ nhớ đệm giọng nói được tạo trong `data/` khi chạy. Những dữ liệu này được giữ cục bộ và không đưa vào Git.

## Công nghệ

- Node.js, Express và Socket.IO
- Giao diện dashboard và overlay HTML/CSS/JavaScript
