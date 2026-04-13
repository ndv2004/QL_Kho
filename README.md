# Inventory & Sales Dashboard

## Chạy dự án

1. Cài đặt:
```bash
npm install
```

2. Tạo file `.env` từ `.env.example` và điền `DATABASE_URL` của Neon PostgreSQL.

3. Tạo bảng và dữ liệu mẫu nếu cần:
```bash
npm run seed
```

4. Khởi động:
```bash
node server.js
```

Mở:
```text
http://localhost:3000
```

## Tài khoản quản lý mẫu

- Username: `admin`
- Password: `admin123`

## Ghi chú

- Ứng dụng tự tạo bảng nếu chưa có.
- Dữ liệu mẫu được tách sang `seed.js`, không tự seed khi server khởi động.
- Người thường có thể xem và tìm kiếm sản phẩm mà không cần đăng nhập.
- Bản này tối ưu tốt hơn cho điện thoại: sidebar gọn, nút dễ bấm, form thoáng, bảng tự chuyển sang card trên mobile, và chi tiết hóa đơn có chế độ xem riêng cho màn hình nhỏ.
- Có thể sửa phiếu nhập kho, sửa hóa đơn, và cập nhật thanh toán ngay trong giao diện quản lý.
- Phần báo cáo có xuất PDF cho báo cáo tháng và báo cáo tổng quan kho/doanh thu.
