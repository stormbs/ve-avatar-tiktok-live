# Kết nối Vẽ Avatar với TikTok LIVE Studio và TikFinity

Hướng dẫn này dành cho bản demo chạy trên máy Windows của bạn. Repo GitHub chứa mã nguồn, không phải một máy chủ demo đang chạy sẵn.

## 1. Chạy demo trên máy

1. Cài Node.js 18 trở lên.
2. Mở thư mục project và chạy:

   ```powershell
   npm install
   npm start
   ```

   Hoặc chạy `CHAY_VE_AVATAR.bat` trên Windows.
3. Mở dashboard: <http://localhost:3005>
4. Mở overlay: <http://localhost:3005/overlay.html>

Giữ cửa sổ server chạy trong suốt buổi live. TikTok LIVE Studio và TikFinity cần chạy trên cùng máy để dùng các địa chỉ `localhost` bên dưới.

## 2. Thêm overlay vào TikTok LIVE Studio

1. Mở TikTok LIVE Studio và chọn scene đang dùng.
2. Trong **Sources**, chọn **Add source → Link**.
3. Dán URL overlay:

   ```text
   http://localhost:3005/overlay.html
   ```

4. Đặt kích thước nguồn theo khung dọc **1080 × 1920**, rồi sắp xếp overlay trên scene.
5. Nếu overlay có tiếng nhưng chưa phát, bấm một lần vào trang overlay để trình duyệt cho phép phát âm thanh.

## 3. Kết nối TikFinity

1. Mở TikFinity, đăng nhập và nhập đúng **@username** TikTok trong phần Setup.
2. Bắt đầu LIVE trong TikTok LIVE Studio. Trong TikFinity, bấm **Connect** nếu chưa tự kết nối. TikFinity chỉ nhận sự kiện của phòng LIVE khi stream đang chạy.
3. Trong dashboard Vẽ Avatar, xem địa chỉ webhook. Với demo chạy local, địa chỉ sẽ là:

   ```text
   http://localhost:3005/api/webhook
   ```

4. Trong TikFinity, mở **Actions & Events** và tạo một Action, ví dụ `Ve Avatar`.
5. Thêm hành động **Trigger Webhook** (tên mục có thể khác nhẹ giữa các phiên bản). Đặt phương thức **POST**, Content-Type `application/json`, URL là địa chỉ webhook từ dashboard.
6. Tạo các Event cần dùng và gắn chúng vào Action này. Dùng biến chèn từ TikFinity để điền các trường trong mẫu dưới đây; tên placeholder có thể thay đổi theo phiên bản TikFinity.

### JSON body cho các loại tương tác

Gửi các body này tới cùng endpoint. Mỗi Event dùng body tương ứng:

**Quà tặng (Gift)**

```json
{"triggerTypeId":3,"userId":"$userId","nickname":"$nickname","profilePictureUrl":"$profilePictureUrl","giftName":"$giftName","diamondCount":$diamondCount,"repeatCount":$repeatCount}
```

**Bình luận (Chat)**

```json
{"triggerTypeId":11,"userId":"$userId","nickname":"$nickname","profilePictureUrl":"$profilePictureUrl","content":"$comment"}
```

**Theo dõi (Follow)**

```json
{"triggerTypeId":1,"userId":"$userId","nickname":"$nickname","profilePictureUrl":"$profilePictureUrl"}
```

**Chia sẻ (Share)**

```json
{"triggerTypeId":8,"event":"share","userId":"$userId","nickname":"$nickname","profilePictureUrl":"$profilePictureUrl"}
```

**Thả tim (Like/Tap)**

```json
{"triggerTypeId":7,"userId":"$userId","nickname":"$nickname","profilePictureUrl":"$profilePictureUrl","likeCount":$likeCount}
```

Trong TikFinity, chèn giá trị từ menu biến thay vì gõ placeholder nếu giao diện có nút chọn biến. `userId` nhận diện viewer; `profilePictureUrl` cung cấp ảnh đại diện; `diamondCount` là số xu thực của quà; `likeCount` là số tim trong đợt.

## 4. Chạy thử an toàn

- Demo mode được bật mặc định. Khi bật, dashboard bỏ qua webhook TikFinity và chỉ nhận nút mô phỏng trong dashboard.
- Để kiểm tra webhook, chuyển **Chế độ thử (Demo)** sang tắt. Sau đó gửi thử một Event/Action trong TikFinity và xem log cùng hàng đợi trên dashboard.
- Trước buổi live thật, kiểm tra lại URL overlay, kết nối TikFinity, avatar viewer và log. Bấm **Làm mới phiên** nếu muốn bắt đầu hàng đợi mới.
- Trong TikFinity, bạn cũng có thể dùng Event Simulator/test action nếu phiên bản đang dùng có hỗ trợ.

## 5. Sự cố thường gặp

| Hiện tượng | Kiểm tra |
| --- | --- |
| Overlay trống hoặc không tải | Server Node.js còn chạy không; URL có đúng `http://localhost:3005/overlay.html`; nguồn Link trong LIVE Studio đã refresh chưa. |
| TikFinity không kết nối | LIVE đã bắt đầu chưa; `@username` trong TikFinity có đúng handle, không phải tên hiển thị. |
| Webhook tới nhưng không vào hàng đợi | Demo mode phải tắt để xử lý webhook; kiểm tra Event đã gắn Action, body JSON hợp lệ và có `userId` cùng `triggerTypeId`. |
| Viewer hiện chữ cái thay avatar | Body cần có `profilePictureUrl` (hoặc trường avatar tương đương). |
| Gift không lên hàng đợi | Kiểm tra `diamondCount` và ngưỡng xu đặt trong dashboard. |
| Like không lên hàng đợi | Kiểm tra Event Like có gửi `likeCount`; số tim tích lũy phải đạt mục tiêu. |

### Lưu ý mạng

`localhost` chỉ trỏ tới máy đang mở ứng dụng. Chạy TikFinity, TikTok LIVE Studio và server demo trên cùng máy. Không mở cổng server ra Internet hoặc chuyển tiếp cổng router: webhook demo không có xác thực.

## Tài liệu tham khảo

- [TikFinity: hướng dẫn thiết lập TikTok LIVE](https://blog.tikfinity.com/tikfinity-setup/)
- [TikFinity: Actions & Events](https://tikfinity.zerody.one/tiktok/actionsandevents)
- [TikFinity: LIVE Studio/OBS overlays](https://tikfinity.zerody.one/tiktok/obsoverlays)
